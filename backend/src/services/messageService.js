import prisma from '../config/prisma.js';
import redis from '../config/redis.js';
import { toPublicMessage } from '../utils/publicMessage.js';

const CACHE_SIZE = 60; // must stay above MAX_PAGE + 1
const CACHE_TTL = 60 * 60; // seconds
export const MAX_PAGE = 50;

const cacheKey = (conversationId) => `chat:${conversationId}:recent`;
const senderSelect = { id: true, name: true, avatar: true };
const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }];

export const getMembership = (conversationId, userId) =>
  prisma.conversationParticipant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
  });

const fetchFromDb = (conversationId, take, cursor) =>
  prisma.message.findMany({
    where: { conversationId },
    orderBy: newestFirst,
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: { sender: { select: senderSelect } },
  });

// Write-through, but only when the list already exists: pushing onto a missing
// key would create a partial list that looks like the full history
const pushToCache = async (message) => {
  try {
    const key = cacheKey(message.conversationId);
    if (await redis.exists(key)) {
      await redis
        .multi()
        .lpush(key, JSON.stringify(message))
        .ltrim(key, 0, CACHE_SIZE - 1)
        .expire(key, CACHE_TTL)
        .exec();
    }
  } catch (error) {
    console.error('Message cache write failed:', error.message);
  }
};

export const createMessage = async (conversationId, senderId, fields) => {
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId, ...fields },
      include: { sender: { select: senderSelect } },
    });

    // Your own message counts as read by you
    await tx.conversationParticipant.update({
      where: { userId_conversationId: { userId: senderId, conversationId } },
      data: { lastReadMessageId: created.id },
    });

    return created;
  });

  await pushToCache(message);
  return message;
};

// Returns null if the cursor isn't a message of this conversation
export const getMessages = async (conversationId, { cursor, limit }) => {
  const take = limit + 1; // one extra row tells us whether more exist
  let rows = null;

  if (cursor) {
    const exists = await prisma.message.findFirst({
      where: { id: cursor, conversationId },
      select: { id: true },
    });
    if (!exists) return null;
    rows = await fetchFromDb(conversationId, take, cursor);
  } else {
    try {
      const [[, length], [, items]] = await redis
        .multi()
        .llen(cacheKey(conversationId))
        .lrange(cacheKey(conversationId), 0, take - 1)
        .exec();

      // A list shorter than CACHE_SIZE holds the entire history
      const complete = length > 0 && length < CACHE_SIZE;
      if (length > 0 && (items.length === take || complete)) {
        rows = items.map((item) => JSON.parse(item));
      }
    } catch (error) {
      console.error('Message cache read failed:', error.message);
    }

    if (!rows) {
      const fresh = await fetchFromDb(conversationId, CACHE_SIZE);
      if (fresh.length > 0) {
        try {
          const key = cacheKey(conversationId);
          await redis
            .multi()
            .del(key)
            .rpush(key, ...fresh.map((m) => JSON.stringify(m)))
            .expire(key, CACHE_TTL)
            .exec();
        } catch (error) {
          console.error('Message cache fill failed:', error.message);
        }
      }
      rows = fresh.slice(0, take);
    }
  }

  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).map(toPublicMessage);
  return {
    messages,
    hasMore,
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  };
};

// Unread = messages from other people newer than your last read message.
// One query for all of your conversations (no N+1).
export const getUnreadCounts = async (userId) => {
  const rows = await prisma.$queryRaw`
    SELECT cp."conversationId", COUNT(m.id)::int AS unread
    FROM "ConversationParticipant" cp
    LEFT JOIN "Message" lr ON lr.id = cp."lastReadMessageId"
    JOIN "Message" m
      ON m."conversationId" = cp."conversationId"
     AND m."senderId" <> cp."userId"
     AND m."deletedAt" IS NULL
     AND (lr.id IS NULL OR m."createdAt" > lr."createdAt")
    WHERE cp."userId" = ${userId}
    GROUP BY cp."conversationId"
  `;

  return Object.fromEntries(rows.map((r) => [r.conversationId, r.unread]));
};

// Moves the read marker forward only, never backwards.
// Returns the id now stored, or null if there was nothing to mark.
export const markRead = async (participant, messageId) => {
  const { conversationId, userId } = participant;

  const target = await prisma.message.findFirst({
    where: { conversationId, ...(messageId && { id: messageId }) },
    orderBy: newestFirst,
    select: { id: true, createdAt: true },
  });
  if (!target) return null;

  if (participant.lastReadMessageId) {
    const current = await prisma.message.findUnique({
      where: { id: participant.lastReadMessageId },
      select: { createdAt: true },
    });
    if (current && current.createdAt >= target.createdAt) {
      return participant.lastReadMessageId;
    }
  }

  await prisma.conversationParticipant.update({
    where: { userId_conversationId: { userId, conversationId } },
    data: { lastReadMessageId: target.id },
  });
  return target.id;
};

export const EDIT_WINDOW_MS = 5 * 60 * 1000; // messages can be edited for 5 minutes

const loadWithSender = async (id) => {
  const message = await prisma.message.findUnique({
    where: { id },
    include: { sender: { select: senderSelect } },
  });

  return message ? toPublicMessage(message) : null;
};

// The cached copy of the recent messages would keep showing the old text, so edits and
// unsends clear it. The next read refills it from Postgres (the same cache-aside pattern).
const invalidateCache = async (conversationId) => {
  try {
    await redis.del(cacheKey(conversationId));
  } catch (error) {
    console.error('Message cache clear failed:', error.message);
  }
};

// Returns { status, message? }. The status is one of:
// ok, unchanged, not_found, forbidden, deleted, not_editable, expired, unavailable
export const editMessage = async (conversationId, messageId, userId, content) => {
  const existing = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
  if (!existing) return { status: 'not_found' };
  if (existing.senderId !== userId) return { status: 'forbidden' };
  if (existing.deletedAt) return { status: 'deleted' };
  if (existing.type !== 'TEXT') return { status: 'not_editable' };

  const cutoff = new Date(Date.now() - EDIT_WINDOW_MS);
  if (existing.createdAt < cutoff) return { status: 'expired' };

  // Saving the same text shouldn't add an "edited" label
  if (existing.content === content) {
    return { status: 'unchanged', message: await loadWithSender(messageId) };
  }

  // The rules are repeated inside the update itself, so a message that was unsent or aged
  // out between the check above and now can't slip through
  const { count } = await prisma.message.updateMany({
    where: { id: messageId, senderId: userId, deletedAt: null, createdAt: { gte: cutoff } },
    data: { content, editedAt: new Date() },
  });
  if (count === 0) return { status: 'unavailable' };

  await invalidateCache(conversationId);
  return { status: 'ok', message: await loadWithSender(messageId) };
};

// Unsending has no time limit. The row stays, so read receipts and message order are
// untouched, but everything the message contained is erased.
export const unsendMessage = async (conversationId, messageId, userId) => {
  const existing = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { senderId: true, deletedAt: true },
  });
  if (!existing) return { status: 'not_found' };
  if (existing.senderId !== userId) return { status: 'forbidden' };
  if (existing.deletedAt) return { status: 'already', message: await loadWithSender(messageId) };

  await prisma.message.updateMany({
    where: { id: messageId, senderId: userId, deletedAt: null },
    data: {
      deletedAt: new Date(),
      content: null,
      attachmentUrl: null,
      attachmentName: null,
      attachmentSize: null,
      latitude: null,
      longitude: null,
    },
  });

  await invalidateCache(conversationId);
  return { status: 'ok', message: await loadWithSender(messageId) };
};