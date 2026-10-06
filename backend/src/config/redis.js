import Redis from 'ioredis';
import env from './env.js';

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));

export default redis;