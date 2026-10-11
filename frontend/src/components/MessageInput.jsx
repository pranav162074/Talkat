import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import './MessageInput.css';

const TYPING_TIMEOUT = 2000; // stop "typing" after 2 seconds without a keystroke
const MAX_FILE_SIZE = 10 * 1024 * 1024; // same 10 MB limit as the backend

// Matches the backend allow-list, so the file picker only offers valid types
const ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'text/plain',
  'application/zip',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
].join(',');

// Wraps the browser's callback-style geolocation API in a promise
const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });

export default function MessageInput({ conversationId, onSend, onSendLocation, onSendAttachment }) {
  const socket = useSocket();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(''); // '', 'sending', 'uploading' or 'locating'
  const typingRef = useRef(false);
  const timerRef = useRef(null);
  const fileRef = useRef(null);

  const busy = status !== '';

  const sendTyping = (isTyping) => {
    if (!socket || typingRef.current === isTyping) return;
    typingRef.current = isTyping;
    socket.emit('typing', { conversationId, isTyping });
  };

  const stopTyping = () => {
    clearTimeout(timerRef.current);
    sendTyping(false);
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
    if (!content || busy) return;

    stopTyping();
    setStatus('sending');
    const result = await onSend(content);
    setStatus('');

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

  const onFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // lets you pick the same file again later
    if (!file || busy) return;

    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large (max 10 MB)');
      return;
    }

    stopTyping();
    setError('');
    setStatus('uploading');
    // Whatever is typed in the box becomes the caption
    const result = await onSendAttachment(file, text.trim());
    setStatus('');

    if (result.ok) setText('');
    else setError(result.error);
  };

  const shareLocation = async () => {
    if (busy) return;
    setError('');
    setStatus('locating');

    try {
      const { coords } = await getPosition();
      const result = await onSendLocation(coords.latitude, coords.longitude);
      if (!result.ok) setError(result.error || 'Could not send location');
    } catch (err) {
      if (err.code === 1) setError('Location permission was denied');
      else if (err.message === 'unsupported') setError('Your browser does not support location');
      else setError('Could not get your location');
    } finally {
      setStatus('');
    }
  };

  return (
    <div className="input-wrap">
      {error && <p className="input-error">{error}</p>}
      {status === 'uploading' && <p className="input-status">Uploading file...</p>}
      {status === 'locating' && <p className="input-status">Getting your location...</p>}

      <div className="input-row">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          onChange={onFileChange}
          hidden
        />
        <button
          className="input-icon"
          title="Attach a file"
          onClick={() => fileRef.current.click()}
          disabled={busy}
        >
          📎
        </button>
        <button className="input-icon" title="Share location" onClick={shareLocation} disabled={busy}>
          📍
        </button>

        <textarea
          className="input-box"
          rows={1}
          maxLength={4000}
          placeholder="Type a message"
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <button className="input-send" onClick={submit} disabled={busy || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}