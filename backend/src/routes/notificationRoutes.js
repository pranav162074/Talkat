import express from 'express';
import protect from '../middleware/authMiddleware.js';
import validate from '../middleware/validate.js';
import { subscriptionLimiter } from '../middleware/rateLimiter.js';
import { getConfig, subscribe, unsubscribe } from '../controllers/notificationController.js';
import { pushSubscriptionSchema, removeSubscriptionSchema } from '../utils/validators.js';

const router = express.Router();

router.use(protect);

router.get('/config', getConfig);
router.post('/subscriptions', subscriptionLimiter, validate(pushSubscriptionSchema), subscribe);
router.delete('/subscriptions', subscriptionLimiter, validate(removeSubscriptionSchema), unsubscribe);

export default router;
