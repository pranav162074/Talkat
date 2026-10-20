import env from '../config/env.js';
import { saveSubscription, removeSubscription } from '../services/pushService.js';

// @route GET /api/notifications/config
// The public key is meant to be public: browsers need it to subscribe
export const getConfig = (req, res) => {
  res.json({ enabled: env.pushEnabled, publicKey: env.pushEnabled ? env.vapidPublicKey : null });
};

// @route POST /api/notifications/subscriptions
export const subscribe = async (req, res, next) => {
  try {
    if (!env.pushEnabled) return res.status(503).json({ message: 'Notifications are not set up' });

    await saveSubscription(req.user.id, req.body, req.get('user-agent'));
    res.status(201).json({ message: 'Notifications turned on' });
  } catch (error) {
    next(error);
  }
};

// @route DELETE /api/notifications/subscriptions
// Always 204, even if there was nothing to delete, so turning off twice is harmless
export const unsubscribe = async (req, res, next) => {
  try {
    await removeSubscription(req.user.id, req.body.endpoint);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
