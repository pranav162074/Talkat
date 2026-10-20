// Redis keys for who is connected. Each holds a set of socket ids, so a user with
// three tabs open has three entries, and is offline only when the set is empty.

// Every connected socket of the user
export const presenceKey = (userId) => `presence:${userId}`;

// Only the sockets whose tab or app is on screen right now
export const visibleKey = (userId) => `visible:${userId}`;
