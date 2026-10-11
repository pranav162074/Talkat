import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { ChatContext } from './chatContext';

const time = (c) => new Date(c.lastMessage?.createdAt || c.createdAt);
const byRecent = (a, b) => time(b) - time(a);

export default function ChatProvider({ children }) {
  const { user } = useAuth();
  const socket = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [onlineIds, setOnlineIds] = useState([]);
  const [typing, setTyping] = useState({}); // { conversationId: { userId: true } }

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/conversations');
      setConversations([...data.conversations].sort(byRecent));
    } catch (error) {
      console.error('Could not load conversations', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Adds a conversation, or replaces it if we already have it
  const upsertConversation = useCallback((conversation) => {
    setConversations((prev) =>
      [conversation, ...prev.filter((c) => c.id !== conversation.id)].sort(byRecent)
    );
  }, []);

  const markReadLocal = useCallback((conversationId) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const openDirect = useCallback(
    async (userId) => {
      const { data } = await api.post('/conversations/direct', { userId });
      upsertConversation(data.conversation);
      setActiveId(data.conversation.id);
      return data.conversation;
    },
    [upsertConversation]
  );

  // Keep the list live with socket events
  useEffect(() => {
    if (!socket || !user) return;

    const onMessage = (message) => {
      setConversations((prev) =>
        prev
          .map((c) => {
            if (c.id !== message.conversationId) return c;
            const fromOther = message.senderId !== user.id;
            const unread = fromOther && c.id !== activeId ? c.unreadCount + 1 : c.unreadCount;
            return { ...c, lastMessage: message, unreadCount: unread };
          })
          .sort(byRecent)
      );
      // They sent a message, so they are no longer typing
      setTyping((prev) => {
        const inConv = prev[message.conversationId];
        if (!inConv?.[message.senderId]) return prev;
        return { ...prev, [message.conversationId]: { ...inConv, [message.senderId]: false } };
      });
    };

    const onRead = ({ conversationId, userId, lastReadMessageId }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            unreadCount: userId === user.id ? 0 : c.unreadCount,
            participants: c.participants.map((p) =>
              p.id === userId ? { ...p, lastReadMessageId } : p
            ),
          };
        })
      );
    };

    const onRemoved = ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setActiveId((current) => (current === conversationId ? null : current));
    };

    const onPresence = ({ userId, online }) => {
      setOnlineIds((prev) => {
        const without = prev.filter((id) => id !== userId);
        return online ? [...without, userId] : without;
      });
    };

    const onTyping = ({ conversationId, userId, isTyping }) => {
      setTyping((prev) => ({
        ...prev,
        [conversationId]: { ...prev[conversationId], [userId]: isTyping },
      }));
    };

    socket.on('message:new', onMessage);
    socket.on('conversation:read', onRead);
    socket.on('conversation:new', upsertConversation);
    socket.on('conversation:removed', onRemoved);
    socket.on('conversation:members-changed', refresh);
    socket.on('presence:snapshot', setOnlineIds);
    socket.on('presence:update', onPresence);
    socket.on('typing', onTyping);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('conversation:read', onRead);
      socket.off('conversation:new', upsertConversation);
      socket.off('conversation:removed', onRemoved);
      socket.off('conversation:members-changed', refresh);
      socket.off('presence:snapshot', setOnlineIds);
      socket.off('presence:update', onPresence);
      socket.off('typing', onTyping);
    };
  }, [socket, user, activeId, refresh, upsertConversation]);

  const value = useMemo(
    () => ({
      conversations,
      loading,
      activeId,
      setActiveId,
      onlineIds,
      typing,
      refresh,
      upsertConversation,
      markReadLocal,
      openDirect,
    }),
    [
      conversations,
      loading,
      activeId,
      onlineIds,
      typing,
      refresh,
      upsertConversation,
      markReadLocal,
      openDirect,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}