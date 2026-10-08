import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import redis from '../config/redis.js';
import { sendOtpEmail } from './emailService.js';

const OTP_TTL = 5 * 60; // seconds
const COOLDOWN = 60; // seconds between sends
const MAX_ATTEMPTS = 5;

const keys = (email, purpose) => ({
  code: `otp:${email}:${purpose}`,
  attempts: `otp-attempts:${email}:${purpose}`,
  cooldown: `otp-cooldown:${email}:${purpose}`,
});

// Returns the seconds to wait if sent too recently, otherwise sends and returns 0
export const sendOtp = async (user, purpose = 'signup') => {
  const k = keys(user.email, purpose);

  const ttl = await redis.ttl(k.cooldown);
  if (ttl > 0) return ttl;

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const hash = await bcrypt.hash(code, 8);

  await redis
    .multi()
    .set(k.code, hash, 'EX', OTP_TTL)
    .del(k.attempts)
    .set(k.cooldown, '1', 'EX', COOLDOWN)
    .exec();

  await sendOtpEmail(user.email, user.name, code);
  return 0;
};

// Returns 'ok' | 'invalid' | 'expired' | 'locked'
export const verifyOtp = async (email, code, purpose = 'signup') => {
  const k = keys(email, purpose);

  const hash = await redis.get(k.code);
  if (!hash) return 'expired';

  const attempts = await redis.incr(k.attempts);
  if (attempts === 1) await redis.expire(k.attempts, OTP_TTL);
  if (attempts > MAX_ATTEMPTS) {
    await redis.del(k.code, k.attempts);
    return 'locked';
  }

  const valid = await bcrypt.compare(code, hash);
  if (!valid) return 'invalid';

  await redis.del(k.code, k.attempts, k.cooldown);
  return 'ok';
};