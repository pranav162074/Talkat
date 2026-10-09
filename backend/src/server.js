import http from 'http';
import env from './config/env.js';
import app from './app.js';
import prisma from './config/prisma.js';
import redis from './config/redis.js';
import { initSocket } from './sockets/index.js';

const server = http.createServer(app);
const io = initSocket(server);
app.set('io', io); // controllers reach it through req.app.get('io')

server.listen(env.port, () => {
  console.log(`Talkat server running on port ${env.port}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  // io.close() also closes the underlying HTTP server
  io.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));