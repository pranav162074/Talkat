import webpush from 'web-push';
import env from '../config/env.js';
import prisma from '../config/prisma.js';
import redis from '../config/redis.js';
import { visibleKey } from '../utils/presenceKeys.js';

export const MAX_SUBSCRIPTIONS_PER_USER = 10;
const TTL_SECONDS = 24 * 60 * 60; // a phone that stays offline longer than this skips the notification
const PREVIEW_LENGTH = 100;
const SEND_TIMEOUT_MS = 10000;

// Saves the browser's subscription for this user. The endpoint is unique per browser, so if
// someone else was logged in on this browser before, the subscription now moves to you.
export const saveSubscription = async (userId, { endpoint, keys }, userAgent) => {
  const fields = { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 255) || null };

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...fields },
    update: fields,
  });

  // Keep the newest few per user, so old browsers nobody uses can't pile up forever
  const extra = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (extra.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((s) => s.id) } } });
  }
};

// Scoped to the user, so you can't switch off notifications for someone else's browser
export const removeSubscription = (userId, endpoint) =>
  prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });

// Who should get a push: anyone without a tab or app on screen. If Redis can't answer,
// everyone gets one, because a duplicate notification is better than a missed message.
const usersNotLooking = async (userIds) => {
  if (userIds.length === 0) return [];
  try {
    const results = await redis.pipeline(userIds.map((id) => ['scard', visibleKey(id)])).exec();
    return userIds.filter((_, i) => !(results[i][1] > 0));
  } catch (error) {
    console.error('Push visibility check failed:', error.message);
    return userIds;
  }
};

const describe = (message) => {
  switch (message.type) {
    case 'IMAGE':
      return '📷 Photo';
    case 'VIDEO':
      return '🎥 Video';
    case 'AUDIO':
      return '🎤 Voice message';
    case 'FILE':
      return `📎 ${message.attachmentName || 'File'}`;
    case 'LOCATION':
      return '📍 Location';
    default:
      return message.content || 'New message';
  }
};

const truncate = (text) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text);

// What the service worker turns into a notification
export const buildPayload = (conversation, message) => {
  const sender = message.sender?.name || 'Someone';
  const preview = truncate(describe(message));
  const isGroup = conversation.type === 'GROUP';

  return {
    title: isGroup ? conversation.name || 'Group chat' : sender,
    body: isGroup ? `${sender}: ${preview}` : preview,
    icon: message.sender?.avatar || null,
    conversationId: message.conversationId,
    messageId: message.id,
    url: `/?c=${message.conversationId}`,
  };
};

const sendOptions = (conversationId) => ({
  vapidDetails: {
    subject: env.vapidSubject,
    publicKey: env.vapidPublicKey,
    privateKey: env.vapidPrivateKey,
  },
  TTL: TTL_SECONDS,
  urgency: 'high',
  // While a phone is offline, the push service keeps only the newest notification per topic,
  // so coming back online shows one notification per chat instead of fifty. A topic must be at
  // most 32 URL-safe characters, and a UUID without its dashes is exactly 32.
  topic: conversationId.replaceAll('-', ''),
  timeout: SEND_TIMEOUT_MS,
});

// Sends a push for a new message to every other member who isn't looking at Talkat.
// Returns how many pushes were sent. Never throws for a single bad subscription.
export const notifyNewMessage = async (message) => {
  if (!env.pushEnabled || message.deletedAt) return 0;

  const conversation = await prisma.conversation.findUnique({
    where: { id: message.conversationId },
    select: {
      type: true,
      name: true,
      participants: { where: { userId: { not: message.senderId } }, select: { userId: true } },
    },
  });
  if (!conversation) return 0;

  const recipients = await usersNotLooking(conversation.participants.map((p) => p.userId));
  if (recipients.length === 0) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: recipients } } });
  if (subscriptions.length === 0) return 0;

  const payload = JSON.stringify(buildPayload(conversation, message));
  const options = sendOptions(message.conversationId);

  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options)
    )
  );

  // 404 and 410 mean the browser unsubscribed or the subscription expired: it will never work again
  const gone = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') return;
    const status = result.reason?.statusCode;
    if (status === 404 || status === 410) gone.push(subscriptions[i].id);
    else console.error('Push failed:', status || '', result.reason?.message);
  });
  if (gone.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  }

  return results.length - gone.length;
};
