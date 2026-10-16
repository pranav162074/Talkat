import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import prisma from '../src/config/prisma.js';
import {
  setupRealtime,
  teardownRealtime,
  closeAll,
  connectAs,
  waitFor,
  collect,
  emitAck,
  fixture,
} from './helpers/realtime.js';

beforeAll(setupRealtime);
afterAll(teardownRealtime);
afterEach(closeAll);

const send = (socket, conversationId, fields) =>
  emitAck(socket, 'message:send', { conversationId, ...fields });

const readMarker = (userId, conversationId) =>
  prisma.conversationParticipant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
  });

describe('sending messages', () => {
  it('delivers a text message to everyone in the conversation, sender included', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const toB = waitFor(b, 'message:new', (m) => m.content === 'hello over socket');
    const toA = waitFor(a, 'message:new', (m) => m.content === 'hello over socket');

    const ack = await send(a, fixture.ab.id, { type: 'TEXT', content: 'hello over socket' });

    expect(ack.ok).toBe(true);
    expect(ack.message.senderId).toBe(fixture.a.id);
    expect(ack.message.sender.name).toBe('Alice RT');
    expect((await toB).id).toBe(ack.message.id);
    expect((await toA).id).toBe(ack.message.id);
    expect(await prisma.message.findUnique({ where: { id: ack.message.id } })).not.toBeNull();
  });

  it('does not deliver to people outside the conversation', async () => {
    const a = await connectAs('a');
    const c = await connectAs('c');

    const heard = collect(c, 'message:new', 600);
    const ack = await send(a, fixture.ab.id, { type: 'TEXT', content: 'private' });

    expect(ack.ok).toBe(true);
    const leaked = (await heard).filter((m) => m.conversationId === fixture.ab.id);
    expect(leaked).toHaveLength(0);
  });

  it('delivers location messages', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const toB = waitFor(b, 'message:new', (m) => m.type === 'LOCATION');

    const ack = await send(a, fixture.ab.id, { type: 'LOCATION', latitude: 15.83, longitude: 78.04 });

    expect(ack.ok).toBe(true);
    expect(ack.message.latitude).toBe(15.83);
    const received = await toB;
    expect(received.longitude).toBe(78.04);
  });

  it('still delivers when the client sends no acknowledgement callback', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const arrived = waitFor(b, 'message:new', (m) => m.content === 'no callback');

    a.emit('message:send', { conversationId: fixture.ab.id, type: 'TEXT', content: 'no callback' });

    expect((await arrived).senderId).toBe(fixture.a.id);
  });

  it('rejects invalid payloads', async () => {
    const a = await connectAs('a');

    const blank = await send(a, fixture.ab.id, { type: 'TEXT', content: '   ' });
    expect(blank).toEqual({ ok: false, error: 'Message cannot be empty' });

    const badConversation = await emitAck(a, 'message:send', {
      conversationId: 123,
      type: 'TEXT',
      content: 'hi',
    });
    expect(badConversation).toEqual({ ok: false, error: 'Invalid conversation' });

    const missing = await emitAck(a, 'message:send', undefined);
    expect(missing).toEqual({ ok: false, error: 'Invalid conversation' });

    const unsupportedType = await send(a, fixture.ab.id, { type: 'IMAGE', content: 'x' });
    expect(unsupportedType.ok).toBe(false);

    const badLatitude = await send(a, fixture.ab.id, {
      type: 'LOCATION',
      latitude: 200,
      longitude: 10,
    });
    expect(badLatitude.ok).toBe(false);
  });

  it('refuses to send into a conversation you are not in', async () => {
    const b = await connectAs('b');
    const c = await connectAs('c');

    const heard = collect(b, 'message:new', 600);
    const ack = await send(c, fixture.ab.id, { type: 'TEXT', content: 'let me in' });

    expect(ack).toEqual({ ok: false, error: 'Conversation not found' });
    expect(await heard).toHaveLength(0);
    expect(await prisma.message.count({ where: { content: 'let me in' } })).toBe(0);
  });
});

