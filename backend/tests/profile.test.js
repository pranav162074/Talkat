import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';
import redis from '../src/config/redis.js';
import { generateToken } from '../src/utils/token.js';
import { uploadAvatar, deleteAvatar } from '../src/services/uploadService.js';

// Tests must never call Cloudinary, so only the avatar functions are replaced
vi.mock('../src/services/uploadService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadAvatar: vi.fn(async () => ({ secure_url: 'https://res.cloudinary.com/test/avatar.png' })),
  deleteAvatar: vi.fn(async () => ({ result: 'ok' })),
}));

const email = `profile-test-${Date.now()}@example.com`;
let user;
let token;

const auth = () => ({ Authorization: `Bearer ${token}` });
const png = Buffer.from('not-a-real-image-but-the-upload-is-mocked');

beforeAll(async () => {
  user = await prisma.user.create({
    data: { name: 'Profile Tester', email, isEmailVerified: true },
  });
  token = generateToken(user.id);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('profile', () => {
  it('requires a login', async () => {
    const res = await request(app).patch('/api/users/me').send({ bio: 'hi' });
    expect(res.status).toBe(401);
  });

  it('gives new users the default tagline and no bio', async () => {
    const res = await request(app).get('/api/auth/me').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.user.tagline).toBe("Hey! I'm on Talkat");
    expect(res.body.user.bio).toBeNull();
  });

  it('updates the bio and tagline without touching the name', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set(auth())
      .send({ bio: '  Love chatting about code  ', tagline: 'Busy building' });

    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe('Love chatting about code'); // trimmed
    expect(res.body.user.tagline).toBe('Busy building');
    expect(res.body.user.name).toBe('Profile Tester');
    expect(res.body.user.password).toBeUndefined();
  });

  it('clears the bio when it is sent empty', async () => {
    const res = await request(app).patch('/api/users/me').set(auth()).send({ bio: '' });
    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBeNull();
  });

  it('rejects invalid input', async () => {
    const tooLong = await request(app)
      .patch('/api/users/me')
      .set(auth())
      .send({ bio: 'x'.repeat(201) });
    expect(tooLong.status).toBe(400);

    const emptyTagline = await request(app)
      .patch('/api/users/me')
      .set(auth())
      .send({ tagline: '   ' });
    expect(emptyTagline.status).toBe(400);

    const nothing = await request(app).patch('/api/users/me').set(auth()).send({});
    expect(nothing.status).toBe(400);
  });
});

describe('profile picture', () => {
  it('uploads a picture and saves its URL', async () => {
    const res = await request(app)
      .post('/api/users/me/avatar')
      .set(auth())
      .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.user.avatar).toBe('https://res.cloudinary.com/test/avatar.png');
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(uploadAvatar.mock.calls[0][1]).toBe(user.id);
  });

  it('rejects files that are not images', async () => {
    const res = await request(app)
      .post('/api/users/me/avatar')
      .set(auth())
      .attach('avatar', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects a request with no file', async () => {
    const res = await request(app)
      .post('/api/users/me/avatar')
      .set(auth())
      .field('note', 'no file here');
    expect(res.status).toBe(400);
  });

  it('removes the picture', async () => {
    const res = await request(app).delete('/api/users/me/avatar').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.user.avatar).toBeNull();
    expect(deleteAvatar).toHaveBeenCalledWith(user.id);
  });
});