import { z } from 'zod';
import {
  getMembership,
  createMessage,
  getMessages,
  markRead,
  MAX_PAGE,
} from '../services/messageService.js';
import { emitNewMessage, emitRead } from '../sockets/emitters.js';
import { uploadToCloudinary, getMessageType } from '../services/uploadService.js';

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

// Runs before the upload, so non-members can't make us handle their files
export const requireMember = async (req, res, next) => {
  try {
    if (!(await getMembership(req.params.id, req.user.id))) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// @route POST /api/conversations/:id/attachments  (multipart form: file, optional content)
export const sendAttachment = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const caption = String(req.body.content || '').trim().slice(0, 1000);

    let uploaded;
    try {
      uploaded = await uploadToCloudinary(req.file);
    } catch (error) {
      console.error('Cloudinary upload failed:', error.message);
      return res.status(502).json({ message: 'Could not upload the file, try again' });
    }

    const message = await createMessage(req.params.id, req.user.id, {
      type: getMessageType(req.file.mimetype),
      content: caption || null,
      attachmentUrl: uploaded.secure_url,
      attachmentName: req.file.originalname.slice(0, 255),
      attachmentSize: req.file.size,
    });

    emitNewMessage(req.app.get('io'), message);
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};