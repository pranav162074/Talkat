import { useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import UserPicker from './UserPicker';
import './Modal.css';
import ProfileModal from './ProfileModal';

export default function GroupInfoModal({ conversation, onClose }) {
  const { user } = useAuth();
  const { refresh, setActiveId } = useChat();
  const [toAdd, setToAdd] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState(null);

  const me = conversation.participants.find((p) => p.id === user.id);
  const isAdmin = me?.role === 'ADMIN';

  const run = async (action, fallback) => {
    setError('');
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addMembers = async () => {
    const ok = await run(
      () =>
        api.post(`/conversations/${conversation.id}/participants`, {
          userIds: toAdd.map((u) => u.id),
        }),
      'Could not add members'
    );
    if (ok) {
      setToAdd([]);
      refresh();
    }
  };

  const removeMember = async (userId) => {
    const ok = await run(
      () => api.delete(`/conversations/${conversation.id}/participants/${userId}`),
      'Could not remove the member'
    );
    if (ok) refresh();
  };

  const leave = async () => {
    if (!window.confirm('Leave this group?')) return;
    const ok = await run(
      () => api.delete(`/conversations/${conversation.id}/participants/${user.id}`),
      'Could not leave the group'
    );
    if (ok) {
      // The server also sends conversation:removed, this just makes it instant
      setActiveId(null);
      refresh();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{conversation.name}</h2>

        {error && <p className="modal-error">{error}</p>}

        <ul className="modal-members">
          {conversation.participants.map((p) => (
            <li key={p.id} className="modal-member">
              <span>
                {p.id === user.id ? (
                  <>{p.name} (you)</>
                ) : (
                  <button className="modal-name-btn" onClick={() => setProfileId(p.id)}>
                    {p.name}
                  </button>
                )}
                {p.role === 'ADMIN' && <span className="modal-badge">admin</span>}
              </span>
              {isAdmin && p.id !== user.id && (
                <button
                  className="btn-link modal-danger"
                  onClick={() => removeMember(p.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <>
            <UserPicker
              selected={toAdd}
              onChange={setToAdd}
              excludeIds={conversation.participants.map((p) => p.id)}
            />
            <button
              className="btn-primary modal-submit"
              style={{ marginTop: '0.75rem' }}
              onClick={addMembers}
              disabled={busy || toAdd.length === 0}
            >
              Add selected
            </button>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-link modal-danger" onClick={leave} disabled={busy}>
            Leave group
          </button>
          <button className="btn-link" onClick={onClose}>
            Close
          </button>
        </div>
        {profileId && <ProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
      </div>
    </div>
  );
}