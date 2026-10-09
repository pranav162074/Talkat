import { z } from 'zod';
import {
  getMembership,
  createMessage,
  getMessages,
  markRead,
  MAX_PAGE,
} from '../services/messageService.js';
import { emitNewMessage, emitRead } from '../sockets/emitters.js';

const cursorSchema = z.string().uuid();

// @route GET /api/conversations/:id/messages
export const listMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await getMembership(id, req.user.id))) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), MAX_PAGE);

    let cursor;
    if (req.query.cursor) {
      const parsed = cursorSchema.safeParse(req.query.cursor);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid cursor' });
      cursor = parsed.data;
    }

    const page = await getMessages(id, { cursor, limit });
    if (!page) return res.status(400).json({ message: 'Invalid cursor' });

    res.json(page); // { messages (newest first), hasMore, nextCursor }
  } catch (error) {
    next(error);
  }
};

// @route POST /api/conversations/:id/messages
export const sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await getMembership(id, req.user.id))) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const message = await createMessage(id, req.user.id, req.body);
    emitNewMessage(req.app.get('io'), message);
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/conversations/:id/read
export const markConversationRead = async (req, res, next) => {
  try {
    const participant = await getMembership(req.params.id, req.user.id);
    if (!participant) return res.status(404).json({ message: 'Conversation not found' });

    const { messageId } = req.body;
    const lastReadMessageId = await markRead(participant, messageId);

    if (messageId && !lastReadMessageId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (lastReadMessageId) {
      emitRead(req.app.get('io'), req.params.id, req.user.id, lastReadMessageId);
    }
    res.json({ lastReadMessageId });
  } catch (error) {
    next(error);
  }
};