describe('typing indicators', () => {
  it('shows typing to the others in the conversation, but not back to the sender', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');

    const toB = waitFor(b, 'typing', (t) => t.conversationId === fixture.ab.id);
    const echoToA = collect(a, 'typing', 500);
    a.emit('typing', { conversationId: fixture.ab.id, isTyping: true });

    expect(await toB).toEqual({
      conversationId: fixture.ab.id,
      userId: fixture.a.id,
      isTyping: true,
    });
    expect(await echoToA).toHaveLength(0);
  });

  it('passes on the stopped state', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');

    const toB = waitFor(b, 'typing', (t) => t.isTyping === false);
    a.emit('typing', { conversationId: fixture.ab.id, isTyping: false });

    expect((await toB).userId).toBe(fixture.a.id);
  });

  it('ignores typing for conversations you are not in', async () => {
    const b = await connectAs('b');
    const c = await connectAs('c');

    const heard = collect(b, 'typing', 500);
    c.emit('typing', { conversationId: fixture.ab.id, isTyping: true });

    expect(await heard).toHaveLength(0);
  });
});

describe('read receipts', () => {
  it('tells the conversation when someone reads, and saves the marker', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const sent = await send(a, fixture.ab.id, { type: 'TEXT', content: 'please read me' });

    const receipt = waitFor(
      a,
      'conversation:read',
      (r) => r.userId === fixture.b.id && r.conversationId === fixture.ab.id
    );
    const ack = await emitAck(b, 'message:read', { conversationId: fixture.ab.id });

    expect(ack.ok).toBe(true);
    expect(ack.lastReadMessageId).toBe(sent.message.id);
    expect((await receipt).lastReadMessageId).toBe(sent.message.id);
    expect((await readMarker(fixture.b.id, fixture.ab.id)).lastReadMessageId).toBe(sent.message.id);
  });

  it('only ever moves the marker forward', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const first = await send(a, fixture.ab.id, { type: 'TEXT', content: 'first' });
    const second = await send(a, fixture.ab.id, { type: 'TEXT', content: 'second' });

    const forward = await emitAck(b, 'message:read', {
      conversationId: fixture.ab.id,
      messageId: second.message.id,
    });
    expect(forward.lastReadMessageId).toBe(second.message.id);

    const backward = await emitAck(b, 'message:read', {
      conversationId: fixture.ab.id,
      messageId: first.message.id,
    });
    expect(backward.lastReadMessageId).toBe(second.message.id);
    expect((await readMarker(fixture.b.id, fixture.ab.id)).lastReadMessageId).toBe(
      second.message.id
    );
  });

  it('does not let a non-member mark a conversation as read', async () => {
    const c = await connectAs('c');
    const ack = await emitAck(c, 'message:read', { conversationId: fixture.ab.id });
    expect(ack).toEqual({ ok: false, error: 'Conversation not found' });
  });

  it('rejects a malformed message id', async () => {
    const b = await connectAs('b');
    const ack = await emitAck(b, 'message:read', {
      conversationId: fixture.ab.id,
      messageId: 'not-a-uuid',
    });
    expect(ack).toEqual({ ok: false, error: 'Invalid request' });
  });
});

// Last on purpose: this one sends a lot of messages, and it uses the A-C conversation
// so it cannot disturb the tests above
describe('send rate limit', () => {
  it(
    'stops a connection that sends too fast, and stores nothing extra',
    { timeout: 40000 },
    async () => {
      const a = await connectAs('a');

      for (let i = 0; i < 60; i += 1) {
        const ack = await send(a, fixture.ac.id, { type: 'TEXT', content: `burst ${i}` });
        expect(ack.ok, `message ${i} should be accepted`).toBe(true);
      }

      const blocked = await send(a, fixture.ac.id, { type: 'TEXT', content: 'one too many' });
      expect(blocked).toEqual({ ok: false, error: 'You are sending messages too fast' });
      expect(await prisma.message.count({ where: { conversationId: fixture.ac.id } })).toBe(60);
    }
  );
});