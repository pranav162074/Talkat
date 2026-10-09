// Small helpers so REST controllers and socket handlers emit the same events.
// `io` can be undefined (for example in tests), so everything is optional-chained.

export const emitNewMessage = (io, message) =>
  io?.to(`conv:${message.conversationId}`).emit('message:new', message);

export const emitRead = (io, conversationId, userId, lastReadMessageId) =>
  io
    ?.to(`conv:${conversationId}`)
    .emit('conversation:read', { conversationId, userId, lastReadMessageId });

export const emitMembersChanged = (io, conversationId) =>
  io?.to(`conv:${conversationId}`).emit('conversation:members-changed', { conversationId });

// Puts every open socket of these users into the conversation's room
export const addToConversation = (io, userIds, conversation) => {
  if (!io) return;
  for (const id of userIds) {
    io.in(`user:${id}`).socketsJoin(`conv:${conversation.id}`);
    io.to(`user:${id}`).emit('conversation:new', conversation);
  }
};

export const removeFromConversation = (io, userId, conversationId) => {
  if (!io) return;
  io.in(`user:${userId}`).socketsLeave(`conv:${conversationId}`);
  io.to(`user:${userId}`).emit('conversation:removed', { conversationId });
};