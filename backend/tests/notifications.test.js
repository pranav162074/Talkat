import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import env from '../src/config/env.js';
import prisma from '../src/config/prisma.js';
import redis from '../src/config/redis.js';
import { buildPayload, MAX_SUBSCRIPTIONS_PER_USER } from '../src/services/pushService.js';
import {
  setupRealtime,
  teardownRealtime,
  closeAll,
  connectAs,
  emitAck,
  sleep,
  fixture,
} from './helpers/realtime.js';

// Nothing is really sent: web-push is replaced by a mock that records every call
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification } }));

beforeAll(setupRealtime);
afterAll(teardownRealtime);
afterEach(async () => {
  sendNotification.mockReset();
  env.pushEnabled = true;
  await closeAll();
  await prisma.pushSubscription.deleteMany({
    where: { userId: { in: [fixture.a.id, fixture.b.id, fixture.c.id] } },
  });
});

const auth = (name) => ({ Authorization: `Bearer ${fixture.tokens[name]}` });
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

let counter = 0;
const newEndpoint = (label = 'device') =>
  `https://fcm.googleapis.com/fcm/send/${label}-${Date.now()}-${(counter += 1)}`;

const subscribe = (name, endpoint, keys = { p256dh: P256DH, auth: AUTH }) =>
  request(app).post('/api/notifications/subscriptions').set(auth(name)).send({ endpoint, keys });

const subscribed = async (name, label) => {
  const endpoint = newEndpoint(label);
  expect((await subscribe(name, endpoint)).status).toBe(201);
  return endpoint;
};

const sendRest = async (name, conversationId, content) => {
  const res = await request(app)
    .post(`/api/conversations/${conversationId}/messages`)
    .set(auth(name))
    .send({ type: 'TEXT', content });
  expect(res.status).toBe(201);
  return res.body.message;
};

// Every push made for one message, so a push still finishing from an earlier test can't
// confuse this one
const pushesFor = (messageId) =>
  sendNotification.mock.calls
    .map(([subscription, payload, options]) => ({ subscription, payload: JSON.parse(payload), options }))
    .filter((call) => call.payload.messageId === messageId);

const endpointsFor = (messageId) => pushesFor(messageId).map((call) => call.subscription.endpoint);

const waitForVisible = async (user, count) => {
  await vi.waitFor(async () => expect(await redis.scard(`visible:${user.id}`)).toBe(count));
};

describe('notification config', () => {
  it('gives logged-in users the public key', async () => {
    const res = await request(app).get('/api/notifications/config').set(auth('a'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, publicKey: env.vapidPublicKey });
  });

  it('needs a login', async () => {
    expect((await request(app).get('/api/notifications/config')).status).toBe(401);
    expect((await request(app).post('/api/notifications/subscriptions').send({})).status).toBe(401);
    expect((await request(app).delete('/api/notifications/subscriptions').send({})).status).toBe(401);
  });

  it('reports when push is not set up, and refuses subscriptions', async () => {
    env.pushEnabled = false;
    const config = await request(app).get('/api/notifications/config').set(auth('a'));
    expect(config.body).toEqual({ enabled: false, publicKey: null });
    expect((await subscribe('a', newEndpoint())).status).toBe(503);
  });
});

describe('subscribing', () => {
  it('saves a subscription once, and updates its keys when the browser sends it again', async () => {
    const endpoint = await subscribed('a');
    const newKeys = { p256dh: `${P256DH.slice(0, -4)}AAAA`, auth: 'bmV3LWF1dGgta2V5LTEyMw' };
    expect((await subscribe('a', endpoint, newKeys)).status).toBe(201);

    const rows = await prisma.pushSubscription.findMany({ where: { endpoint } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: fixture.a.id, ...newKeys });
  });

  it('moves a browser to whoever logged in on it last', async () => {
    const endpoint = await subscribed('a');
    expect((await subscribe('b', endpoint)).status).toBe(201);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    expect(row.userId).toBe(fixture.b.id);
  });

  it('only accepts real push services over https', async () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://evil.example.com/collect',
      'https://fcm.googleapis.com.evil.example.com/x',
      'https://localhost:5432/',
      'https://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      const res = await subscribe('a', endpoint);
      expect(res.status, endpoint).toBe(400);
    }
    for (const endpoint of [
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc',
    ]) {
      expect((await subscribe('a', endpoint)).status, endpoint).toBe(201);
    }
  });

  it('rejects missing or malformed keys', async () => {
    for (const keys of [undefined, {}, { p256dh: P256DH }, { p256dh: 'has spaces!', auth: AUTH }]) {
      const res = await request(app)
        .post('/api/notifications/subscriptions')
        .set(auth('a'))
        .send({ endpoint: newEndpoint(), keys });
      expect(res.status, JSON.stringify(keys)).toBe(400);
    }
  });

  it(`keeps only the newest ${MAX_SUBSCRIPTIONS_PER_USER} browsers per person`, async () => {
    const endpoints = [];
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER + 2; i += 1) {
      endpoints.push(await subscribed('a', `cap${i}`));
      await sleep(5); // distinct updatedAt values
    }

    const rows = await prisma.pushSubscription.findMany({ where: { userId: fixture.a.id } });
    expect(rows).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER);
    const kept = rows.map((r) => r.endpoint);
    expect(kept).not.toContain(endpoints[0]);
    expect(kept).not.toContain(endpoints[1]);
    expect(kept).toContain(endpoints.at(-1));
  });

  it("turns off your own browser, never someone else's", async () => {
    const mine = await subscribed('a');
    const theirs = await subscribed('b');
    const remove = (endpoint) =>
      request(app).delete('/api/notifications/subscriptions').set(auth('a')).send({ endpoint });

    expect((await remove(theirs)).status).toBe(204);
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: theirs } })).not.toBeNull();

    expect((await remove(mine)).status).toBe(204);
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: mine } })).toBeNull();
    expect((await remove(mine)).status).toBe(204); // turning off twice is fine
  });
});

