import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import './MessageInput.css';

const TYPING_TIMEOUT = 2000; // stop "typing" after 2 seconds without a keystroke

export default function MessageInput({ conversationId, onSend }) {
  const socket = useSocket();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const typingRef = useRef(false);
  const timerRef = useRef(null);

  const sendTyping = (isTyping) => {
    if (!socket || typingRef.current === isTyping) return;
    typingRef.current = isTyping;
    socket.emit('typing', { conversationId, isTyping });
  };

  // If the chat closes while we are "typing", tell the other side we stopped
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (socket && typingRef.current) {
        socket.emit('typing', { conversationId, isTyping: false });
      }
    };
  }, [socket, conversationId]);

  const onChange = (e) => {
    setText(e.target.value);
    setError('');
    sendTyping(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => sendTyping(false), TYPING_TIMEOUT);
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || sending) return;

    clearTimeout(timerRef.current);
    sendTyping(false);
    setSending(true);

    const result = await onSend(content);
    setSending(false);

    if (result.ok) setText('');
    else setError(result.error || 'Could not send message');
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter adds a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="input-wrap">
      {error && <p className="input-error">{error}</p>}
      <div className="input-row">
        <textarea
          className="input-box"
          rows={1}
          maxLength={4000}
          placeholder="Type a message"
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <button className="input-send" onClick={submit} disabled={sending || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}