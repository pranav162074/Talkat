import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';
import redis from '../src/config/redis.js';
import { generateToken } from '../src/utils/token.js';

const stamp = Date.now();
const emails = [`chat-a-${stamp}@example.com`, `chat-b-${stamp}@example.com`, `chat-c-${stamp}@example.com`];

let a, b, c; // users
let tokenA, tokenB, tokenC;
let directId;
const createdConversationIds = [];

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const makeUser = (name, email) =>
  prisma.user.create({ data: { name, email, isEmailVerified: true } });

beforeAll(async () => {
  [a, b, c] = await Promise.all([
    makeUser('Alice Test', emails[0]),
    makeUser('Bob Test', emails[1]),
    makeUser('Carol Test', emails[2]),
  ]);
  tokenA = generateToken(a.id);
  tokenB = generateToken(b.id);
  tokenC = generateToken(c.id);
});

afterAll(async () => {
  // Deleting the conversations cascades to participants and messages
  await prisma.conversation.deleteMany({
    where: { participants: { some: { userId: { in: [a.id, b.id, c.id] } } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  const keys = createdConversationIds.map((id) => `chat:${id}:recent`);
  if (keys.length > 0) await redis.del(...keys);

  await prisma.$disconnect();
  redis.disconnect();
});

describe('direct conversations', () => {
  it('creates a direct chat, then returns the same one for either user', async () => {
    const first = await request(app)
      .post('/api/conversations/direct')
      .set(auth(tokenA))
      .send({ userId: b.id });
    expect(first.status).toBe(201);
    directId = first.body.conversation.id;
    createdConversationIds.push(directId);

    const again = await request(app)
      .post('/api/conversations/direct')
      .set(auth(tokenB))
      .send({ userId: a.id });
    expect(again.status).toBe(200);
    expect(again.body.conversation.id).toBe(directId);
  });

  it("won't let you chat with yourself", async () => {
    const res = await request(app)
      .post('/api/conversations/direct')
      .set(auth(tokenA))
      .send({ userId: a.id });
    expect(res.status).toBe(400);
  });

  it('hides a conversation from non-members with a 404', async () => {
    const res = await request(app).get(`/api/conversations/${directId}`).set(auth(tokenC));
    expect(res.status).toBe(404);
  });
});

describe('messages', () => {
  it('sends text messages and returns them newest first', async () => {
    for (const content of ['one', 'two', 'three']) {
      const res = await request(app)
        .post(`/api/conversations/${directId}/messages`)
        .set(auth(tokenA))
        .send({ type: 'TEXT', content });
      expect(res.status).toBe(201);
    }

    const list = await request(app)
      .get(`/api/conversations/${directId}/messages`)
      .set(auth(tokenB));
    expect(list.status).toBe(200);
    expect(list.body.messages.map((m) => m.content)).toEqual(['three', 'two', 'one']);
    expect(list.body.hasMore).toBe(false);
  });

  it('paginates with a cursor without repeating messages', async () => {
    const page1 = await request(app)
      .get(`/api/conversations/${directId}/messages?limit=2`)
      .set(auth(tokenB));
    expect(page1.body.messages.map((m) => m.content)).toEqual(['three', 'two']);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app)
      .get(`/api/conversations/${directId}/messages?limit=2&cursor=${page1.body.nextCursor}`)
      .set(auth(tokenB));
    expect(page2.body.messages.map((m) => m.content)).toEqual(['one']);
    expect(page2.body.hasMore).toBe(false);
  });

  it('rejects empty messages and non-members', async () => {
    const empty = await request(app)
      .post(`/api/conversations/${directId}/messages`)
      .set(auth(tokenA))
      .send({ type: 'TEXT', content: '   ' });
    expect(empty.status).toBe(400);

    const outsider = await request(app)
      .post(`/api/conversations/${directId}/messages`)
      .set(auth(tokenC))
      .send({ type: 'TEXT', content: 'let me in' });
    expect(outsider.status).toBe(404);
  });

  it('accepts a location message', async () => {
    const res = await request(app)
      .post(`/api/conversations/${directId}/messages`)
      .set(auth(tokenA))
      .send({ type: 'LOCATION', latitude: 15.83, longitude: 78.04 });
    expect(res.status).toBe(201);
    expect(res.body.message.latitude).toBe(15.83);
  });

  it('counts unread messages and clears them when read', async () => {
    const before = await request(app).get('/api/conversations').set(auth(tokenB));
    const unread = before.body.conversations.find((cv) => cv.id === directId).unreadCount;
    expect(unread).toBe(4); // three texts and the location from Alice

    await request(app).post(`/api/conversations/${directId}/read`).set(auth(tokenB)).send({});

    const after = await request(app).get('/api/conversations').set(auth(tokenB));
    expect(after.body.conversations.find((cv) => cv.id === directId).unreadCount).toBe(0);
  });
});

describe('group conversations', () => {
  let groupId;

  it('creates a group where the creator is admin', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(auth(tokenA))
      .send({ name: 'Test Group', memberIds: [b.id] });
    expect(res.status).toBe(201);

    groupId = res.body.conversation.id;
    createdConversationIds.push(groupId);
    const me = res.body.conversation.participants.find((p) => p.id === a.id);
    expect(me.role).toBe('ADMIN');
  });

  it('only lets admins add members', async () => {
    const byMember = await request(app)
      .post(`/api/conversations/${groupId}/participants`)
      .set(auth(tokenB))
      .send({ userIds: [c.id] });
    expect(byMember.status).toBe(403);

    const byAdmin = await request(app)
      .post(`/api/conversations/${groupId}/participants`)
      .set(auth(tokenA))
      .send({ userIds: [c.id] });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.conversation.participants).toHaveLength(3);
  });

  it('promotes another member when the last admin leaves', async () => {
    const leave = await request(app)
      .delete(`/api/conversations/${groupId}/participants/${a.id}`)
      .set(auth(tokenA));
    expect(leave.status).toBe(204);

    const view = await request(app).get(`/api/conversations/${groupId}`).set(auth(tokenB));
    expect(view.body.conversation.participants.some((p) => p.role === 'ADMIN')).toBe(true);
  });
});