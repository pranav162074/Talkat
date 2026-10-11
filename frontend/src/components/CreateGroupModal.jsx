import { useState } from 'react';
import api from '../api/axios';
import { useChat } from '../hooks/useChat';
import UserPicker from './UserPicker';
import './Modal.css';

export default function CreateGroupModal({ onClose }) {
  const { upsertConversation, setActiveId } = useChat();
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/conversations/group', {
        name,
        memberIds: members.map((m) => m.id),
      });
      upsertConversation(data.conversation);
      setActiveId(data.conversation.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the group');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New group</h2>

        {error && <p className="modal-error">{error}</p>}

        <form onSubmit={submit}>
          <input
            className="modal-input"
            placeholder="Group name"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <UserPicker selected={members} onChange={setMembers} />

          <div className="modal-actions">
            <button type="button" className="btn-link" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary modal-submit" disabled={busy || members.length === 0}>
              {busy ? 'Creating...' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}