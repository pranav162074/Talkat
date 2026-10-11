import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import CreateGroupModal from './CreateGroupModal';
import './Sidebar.css';

const initial = (name) => (name?.trim()?.[0] || '?').toUpperCase();

function Avatar({ src, name, online }) {
  return (
    <div className="avatar-wrap">
      {src ? (
        <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" />
      ) : (
        <div className="avatar avatar-fallback">{initial(name)}</div>
      )}
      {online && <span className="online-dot" />}
    </div>
  );
}

const preview = (message, mine) => {
  if (!message) return 'No messages yet';
  const prefix = mine ? 'You: ' : '';
  if (message.type === 'IMAGE') return `${prefix}📷 Photo`;
  if (message.type === 'VIDEO') return `${prefix}🎥 Video`;
  if (message.type === 'FILE') return `${prefix}📎 ${message.attachmentName || 'File'}`;
  if (message.type === 'LOCATION') return `${prefix}📍 Location`;
  return `${prefix}${message.content}`;
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { conversations, loading, activeId, setActiveId, onlineIds, markReadLocal, openDirect } =
    useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Search 400ms after the user stops typing
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setResults(data.users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const showResults = query.trim().length >= 2;

  const pickUser = async (userId) => {
    try {
      await openDirect(userId);
      setQuery('');
      setResults([]);
    } catch (error) {
      console.error('Could not open chat', error);
    }
  };

  const openConversation = (conversation) => {
    setActiveId(conversation.id);
    markReadLocal(conversation.id);
  };

  const titleOf = (c) =>
    c.type === 'GROUP' ? c.name : c.participants.find((p) => p.id !== user.id)?.name || 'Chat';

  const avatarOf = (c) =>
    c.type === 'GROUP' ? c.avatar : c.participants.find((p) => p.id !== user.id)?.avatar;

  const isOnline = (c) =>
    c.type === 'DIRECT' &&
    onlineIds.includes(c.participants.find((p) => p.id !== user.id)?.id);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Avatar src={user.avatar} name={user.name} />
        <strong className="sidebar-me">{user.name}</strong>
        <button className="btn-link" onClick={logout}>
          Log out
        </button>
      </div>

      <input
        className="sidebar-search"
        placeholder="Search people by name or exact email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <button className="sidebar-new-group" onClick={() => setShowGroupModal(true)}>
        + New group
      </button>

      <div className="sidebar-list">
        {showResults ? (
          <>
            {searching && <p className="sidebar-note">Searching...</p>}
            {!searching && results.length === 0 && <p className="sidebar-note">No users found</p>}
            {results.map((u) => (
              <button key={u.id} className="sidebar-item" onClick={() => pickUser(u.id)}>
                <Avatar src={u.avatar} name={u.name} online={onlineIds.includes(u.id)} />
                <div className="sidebar-text">
                  <span className="sidebar-title">{u.name}</span>
                  <span className="sidebar-preview">Start a chat</span>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            {loading && <p className="sidebar-note">Loading...</p>}
            {!loading && conversations.length === 0 && (
              <p className="sidebar-note">No chats yet. Search for someone above.</p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`sidebar-item ${c.id === activeId ? 'active' : ''}`}
                onClick={() => openConversation(c)}
              >
                <Avatar src={avatarOf(c)} name={titleOf(c)} online={isOnline(c)} />
                <div className="sidebar-text">
                  <span className="sidebar-title">{titleOf(c)}</span>
                  <span className="sidebar-preview">
                    {preview(c.lastMessage, c.lastMessage?.senderId === user.id)}
                  </span>
                </div>
                {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {showGroupModal && <CreateGroupModal onClose={() => setShowGroupModal(false)} />}
    </aside>
  );
}