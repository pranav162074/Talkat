import http from 'http';
import env from './config/env.js';
import app from './app.js';
import prisma from './config/prisma.js';
import redis from './config/redis.js';

const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`Talkat server running on port ${env.port}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));