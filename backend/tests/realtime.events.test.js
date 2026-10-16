import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
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

// How long to listen when proving that something did NOT arrive
const QUIET = 1000;

// REST calls go to the same app, and so to the same Socket.io server, as the sockets
const call = (method, path, as, body) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${fixture.tokens[as]}`);
  return body ? req.send(body) : req;
};

const ids = (...names) => names.map((name) => fixture[name].id);

const createGroup = async (creator, members, name) => {
  const res = await call('post', '/api/conversations/group', creator, {
    name,
    memberIds: ids(...members),
  });
  expect(res.status).toBe(201);
  return res.body.conversation.id;
};

const sayInGroup = (conversationId, as, content) =>
  call('post', `/api/conversations/${conversationId}/messages`, as, { type: 'TEXT', content });

describe('messages and read receipts sent over HTTP', () => {
  it('reaches the live sockets in that conversation, and nobody else', async () => {
    const b = await connectAs('b');
    const c = await connectAs('c'); // C is not in the A-B conversation

    const toB = waitFor(b, 'message:new', (m) => m.content === 'sent over http');
    const toC = collect(c, 'message:new', QUIET);
    const res = await call('post', `/api/conversations/${fixture.ab.id}/messages`, 'a', {
      type: 'TEXT',
      content: 'sent over http',
    });

    expect(res.status).toBe(201);
    expect((await toB).id).toBe(res.body.message.id);
    expect((await toC).filter((m) => m.conversationId === fixture.ab.id)).toHaveLength(0);
  });

  it('notifies the conversation when someone marks it as read', async () => {
    const a = await connectAs('a');
    const sent = await call('post', `/api/conversations/${fixture.ab.id}/messages`, 'a', {
      type: 'TEXT',
      content: 'read me over http',
    });

    const receipt = waitFor(
      a,
      'conversation:read',
      (r) => r.userId === fixture.b.id && r.conversationId === fixture.ab.id
    );
    const res = await call('post', `/api/conversations/${fixture.ab.id}/read`, 'b', {});

    expect(res.status).toBe(200);
    expect(res.body.lastReadMessageId).toBe(sent.body.message.id);
    expect((await receipt).lastReadMessageId).toBe(sent.body.message.id);
  });
});

describe('groups', () => {
  it('tells the members at once and puts their open sockets into the room', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const c = await connectAs('c');

    const toA = waitFor(a, 'conversation:new', (conv) => conv.name === 'Live Group');
    const toB = waitFor(b, 'conversation:new', (conv) => conv.name === 'Live Group');
    const toC = collect(c, 'conversation:new', QUIET);
    const groupId = await createGroup('a', ['b'], 'Live Group');

    const forB = await toB;
    expect(forB.id).toBe(groupId);
    expect(forB.type).toBe('GROUP');
    expect(forB.participants).toHaveLength(2);
    expect((await toA).id).toBe(groupId);
    expect((await toC).filter((conv) => conv.id === groupId)).toHaveLength(0);

    // B never reconnected, but is now in the room, so messages arrive live
    const live = waitFor(b, 'message:new', (m) => m.conversationId === groupId);
    const heardByC = collect(c, 'message:new', QUIET);
    await sayInGroup(groupId, 'a', 'hello group');

    expect((await live).content).toBe('hello group');
    expect((await heardByC).filter((m) => m.conversationId === groupId)).toHaveLength(0);
  });

  it('puts an added member into the room and tells the whole group', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const c = await connectAs('c');

    const bGotGroup = waitFor(b, 'conversation:new', (conv) => conv.name === 'Add Group');
    const groupId = await createGroup('a', ['b'], 'Add Group');
    await bGotGroup;

    const newForC = waitFor(c, 'conversation:new', (conv) => conv.id === groupId);
    const changedForB = waitFor(b, 'conversation:members-changed', (e) => e.conversationId === groupId);
    const changedForC = waitFor(c, 'conversation:members-changed', (e) => e.conversationId === groupId);
    const renotifiedB = collect(b, 'conversation:new', QUIET);

    // B is already a member, so only C counts as new
    const res = await call('post', `/api/conversations/${groupId}/participants`, 'a', {
      userIds: ids('b', 'c'),
    });

    expect(res.status).toBe(200);
    expect(res.body.conversation.participants).toHaveLength(3);
    expect((await newForC).participants).toHaveLength(3);
    await changedForB;
    await changedForC;
    expect((await renotifiedB).filter((conv) => conv.id === groupId)).toHaveLength(0);

    // C was added live, with no reconnect, and now receives the group's messages
    const live = waitFor(c, 'message:new', (m) => m.conversationId === groupId);
    await sayInGroup(groupId, 'a', 'welcome C');
    expect((await live).content).toBe('welcome C');
    expect(a.connected).toBe(true);
  });

  it('removes a member from the room and tells the rest', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const c = await connectAs('c');
    const groupId = await createGroup('a', ['b', 'c'], 'Remove Group');

    const removedB = waitFor(b, 'conversation:removed', (e) => e.conversationId === groupId);
    const changedA = waitFor(a, 'conversation:members-changed', (e) => e.conversationId === groupId);
    const changedC = waitFor(c, 'conversation:members-changed', (e) => e.conversationId === groupId);
    const staleB = collect(b, 'conversation:members-changed', QUIET);

    const res = await call('delete', `/api/conversations/${groupId}/participants/${fixture.b.id}`, 'a');

    expect(res.status).toBe(204);
    await removedB;
    await changedA;
    await changedC;
    // B left the room before the group was told, so B hears nothing about it
    expect((await staleB).filter((e) => e.conversationId === groupId)).toHaveLength(0);

    // From now on B gets none of the group's messages, and can't send into it
    const toC = waitFor(c, 'message:new', (m) => m.conversationId === groupId);
    const toB = collect(b, 'message:new', QUIET);
    await sayInGroup(groupId, 'a', 'after removal');

    expect((await toC).content).toBe('after removal');
    expect((await toB).filter((m) => m.conversationId === groupId)).toHaveLength(0);

    const ack = await emitAck(b, 'message:send', {
      conversationId: groupId,
      type: 'TEXT',
      content: 'still here?',
    });
    expect(ack).toEqual({ ok: false, error: 'Conversation not found' });
  });

  it('lets a member leave and tells the others', async () => {
    const a = await connectAs('a');
    const b = await connectAs('b');
    const groupId = await createGroup('a', ['b'], 'Leave Group');

    const removedB = waitFor(b, 'conversation:removed', (e) => e.conversationId === groupId);
    const changedA = waitFor(a, 'conversation:members-changed', (e) => e.conversationId === groupId);

    const res = await call('delete', `/api/conversations/${groupId}/participants/${fixture.b.id}`, 'b');

    expect(res.status).toBe(204);
    await removedB;
    await changedA;
  });

  it('deletes the group when the last member leaves', async () => {
    const a = await connectAs('a');
    const groupId = await createGroup('a', ['b'], 'Last Group');

    const first = await call('delete', `/api/conversations/${groupId}/participants/${fixture.b.id}`, 'b');
    expect(first.status).toBe(204);

    const removedA = waitFor(a, 'conversation:removed', (e) => e.conversationId === groupId);
    const last = await call('delete', `/api/conversations/${groupId}/participants/${fixture.a.id}`, 'a');

    expect(last.status).toBe(204);
    await removedA;
    expect(await prisma.conversation.findUnique({ where: { id: groupId } })).toBeNull();
  });
});

// Last on purpose: it gives B and C a direct chat, which the tests above rely on not existing
describe('direct conversations', () => {
  it('announces a new chat to both users, and not again when it is reopened', async () => {
    const b = await connectAs('b');
    const c = await connectAs('c');

    const toB = waitFor(
      b,
      'conversation:new',
      (conv) => conv.type === 'DIRECT' && conv.participants.some((p) => p.id === fixture.c.id)
    );
    const toC = waitFor(
      c,
      'conversation:new',
      (conv) => conv.type === 'DIRECT' && conv.participants.some((p) => p.id === fixture.b.id)
    );
    const created = await call('post', '/api/conversations/direct', 'b', { userId: fixture.c.id });

    expect(created.status).toBe(201);
    const conversationId = created.body.conversation.id;
    expect((await toB).id).toBe(conversationId);
    expect((await toC).id).toBe(conversationId);

    // Both sockets were already connected, and are now in the new room
    const live = waitFor(c, 'message:new', (m) => m.conversationId === conversationId);
    await sayInGroup(conversationId, 'b', 'first message');
    expect((await live).content).toBe('first message');

    // Opening the same chat again returns it, without announcing it a second time
    const againForB = collect(b, 'conversation:new', QUIET);
    const againForC = collect(c, 'conversation:new', QUIET);
    const reopened = await call('post', '/api/conversations/direct', 'c', { userId: fixture.b.id });

    expect(reopened.status).toBe(200);
    expect(reopened.body.conversation.id).toBe(conversationId);
    expect((await againForB).filter((conv) => conv.id === conversationId)).toHaveLength(0);
    expect((await againForC).filter((conv) => conv.id === conversationId)).toHaveLength(0);
  });
});