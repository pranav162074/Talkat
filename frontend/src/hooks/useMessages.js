import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';

const PAGE_SIZE = 30;

// The same message can arrive twice (ack and live event), so never add a duplicate
const addUnique = (list, message) =>
  list.some((m) => m.id === message.id) ? list : [...list, message];

// Messages are kept oldest first, so the newest one is at the bottom of the screen
export function useMessages(conversationId) {
  const { user } = useAuth();
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const cursorRef = useRef(null);

  // Load the newest page when the chat opens
  useEffect(() => {
    let cancelled = false;

    api
      .get(`/conversations/${conversationId}/messages`, { params: { limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (cancelled) return;
        const fetched = [...data.messages].reverse(); // the API sends newest first
        // Keep anything that arrived live while this request was in flight
        setMessages((prev) => [...fetched, ...prev.filter((m) => !fetched.some((f) => f.id === m.id))]);
        setHasMore(data.hasMore);
        cursorRef.current = data.nextCursor;
      })
      .catch(() => {
        if (!cancelled) setError('Could not load messages');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Opening the chat counts as reading it
  useEffect(() => {
    if (!loading && socket) socket.emit('message:read', { conversationId });
  }, [loading, socket, conversationId]);

  // Live delivery, edits, and unsends
  useEffect(() => {
    if (!socket) return;

    const onMessage = (message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => addUnique(prev, message));

      if (message.senderId !== user.id) {
        socket.emit('message:read', { conversationId });
      }
    };

    const onMessageUpdated = (message) => {
      if (message.conversationId !== conversationId) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? message : m))
      );
    };

    const onMessageUnsent = (message) => {
      if (message.conversationId !== conversationId) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? message : m))
      );
    };

    socket.on('message:new', onMessage);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:unsent', onMessageUnsent);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:unsent', onMessageUnsent);
    };
  }, [socket, conversationId, user.id]);

  // Infinite scroll: fetch the page of messages older than the ones we have
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, {
        params: { limit: PAGE_SIZE, cursor: cursorRef.current },
      });
      setMessages((prev) => [...[...data.messages].reverse(), ...prev]);
      setHasMore(data.hasMore);
      cursorRef.current = data.nextCursor;
    } catch {
      setError('Could not load older messages');
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore]);

  // Sends a text or location message over the socket and waits for the server's confirmation.
  // Resolves to { ok: true, message } or { ok: false, error }
  const sendOverSocket = useCallback(
    (fields) =>
      new Promise((resolve) => {
        if (!socket) return resolve({ ok: false, error: 'Not connected' });

        socket
          .timeout(10000)
          .emit('message:send', { conversationId, ...fields }, (err, res) => {
            if (err) return resolve({ ok: false, error: 'Sending timed out' });
            if (res.ok) setMessages((prev) => addUnique(prev, res.message));
            resolve(res);
          });
      }),
    [socket, conversationId]
  );

  const sendText = useCallback(
    (content) => sendOverSocket({ type: 'TEXT', content }),
    [sendOverSocket]
  );

  const sendLocation = useCallback(
    (latitude, longitude) => sendOverSocket({ type: 'LOCATION', latitude, longitude }),
    [sendOverSocket]
  );

  // Files go over HTTP (multipart), because sockets aren't meant for large uploads
  const sendAttachment = useCallback(
    async (file, caption = '') => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('content', caption);

      try {
        const { data } = await api.post(`/conversations/${conversationId}/attachments`, form);
        setMessages((prev) => addUnique(prev, data.message));
        return { ok: true, message: data.message };
      } catch (err) {
        return { ok: false, error: err.response?.data?.message || 'Could not upload the file' };
      }
    },
    [conversationId]
  );

    const editMessage = useCallback(
    async (messageId, content) => {
      try {
        const { data } = await api.patch(
          `/conversations/${conversationId}/messages/${messageId}`,
          { content }
        );

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? data.message : m))
        );

        return { ok: true, message: data.message };
      } catch (err) {
        return {
          ok: false,
          error: err.response?.data?.message || 'Could not edit message',
        };
      }
    },
    [conversationId]
  );

  const unsendMessage = useCallback(
    async (messageId) => {
      try {
        const { data } = await api.delete(
          `/conversations/${conversationId}/messages/${messageId}`
        );

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? data.message : m))
        );

        return { ok: true, message: data.message };
      } catch (err) {
        return {
          ok: false,
          error: err.response?.data?.message || 'Could not unsend message',
        };
      }
    },
    [conversationId]
  );

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    sendText,
    sendLocation,
    sendAttachment,
    editMessage,
    unsendMessage,
  };
}