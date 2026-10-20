import { emitNewMessage } from '../sockets/emitters.js';
import { notifyNewMessage } from './pushService.js';

// Every new message goes through here, whether it came over the socket or REST: live
// delivery to open sockets first, then push notifications for everyone who isn't looking.
// The push runs in the background, so a slow push service never delays the sender.
export const deliverNewMessage = (io, message) => {
  emitNewMessage(io, message);
  notifyNewMessage(message).catch((error) => console.error('Push delivery failed:', error.message));
};
