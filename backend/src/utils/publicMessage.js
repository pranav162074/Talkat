// An unsent message keeps its place in the conversation (so read receipts and message
// order stay intact), but must never reveal what it contained. This runs on every message
// we send out, including ones read back from the Redis cache.
export const toPublicMessage = (message) => {
  if (!message.deletedAt) return message;

  return {
    ...message,
    content: null,
    attachmentUrl: null,
    attachmentName: null,
    attachmentSize: null,
    latitude: null,
    longitude: null,
  };
};