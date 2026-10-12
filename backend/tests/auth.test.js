import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';
import redis from '../src/config/redis.js';
import { sendOtpEmail } from '../src/services/emailService.js';

const email = `auth-test-${Date.now()}@example.com`;
const password = 'password123';

// The mocked email service receives (email, name, code), so the code is the third argument
const lastCodeFor = (to) => {
  const calls = sendOtpEmail.mock.calls.filter((call) => call[0] === to);
  return calls[calls.length - 1]?.[2];
};

const clearRedis = () =>
  redis.del(
    `otp:${email}:signup`,
    `otp-attempts:${email}:signup`,
    `otp-cooldown:${email}:signup`
  );

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await clearRedis();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await clearRedis();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('auth flow', () => {
  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Tester', email, password: 'abc' });
    expect(res.status).toBe(400);
  });

  it('registers without issuing a token and sends a code', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Tester', email, password });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(lastCodeFor(email)).toMatch(/^\d{6}$/);
  });

  it('blocks login until the email is verified', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.needsVerification).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('verifies with the right code and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, code: lastCodeFor(email) });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.isEmailVerified).toBe(true);
    expect(res.body.user.password).toBeUndefined();
  });

  it('logs in after verification', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('protects /me without a token and serves it with one', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email, password });
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
});