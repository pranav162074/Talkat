import express from 'express';
import {
  getOrCreateDirect,
  createGroup,
  listConversations,
  getConversation,
  addParticipants,
  removeParticipant,
} from '../controllers/conversationController.js';
import protect from '../middleware/authMiddleware.js';
import validate from '../middleware/validate.js';
import {
  directConversationSchema,
  groupConversationSchema,
  addParticipantsSchema,
  sendMessageSchema,
  markReadSchema,
} from '../utils/validators.js';
import {
  listMessages,
  sendMessage,
  markConversationRead,
  sendAttachment,
  requireMember,
} from '../controllers/messageController.js';
import { uploadSingleFile } from '../middleware/uploadMiddleware.js';
import { messageLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(protect);

router.post('/direct', validate(directConversationSchema), getOrCreateDirect);
router.post('/group', validate(groupConversationSchema), createGroup);
router.get('/', listConversations);
router.get('/:id', getConversation);
router.post('/:id/participants', validate(addParticipantsSchema), addParticipants);
router.delete('/:id/participants/:userId', removeParticipant);
router.get('/:id/messages', listMessages);
router.post('/:id/messages', messageLimiter, validate(sendMessageSchema), sendMessage);
router.post('/:id/read', validate(markReadSchema), markConversationRead);
router.post('/:id/attachments', messageLimiter, requireMember, uploadSingleFile, sendAttachment);

export default router;