describe('who gets a push', () => {
  it('pushes to the offline recipient, never to the sender or outsiders', async () => {
    const bobPhone = await subscribed('b', 'bob-phone');
    const bobLaptop = await subscribed('b', 'bob-laptop');
    await subscribed('a', 'alice');
    await subscribed('c', 'carol');

    const message = await sendRest('a', fixture.ab.id, 'are you there?');

    await vi.waitFor(() => expect(endpointsFor(message.id)).toHaveLength(2));
    expect(endpointsFor(message.id).sort()).toEqual([bobLaptop, bobPhone].sort());

    const [{ payload, options }] = pushesFor(message.id);
    expect(payload).toMatchObject({
      title: 'Alice RT',
      body: 'are you there?',
      conversationId: fixture.ab.id,
      url: `/?c=${fixture.ab.id}`,
    });
    expect(options).toMatchObject({ TTL: 86400, urgency: 'high' });
    expect(options.topic).toBe(fixture.ab.id.replaceAll('-', ''));
    expect(options.vapidDetails.publicKey).toBe(env.vapidPublicKey);
  });

  it('also pushes for messages sent over the socket', async () => {
    const bob = await subscribed('b');
    const alice = await connectAs('a');

    const ack = await emitAck(alice, 'message:send', {
      conversationId: fixture.ab.id,
      type: 'TEXT',
      content: 'socket hello',
    });
    expect(ack.ok).toBe(true);

    await vi.waitFor(() => expect(endpointsFor(ack.message.id)).toEqual([bob]));
  });

  it('skips people who have Talkat on screen, but not people who are connected in the background', async () => {
    const bob = await subscribed('b', 'bob');
    const carol = await subscribed('c', 'carol');

    const group = await request(app)
      .post('/api/conversations/group')
      .set(auth('a'))
      .send({ name: 'Weekend plans', memberIds: [fixture.b.id, fixture.c.id] });
    expect(group.status).toBe(201);
    const groupId = group.body.conversation.id;

    // Bob is looking at the app. Carol is connected, but her tab is in the background.
    const bobSocket = await connectAs('b');
    await connectAs('c');
    bobSocket.emit('presence:visibility', { visible: true });
    await waitForVisible(fixture.b, 1);

    const message = await sendRest('a', groupId, 'pizza tonight?');

    await vi.waitFor(() => expect(endpointsFor(message.id)).toContain(carol));
    expect(endpointsFor(message.id)).not.toContain(bob);
    expect(pushesFor(message.id)[0].payload).toMatchObject({
      title: 'Weekend plans',
      body: 'Alice RT: pizza tonight?',
    });

    // Bob switches to another app: from now on he gets pushes too
    bobSocket.emit('presence:visibility', { visible: false });
    await waitForVisible(fixture.b, 0);

    const next = await sendRest('a', groupId, 'last call');
    await vi.waitFor(() => expect(endpointsFor(next.id).sort()).toEqual([bob, carol].sort()));
  });

  it('forgets a visible tab once it disconnects', async () => {
    const bobSocket = await connectAs('b');
    bobSocket.emit('presence:visibility', { visible: true });
    await waitForVisible(fixture.b, 1);

    await closeAll();
    expect(await redis.scard(`visible:${fixture.b.id}`)).toBe(0);
  });

  it('removes subscriptions the push service says are gone, and keeps ones that hit a temporary error', async () => {
    const gone = await subscribed('b', 'gone');
    const flaky = await subscribed('b', 'flaky');
    sendNotification.mockImplementation(async ({ endpoint }) => {
      const error = new Error('push service said no');
      error.statusCode = endpoint === gone ? 410 : 500;
      throw error;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendRest('a', fixture.ab.id, 'anyone?');

    await vi.waitFor(async () =>
      expect(await prisma.pushSubscription.findUnique({ where: { endpoint: gone } })).toBeNull()
    );
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: flaky } })).not.toBeNull();
    logged.mockRestore();
  });

  it('sends nothing when push is not set up', async () => {
    await subscribed('b');
    env.pushEnabled = false;

    const message = await sendRest('a', fixture.ab.id, 'quiet');
    await sleep(300);
    expect(pushesFor(message.id)).toHaveLength(0);
  });
});

describe('notification text', () => {
  const direct = { type: 'DIRECT', name: null };
  const base = { id: 'm1', conversationId: 'c1', sender: { name: 'Alice', avatar: null } };

  it('describes attachments and locations instead of showing empty text', () => {
    expect(buildPayload(direct, { ...base, type: 'IMAGE' }).body).toBe('📷 Photo');
    expect(buildPayload(direct, { ...base, type: 'AUDIO' }).body).toBe('🎤 Voice message');
    expect(buildPayload(direct, { ...base, type: 'FILE', attachmentName: 'notes.pdf' }).body).toBe('📎 notes.pdf');
    expect(buildPayload(direct, { ...base, type: 'LOCATION' }).body).toBe('📍 Location');
  });

  it('cuts long messages to 100 characters', () => {
    const body = buildPayload(direct, { ...base, type: 'TEXT', content: 'x'.repeat(500) }).body;
    expect(body).toHaveLength(100);
    expect(body.endsWith('…')).toBe(true);
  });
});
