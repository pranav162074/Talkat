import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: { message: 'Too many attempts, please try again later' },
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: { message: 'You are sending messages too fast' },
});

// Turning notifications on and off. Browsers do this rarely, so the limit is low.
// Must run after the auth middleware, which sets req.user.
export const subscriptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: { message: 'Too many notification changes, please try again later' },
});

// Profile edits and picture uploads: per user, and deliberately stricter than messaging.
// Must run after the auth middleware, which sets req.user.
export const profileLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: { message: 'Too many profile changes, please try again later' },
});