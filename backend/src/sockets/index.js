import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import prisma from '../config/prisma.js';
import redis from '../config/redis.js';
import registerHandlers from './handlers.js';

// With a single instance there are no live sockets at startup,
// so any presence left over from a crash is stale
const clearPresence = async () => {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'presence:*', 'COUNT', 100);
    if (keys.length > 0) await redis.del(...keys);
    cursor = next;
  } while (cursor !== '0');
};

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
  });

  if (env.useRedisAdapter) {
    // The adapter needs two dedicated connections: one to publish, one to subscribe
    io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
    console.log('Socket.io Redis adapter enabled');
  } else {
    clearPresence().catch((error) => console.error('Presence cleanup failed:', error.message));
  }

  // Authenticate the handshake and pre-load the user's conversations
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Not authorized'));

      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true },
      });
      if (!user) return next(new Error('Not authorized'));

      const memberships = await prisma.conversationParticipant.findMany({
        where: { userId: user.id },
        select: {
          conversationId: true,
          conversation: { select: { participants: { select: { userId: true } } } },
        },
      });

      socket.data.user = user;
      socket.data.conversationIds = memberships.map((m) => m.conversationId);
      socket.data.contactIds = [
        ...new Set(memberships.flatMap((m) => m.conversation.participants.map((p) => p.userId))),
      ].filter((id) => id !== user.id);

      next();
    } catch (error) {
      next(new Error('Not authorized'));
    }
  });

  io.on('connection', (socket) => registerHandlers(io, socket));

  return io;
};