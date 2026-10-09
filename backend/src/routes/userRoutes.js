import express from 'express';
import { searchUsers } from '../controllers/userController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/search', protect, searchUsers);

export default router;