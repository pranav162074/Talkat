
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import './MessageInput.css';

const TYPING_TIMEOUT = 2000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 5 * 60 * 1000;

const ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/3gpp',
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

const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });

const getRecordingType = () => {
  if (!window.MediaRecorder) return '';

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const getAudioExtension = (mimeType) => {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

export default function MessageInput({
  conversationId,
  onSend,
  onSendLocation,
  onSendAttachment,
}) {
  const socket = useSocket();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [recording, setRecording] = useState(false);

  const typingRef = useRef(false);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  const busyRef = useRef(false);

  const busy = status !== '' || recording;

  const sendTyping = (isTyping) => {
    if (!socket || typingRef.current === isTyping) return;
    typingRef.current = isTyping;
    socket.emit('typing', { conversationId, isTyping });
  };

  const stopTyping = () => {
    clearTimeout(timerRef.current);
    sendTyping(false);
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(recordingTimerRef.current);

      if (socket && typingRef.current) {
        socket.emit('typing', { conversationId, isTyping: false });
      }

      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }

      stopStream();
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
    if (!content || busyRef.current || busy) return;

    stopTyping();
    busyRef.current = true;
    setStatus('sending');

    try {
      const result = await onSend(content);
      if (result.ok) setText('');
      else setError(result.error || 'Could not send message');
    } catch {
      setError('Could not send message');
    } finally {
      busyRef.current = false;
      setStatus('');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const uploadAttachment = async (file, caption = '') => {
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large (max 10 MB)');
      return;
    }

    stopTyping();
    setError('');
    busyRef.current = true;
    setStatus('uploading');

    try {
      const result = await onSendAttachment(file, caption);
      if (result.ok) setText('');
      else setError(result.error || 'Could not upload file');
    } catch {
      setError('Could not upload file');
    } finally {
      busyRef.current = false;
      setStatus('');
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || busyRef.current || busy) return;
    await uploadAttachment(file, text.trim());
  };

  const startRecording = async () => {
    if (busyRef.current || busy) return;

    setError('');

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported by this browser');
      return;
    }

    const mimeType = getRecordingType();
    if (!mimeType) {
      setError('No supported audio recording format is available');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingCancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('Recording failed. Please try again.');
        recordingCancelledRef.current = true;

        if (recorder.state !== 'inactive') recorder.stop();
      };

      recorder.onstop = async () => {
        clearTimeout(recordingTimerRef.current);
        stopStream();
        setRecording(false);
        recorderRef.current = null;

        if (recordingCancelledRef.current) {
          chunksRef.current = [];
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];

        if (!blob.size) {
          setError('No audio was recorded');
          return;
        }

        if (blob.size > MAX_FILE_SIZE) {
          setError('Voice message is too large (max 10 MB)');
          return;
        }

        const extension = getAudioExtension(recorder.mimeType);
        const file = new File([blob], `voice-message.${extension}`, {
          type: recorder.mimeType.split(';')[0],
        });

        await uploadAttachment(file, text.trim());
      };

      recorder.start();
      setRecording(true);
      stopTyping();

      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') {
          setError('Maximum recording time reached. Sending voice message...');
          recorder.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      stopStream();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied');
      } else {
        setError('Could not access the microphone');
      }
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const cancelRecording = () => {
    recordingCancelledRef.current = true;

    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.stop();
    } else {
      clearTimeout(recordingTimerRef.current);
      stopStream();
      setRecording(false);
    }
  };

  const shareLocation = async () => {
    if (busyRef.current || busy) return;

    setError('');
    setStatus('locating');

    try {
      const { coords } = await getPosition();
      const result = await onSendLocation(coords.latitude, coords.longitude);
      if (!result.ok) setError(result.error || 'Could not send location');
    } catch (err) {
      if (err.code === 1) setError('Location permission was denied');
      else if (err.message === 'unsupported') {
        setError('Your browser does not support location');
      } else {
        setError('Could not get your location');
      }
    } finally {
      setStatus('');
    }
  };

  return (
    <div className="input-wrap">
      {error && <p className="input-error">{error}</p>}
      {status === 'uploading' && <p className="input-status">Uploading...</p>}
      {status === 'locating' && <p className="input-status">Getting your location...</p>}
      {recording && (
        <p className="input-status" role="status">
          🔴 Recording voice message — stop to send, or cancel to discard.
        </p>
      )}

      <div className="input-row">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          onChange={onFileChange}
          hidden
        />

        <button
          type="button"
          className="input-icon"
          title="Attach a file"
          onClick={() => fileRef.current.click()}
          disabled={busy}
        >
          📎
        </button>

        <button
          type="button"
          className="input-icon"
          title="Share location"
          onClick={shareLocation}
          disabled={busy}
        >
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
          disabled={recording || status !== ''}
        />

        {recording ? (
          <>
            <button
              type="button"
              className="input-icon"
              title="Stop and send voice message"
              onClick={stopRecording}
            >
              ⏹️
            </button>
            <button
              type="button"
              className="input-icon"
              title="Cancel recording"
              onClick={cancelRecording}
            >
              ✖️
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="input-icon"
              title="Record voice message"
              onClick={startRecording}
              disabled={busy}
            >
              🎙️
            </button>
            <button
              type="button"
              className="input-send"
              onClick={submit}
              disabled={busy || !text.trim()}
            >
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}
