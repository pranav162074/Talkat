import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/prisma.js';
import { generateToken } from '../src/utils/token.js';
import {
  setupRealtime,
  teardownRealtime,
  closeAll,
  connectAs,
  attempt,
  waitFor,
  collect,
  fixture,
} from './helpers/realtime.js';

beforeAll(setupRealtime);
afterAll(teardownRealtime);
afterEach(closeAll);

describe('socket handshake', () => {
  it('rejects a connection without a token', async () => {
    const { socket, error } = await attempt({});
    expect(socket).toBeUndefined();
    expect(error.message).toBe('Not authorized');
  });

  it('rejects a token that is not valid', async () => {
    const { error } = await attempt({ token: 'not-a-real-token' });
    expect(error.message).toBe('Not authorized');
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ id: fixture.a.id }, 'some-other-secret');
    const { error } = await attempt({ token: forged });
    expect(error.message).toBe('Not authorized');
  });

  it('rejects a token for a user who no longer exists', async () => {
    const ghost = await prisma.user.create({
      data: { name: 'Ghost', email: `rt-ghost-${Date.now()}@example.com`, isEmailVerified: true },
    });
    const token = generateToken(ghost.id);
    await prisma.user.delete({ where: { id: ghost.id } });

    const { error } = await attempt({ token });
    expect(error.message).toBe('Not authorized');
  });

  it('accepts a valid token', async () => {
    const socket = await connectAs('a');
    expect(socket.connected).toBe(true);
  });
});

describe('presence', () => {
  it('sends you the contacts who are already online', async () => {
    const b = await connectAs('b');
    await b.snapshot;

    const a = await connectAs('a');
    expect(await a.snapshot).toEqual([fixture.b.id]);
  });

  it('leaves out people you share no conversation with', async () => {
    // C is online, but B and C have no chat together
    const c = await connectAs('c');
    await c.snapshot;

    const b = await connectAs('b');
    const snapshot = await b.snapshot;
    expect(snapshot).not.toContain(fixture.c.id);
    expect(snapshot).toEqual([]);
  });

  it('tells your contacts when you come online', async () => {
    const b = await connectAs('b');
    await b.snapshot;

    const cameOnline = waitFor(
      b,
      'presence:update',
      (update) => update.userId === fixture.a.id && update.online === true
    );
    await connectAs('a');
    await cameOnline;
  });

  it('tells your contacts when you go offline', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    await Promise.all([a.snapshot, b.snapshot]);

    const wentOffline = waitFor(
      b,
      'presence:update',
      (update) => update.userId === fixture.a.id && update.online === false
    );
    a.close();
    await wentOffline;
  });

  it('does not tell people you share no conversation with', async () => {
    const b = await connectAs('b');
    await b.snapshot;

    // C comes online, but B shares no chat with C
    const heard = collect(b, 'presence:update', 500);
    const c = await connectAs('c');
    await c.snapshot;

    const aboutC = (await heard).filter((update) => update.userId === fixture.c.id);
    expect(aboutC).toHaveLength(0);
  });

  it('counts several tabs as one user', async () => {
    const b = await connectAs('b');
    await b.snapshot;

    const firstOnline = waitFor(
      b,
      'presence:update',
      (update) => update.userId === fixture.a.id && update.online === true
    );
    const tab1 = await connectAs('a');
    await firstOnline;
    await tab1.snapshot;

    // A second tab does not announce "online" again
    const announced = collect(b, 'presence:update', 500);
    const tab2 = await connectAs('a');
    await tab2.snapshot;
    expect((await announced).filter((update) => update.userId === fixture.a.id)).toHaveLength(0);

    // Closing one tab keeps A online
    const afterFirstClose = collect(b, 'presence:update', 600);
    tab1.close();
    const offlineEarly = (await afterFirstClose).filter(
      (update) => update.userId === fixture.a.id && update.online === false
    );
    expect(offlineEarly).toHaveLength(0);

    // Closing the last tab takes A offline
    const wentOffline = waitFor(
      b,
      'presence:update',
      (update) => update.userId === fixture.a.id && update.online === false
    );
    tab2.close();
    await wentOffline;
  });
});