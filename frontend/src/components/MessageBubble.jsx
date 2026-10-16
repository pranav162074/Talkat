import { formatSize, formatTime } from '../utils/format';
import LocationMap from './LocationMap';
import './MessageBubble.css';

export default function MessageBubble({ message, mine, showSender, read }) {
  const { type, content, attachmentUrl, attachmentName, attachmentSize } = message;

  return (
    <div className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
      <div className={`bubble ${type === 'AUDIO' ? 'bubble-audio-message' : ''}`}>
        {showSender && <span className="bubble-sender">{message.sender?.name}</span>}

        {type === 'IMAGE' && (
          <a href={attachmentUrl} target="_blank" rel="noreferrer">
            <img className="bubble-image" src={attachmentUrl} alt={attachmentName || 'Image'} loading="lazy" />
          </a>
        )}

        {type === 'VIDEO' && (
          <video className="bubble-video" src={attachmentUrl} controls preload="metadata" />
        )}

        {type === 'AUDIO' && (
          <audio
            className="bubble-audio"
            src={attachmentUrl}
            controls
            preload="metadata"
          />
        )}

        {type === 'FILE' && (
          <a className="bubble-file" href={attachmentUrl} target="_blank" rel="noreferrer">
            <span className="bubble-file-icon">📎</span>
            <span className="bubble-file-info">
              <span className="bubble-file-name">{attachmentName || 'File'}</span>
              <span className="bubble-file-size">{formatSize(attachmentSize)}</span>
            </span>
          </a>
        )}

        {type === 'LOCATION' && (
          <LocationMap latitude={message.latitude} longitude={message.longitude} />
        )}

        {/* Text messages, and optional captions on attachments */}
        {content && <p className="bubble-text">{content}</p>}

        <span className="bubble-meta">
          {formatTime(message.createdAt)}
          {mine && <span className={`tick ${read ? 'read' : ''}`}>{read ? ' ✓✓' : ' ✓'}</span>}
        </span>
      </div>
    </div>
  );
}