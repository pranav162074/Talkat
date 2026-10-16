import express from 'express';
import { searchUsers, getUserProfile } from '../controllers/userController.js';
import {
  updateProfile,
  updateAvatar,
  removeAvatar,
} from '../controllers/profileController.js';
import protect from '../middleware/authMiddleware.js';
import validate from '../middleware/validate.js';
import { profileLimiter } from '../middleware/rateLimiter.js';
import { uploadAvatarFile } from '../middleware/uploadMiddleware.js';
import { updateProfileSchema } from '../utils/validators.js';

const router = express.Router();

router.get('/search', protect, searchUsers);

router.patch('/me', protect, profileLimiter, validate(updateProfileSchema), updateProfile);
router.post('/me/avatar', protect, profileLimiter, uploadAvatarFile, updateAvatar);
router.delete('/me/avatar', protect, profileLimiter, removeAvatar);
router.get('/:id', protect, getUserProfile);

export default router;