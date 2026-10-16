import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';
import redis from '../src/config/redis.js';
import { generateToken } from '../src/utils/token.js';

const stamp = Date.now();
const emails = [`pub-a-${stamp}@example.com`, `pub-b-${stamp}@example.com`, `pub-c-${stamp}@example.com`];

let a, b, c; // a and b share a chat, c is a stranger to both
let tokenA;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  [a, b, c] = await Promise.all([
    prisma.user.create({
      data: { name: 'Alice Pub', email: emails[0], isEmailVerified: true },
    }),
    prisma.user.create({
      data: {
        name: 'Bob Pub',
        email: emails[1],
        isEmailVerified: true,
        bio: 'Likes maps',
        tagline: 'Out exploring',
      },
    }),
    prisma.user.create({
      data: { name: 'Carol Pub', email: emails[2], isEmailVerified: true },
    }),
  ]);
  tokenA = generateToken(a.id);

  // Alice and Bob share a direct conversation, Carol is in none
  await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      directKey: [a.id, b.id].sort().join('_'),
      participants: { create: [{ userId: a.id }, { userId: b.id }] },
    },
  });
});

afterAll(async () => {
  // Deleting the conversation cascades to its participants
  await prisma.conversation.deleteMany({
    where: { participants: { some: { userId: { in: [a.id, b.id, c.id] } } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('public profiles', () => {
  it('requires a login', async () => {
    const res = await request(app).get(`/api/users/${b.id}`);
    expect(res.status).toBe(401);
  });

  it('lets you view someone you share a conversation with', async () => {
    const res = await request(app).get(`/api/users/${b.id}`).set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Bob Pub');
    expect(res.body.user.bio).toBe('Likes maps');
    expect(res.body.user.tagline).toBe('Out exploring');
  });

  it('never exposes email or other private fields', async () => {
    const res = await request(app).get(`/api/users/${b.id}`).set(auth(tokenA));
    expect(Object.keys(res.body.user).sort()).toEqual(
      ['avatar', 'bio', 'createdAt', 'id', 'name', 'tagline'].sort()
    );
  });

  it('lets you view yourself', async () => {
    const res = await request(app).get(`/api/users/${a.id}`).set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Alice Pub');
  });

  it('hides people you share no conversation with', async () => {
    const res = await request(app).get(`/api/users/${c.id}`).set(auth(tokenA));
    expect(res.status).toBe(404);
  });

  it('gives the same 404 for unknown and malformed ids', async () => {
    const unknown = await request(app)
      .get('/api/users/00000000-0000-4000-8000-000000000000')
      .set(auth(tokenA));
    expect(unknown.status).toBe(404);

    const malformed = await request(app).get('/api/users/not-a-uuid').set(auth(tokenA));
    expect(malformed.status).toBe(404);
  });

  it('does not break user search, which shares the same path prefix', async () => {
    const res = await request(app).get('/api/users/search?q=Bob Pub').set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});