import { formatTime } from '../utils/format';
import './MessageBubble.css';

export default function MessageBubble({ message, mine, showSender, read }) {
  return (
    <div className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble">
        {showSender && <span className="bubble-sender">{message.sender?.name}</span>}

        {message.type === 'TEXT' && <p className="bubble-text">{message.content}</p>}

        {/* Images, files and locations arrive in the attachments branch */}
        {message.type !== 'TEXT' && (
          <p className="bubble-text bubble-unsupported">Unsupported message type</p>
        )}

        <span className="bubble-meta">
          {formatTime(message.createdAt)}
          {mine && <span className={`tick ${read ? 'read' : ''}`}>{read ? ' ✓✓' : ' ✓'}</span>}
        </span>
      </div>
    </div>
  );
}