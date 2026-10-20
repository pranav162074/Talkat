import api from '../api/axios';

// Push needs a service worker, the Push API and notifications. iPhones only have them in
// the installed home-screen app, so in Safari's normal tabs this is false.
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Browsers want the server's public key as bytes, but it travels as base64url text
const toBytes = (base64url) => {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const sameKey = (buffer, publicKey) => {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  const b = toBytes(publicKey);
  return a.length === b.length && a.every((value, i) => value === b[i]);
};

// The service worker is only registered in production builds (npm run build, then
// npm run preview), never by the Vite dev server. On a first visit it may still be
// registering, so `wait` gives it a few seconds instead of reporting "unsupported".
const getRegistration = async ({ wait = false } = {}) => {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing || !wait) return existing || null;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
};

const currentSubscription = async () => {
  const registration = await getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

// 'unsupported' | 'denied' | 'off' | 'on'
export const getPushState = async () => {
  if (!pushSupported() || !(await getRegistration({ wait: true }))) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const subscription = await currentSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
};

// Must be called from a click: browsers only show the permission prompt after a user action
export const enablePush = async () => {
  const { data } = await api.get('/notifications/config');
  if (!data.enabled) throw new Error('Notifications are not available right now');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await getRegistration();
  if (!registration) throw new Error('Notifications are not available in this browser');

  let subscription = await registration.pushManager.getSubscription();
  // A subscription made for a different server key can never receive our pushes
  if (subscription && !sameKey(subscription.options.applicationServerKey, data.publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // a promise that every push shows a notification
        applicationServerKey: toBytes(data.publicKey),
      });
    } catch {
      // Usually the browser can't reach its push service. Brave, for example, blocks it by default.
      throw new Error('This browser could not set up notifications. Try Chrome, Edge or Firefox.');
    }
  }

  await api.post('/notifications/subscriptions', subscription.toJSON());
  return 'on';
};

// Used by the toggle and by logout. The server is told first, while the login token still
// works. If that fails, unsubscribing still stops delivery: the push service answers 410
// next time, and the server deletes the subscription.
export const disablePush = async () => {
  const subscription = await currentSubscription();
  if (!subscription) return;

  await api
    .delete('/notifications/subscriptions', { data: { endpoint: subscription.endpoint } })
    .catch(() => {});
  await subscription.unsubscribe();
};

// Sends an existing subscription again when the app opens. That restores it if the server
// dropped it, and picks up a new endpoint if the browser renewed it.
export const syncPush = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (subscription) await api.post('/notifications/subscriptions', subscription.toJSON());
};
