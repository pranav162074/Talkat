import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useMessages } from '../hooks/useMessages';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import './ChatWindow.css';
import GroupInfoModal from './GroupInfoModal';
import ProfileModal from './ProfileModal';

export default function ChatWindow({ conversation, onBack }) {
  const { user } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const { onlineIds, typing } = useChat();
    const {
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
  } = useMessages(conversation.id);

  const listRef = useRef(null);
  const stickToBottom = useRef(true); // follow new messages only if you are already at the bottom
  const prevHeight = useRef(0); // scroll height before older messages were added
  const prevFirstId = useRef(null);

  const isGroup = conversation.type === 'GROUP';
  const others = conversation.participants.filter((p) => p.id !== user.id);
  const title = isGroup ? conversation.name : others[0]?.name || 'Chat';
  const online = !isGroup && others[0] && onlineIds.includes(others[0].id);

  // Who is typing right now (names)
  const typingNames = others
    .filter((p) => typing[conversation.id]?.[p.id])
    .map((p) => p.name);

  // The newest messages of mine, and who has read up to where
  const readTimes = others
    .map((p) => messages.find((m) => m.id === p.lastReadMessageId)?.createdAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  // A message is "read" once every other member has read at least up to it
  const isRead = (message) =>
    readTimes.length === others.length &&
    readTimes.every((t) => t >= new Date(message.createdAt).getTime());

  // Keep the scroll position sensible
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;

    const firstId = messages[0].id;
    if (prevFirstId.current && firstId !== prevFirstId.current && !stickToBottom.current) {
      // Older messages were added on top: keep the same message in view
      el.scrollTop = el.scrollHeight - prevHeight.current;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirstId.current = firstId;
    prevHeight.current = el.scrollHeight;
  }, [messages, typingNames.length]);

  const onScroll = () => {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = el.scrollHeight;
    if (el.scrollTop < 60) loadMore();
  };

  // Whatever you send, jump to the bottom so your own message is visible
  const withScroll = (send) => (...args) => {
    stickToBottom.current = true;
    return send(...args);
  };

  return (
    <div className="window">
      <header className="window-header">
        <button
          type="button"
          className="window-back-btn"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          ←
        </button>
        <div className="window-header-info">
          {isGroup ? (
            <strong>{title}</strong>
          ) : (
            <button
              className="window-title-btn"
              onClick={() => setProfileId(others[0].id)}
              title="View profile"
            >
              {title}
            </button>
          )}
          <span className="window-status">
            {isGroup ? `${conversation.participants.length} members` : online ? 'online' : 'offline'}
          </span>
        </div>
        {isGroup && (
          <button className="btn-link" onClick={() => setShowInfo(true)}>
            Group info
          </button>
        )}
      </header>

      <div className="window-list" ref={listRef} onScroll={onScroll}>
        {loadingMore && <p className="window-note">Loading older messages...</p>}
        {!hasMore && !loading && messages.length > 0 && (
          <p className="window-note">Start of conversation</p>
        )}
        {loading && <p className="window-note">Loading...</p>}
        {error && <p className="window-note window-error">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="window-note">No messages yet. Say hi!</p>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            mine={m.senderId === user.id}
            showSender={isGroup && m.senderId !== user.id}
            read={m.senderId === user.id && isRead(m)}
            onEdit={editMessage}
            onUnsend={unsendMessage}
          />
        ))}

        {typingNames.length > 0 && (
          <p className="window-typing">{typingNames.join(', ')} typing...</p>
        )}
      </div>

      <MessageInput
        conversationId={conversation.id}
        onSend={withScroll(sendText)}
        onSendLocation={withScroll(sendLocation)}
        onSendAttachment={withScroll(sendAttachment)}
      />
      {showInfo && <GroupInfoModal conversation={conversation} onClose={() => setShowInfo(false)} />}
      {profileId && <ProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}