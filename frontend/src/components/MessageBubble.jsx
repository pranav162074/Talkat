import { useState } from 'react';
import { formatSize, formatTime } from '../utils/format';
import LocationMap from './LocationMap';
import './MessageBubble.css';

const EDIT_WINDOW_MS = 5 * 60 * 1000;

export default function MessageBubble({
  message,
  mine,
  showSender,
  read,
  onEdit,
  onUnsend,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content || '');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const {
    type,
    content,
    attachmentUrl,
    attachmentName,
    attachmentSize,
    deletedAt,
    editedAt,
  } = message;

  const canEdit =
    mine &&
    type === 'TEXT' &&
    !deletedAt &&
    Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

  const handleEdit = async () => {
    const nextContent = draft.trim();

    if (!nextContent) {
      setActionError('Message cannot be empty');
      return;
    }

    if (nextContent === content) {
      setEditing(false);
      setActionError('');
      return;
    }

    setBusy(true);
    setActionError('');

    const result = await onEdit(message.id, nextContent);

    setBusy(false);

    if (!result?.ok) {
      setActionError(result?.error || 'Could not edit message');
      return;
    }

    setEditing(false);
  };

  const handleUnsend = async () => {
    if (!window.confirm('Unsend this message for everyone?')) return;

    setBusy(true);
    setActionError('');

    const result = await onUnsend(message.id);

    setBusy(false);

    if (!result?.ok) {
      setActionError(result?.error || 'Could not unsend message');
    } else {
      setEditing(false);
    }
  };

  return (
    <div className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
      <div
        className={`bubble ${type === 'AUDIO' ? 'bubble-audio-message' : ''} ${
          deletedAt ? 'bubble-unsent' : ''
        }`}
      >
        {showSender && (
          <span className="bubble-sender">{message.sender?.name}</span>
        )}

        {deletedAt ? (
          <p className="bubble-text bubble-unsent-text">This message was unsent</p>
        ) : (
          <>
            {type === 'IMAGE' && attachmentUrl && (
              <a href={attachmentUrl} target="_blank" rel="noreferrer">
                <img
                  className="bubble-image"
                  src={attachmentUrl}
                  alt={attachmentName || 'Image attachment'}
                />
              </a>
            )}

            {type === 'VIDEO' && attachmentUrl && (
              <video
                className="bubble-video"
                src={attachmentUrl}
                controls
                preload="metadata"
              />
            )}

            {type === 'AUDIO' && attachmentUrl && (
              <audio className="bubble-audio" src={attachmentUrl} controls />
            )}

            {type === 'FILE' && attachmentUrl && (
              <a
                className="bubble-file"
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span className="bubble-file-icon">📎</span>
                <span className="bubble-file-info">
                  <strong>{attachmentName || 'Attachment'}</strong>
                  {attachmentSize != null && (
                    <small>{formatSize(attachmentSize)}</small>
                  )}
                </span>
              </a>
            )}

            {type === 'LOCATION' &&
              message.latitude != null &&
              message.longitude != null && (
                <LocationMap
                  latitude={message.latitude}
                  longitude={message.longitude}
                />
              )}

            {editing ? (
              <div className="bubble-edit-form">
                <textarea
                  className="bubble-edit-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={4000}
                  rows={3}
                  autoFocus
                  disabled={busy}
                  aria-label="Edit message"
                />
                <div className="bubble-actions">
                  <button
                    type="button"
                    onClick={handleEdit}
                    disabled={busy || !draft.trim()}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(content || '');
                      setEditing(false);
                      setActionError('');
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              content && (
                <p className="bubble-text">
                  {content}
                  {editedAt && <span className="bubble-edited"> (edited)</span>}
                </p>
              )
            )}

            {mine && (
              <div className="bubble-actions">
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(content || '');
                      setEditing(true);
                      setActionError('');
                    }}
                    disabled={busy}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUnsend}
                  disabled={busy}
                >
                  Unsend
                </button>
              </div>
            )}
          </>
        )}

        <span className="bubble-meta">
          {formatTime(message.createdAt)}
          {mine && !deletedAt && (
            <span className={`tick ${read ? 'read' : ''}`}>
              {read ? ' ✓✓' : ' ✓'}
            </span>
          )}
        </span>

        {actionError && (
          <p className="bubble-action-error" role="alert">
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}