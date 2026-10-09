import express from 'express';
import { register, login, getMe, verifyEmail, resendOtp, googleLogin } from '../controllers/authController.js';
import protect from '../middleware/authMiddleware.js';
import validate from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  googleSchema,
} from '../utils/validators.js';

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), verifyEmail);
router.post('/resend-otp', authLimiter, validate(resendOtpSchema), resendOtp);
router.get('/me', protect, getMe);
router.post('/google', authLimiter, validate(googleSchema), googleLogin);

export default router;