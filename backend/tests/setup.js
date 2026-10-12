import { vi } from 'vitest';

// Safety guard: tests create and delete data, so they may only run against a
// local or CI database, never against Neon or Upstash
const isSafeUrl = (url) => /@(localhost|127\.0\.0\.1|postgres|redis)\b/.test(url || '');

for (const key of ['DATABASE_URL', 'DIRECT_URL', 'REDIS_URL']) {
  if (!process.env[key]) {
    throw new Error(`${key} is not set. Tests run in CI, which provides Postgres and Redis.`);
  }
  if (!isSafeUrl(process.env[key])) {
    throw new Error(`Refusing to run tests: ${key} does not point at a local or CI service.`);
  }
}

// Capture OTP emails in memory so tests can read the code instead of sending mail
vi.mock('../src/services/emailService.js', () => ({
  sendOtpEmail: vi.fn(async () => {}),
}));