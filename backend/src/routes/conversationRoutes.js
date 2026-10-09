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
} from '../utils/validators.js';

const router = express.Router();

router.use(protect);

router.post('/direct', validate(directConversationSchema), getOrCreateDirect);
router.post('/group', validate(groupConversationSchema), createGroup);
router.get('/', listConversations);
router.get('/:id', getConversation);
router.post('/:id/participants', validate(addParticipantsSchema), addParticipants);
router.delete('/:id/participants/:userId', removeParticipant);

export default router;