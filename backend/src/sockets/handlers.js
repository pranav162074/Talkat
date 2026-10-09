import redis from '../config/redis.js';
import { sendMessageSchema, markReadSchema } from '../utils/validators.js';
import { createMessage, getMembership, markRead } from '../services/messageService.js';
import { emitNewMessage, emitRead } from './emitters.js';

const presenceKey = (userId) => `presence:${userId}`;
const conversationRooms = (socket) => [...socket.rooms].filter((room) => room.startsWith('conv:'));

const markOnline = async (socket) => {
  const key = presenceKey(socket.data.user.id);
  const results = await redis.multi().sadd(key, socket.id).expire(key, 86400).scard(key).exec();
  return results[2][1]; // how many sockets (tabs) this user has now
};

const markOffline = async (socket) => {
  const key = presenceKey(socket.data.user.id);
  const results = await redis.multi().srem(key, socket.id).scard(key).exec();
  return results[1][1];
};

const getOnlineContacts = async (userIds) => {
  if (userIds.length === 0) return [];
  const results = await redis.pipeline(userIds.map((id) => ['scard', presenceKey(id)])).exec();
  return userIds.filter((_, i) => results[i][1] > 0);
};

// io.to([]) would broadcast to everyone, so never call it with no rooms
const broadcastPresence = (io, rooms, userId, online) => {
  if (rooms.length === 0) return;
  io.to(rooms).emit('presence:update', { userId, online });
};

// Simple per-socket limit, since socket events bypass the REST rate limiter
const SEND_WINDOW = 60 * 1000;
const SEND_LIMIT = 60;
const allowSend = (socket) => {
  const now = Date.now();
  const recent = (socket.data.sent || []).filter((t) => now - t < SEND_WINDOW);
  const allowed = recent.length < SEND_LIMIT;
  if (allowed) recent.push(now);
  socket.data.sent = recent;
  return allowed;
};

export default function registerHandlers(io, socket) {
  const userId = socket.data.user.id;

  socket.join(`user:${userId}`);
  socket.join(socket.data.conversationIds.map((id) => `conv:${id}`));

  socket.on('typing', (payload) => {
    const { conversationId, isTyping } = payload || {};
    const room = `conv:${conversationId}`;
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit('typing', { conversationId, userId, isTyping: Boolean(isTyping) });
  });

  socket.on('message:send', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const { conversationId, ...fields } = payload || {};
      if (typeof conversationId !== 'string') {
        return reply({ ok: false, error: 'Invalid conversation' });
      }

      const parsed = sendMessageSchema.safeParse(fields);
      if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0].message });

      if (!allowSend(socket)) return reply({ ok: false, error: 'You are sending messages too fast' });

      if (!(await getMembership(conversationId, userId))) {
        return reply({ ok: false, error: 'Conversation not found' });
      }

      const message = await createMessage(conversationId, userId, parsed.data);
      emitNewMessage(io, message);
      reply({ ok: true, message });
    } catch (error) {
      console.error('message:send failed:', error.message);
      reply({ ok: false, error: 'Could not send message' });
    }
  });

  socket.on('message:read', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const { conversationId, messageId } = payload || {};
      const parsed = markReadSchema.safeParse({ messageId: messageId ?? undefined });
      if (typeof conversationId !== 'string' || !parsed.success) {
        return reply({ ok: false, error: 'Invalid request' });
      }

      const participant = await getMembership(conversationId, userId);
      if (!participant) return reply({ ok: false, error: 'Conversation not found' });

      const lastReadMessageId = await markRead(participant, parsed.data.messageId);
      if (lastReadMessageId) emitRead(io, conversationId, userId, lastReadMessageId);
      reply({ ok: true, lastReadMessageId });
    } catch (error) {
      console.error('message:read failed:', error.message);
      reply({ ok: false, error: 'Could not mark as read' });
    }
  });

  // 'disconnecting' fires while the socket is still in its rooms
  socket.on('disconnecting', () => {
    const rooms = conversationRooms(socket);
    markOffline(socket)
      .then((count) => {
        if (count === 0) broadcastPresence(io, rooms, userId, false);
      })
      .catch((error) => console.error('Presence error:', error.message));
  });

  // Presence setup runs in the background so events above are never missed
  (async () => {
    try {
      const count = await markOnline(socket);
      if (count === 1) broadcastPresence(io, conversationRooms(socket), userId, true);
      socket.emit('presence:snapshot', await getOnlineContacts(socket.data.contactIds));
    } catch (error) {
      console.error('Presence error:', error.message);
    }
  })();
}