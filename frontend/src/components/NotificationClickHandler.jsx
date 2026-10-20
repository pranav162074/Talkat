import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// When a notification is tapped while Talkat is already open, the service worker sends a
// message instead of opening a new window. This turns it into /?c=<id>, which the chat
// page opens, from whichever page you were on.
export default function NotificationClickHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event) => {
      const { type, conversationId } = event.data || {};
      if (type === 'open-conversation' && conversationId) {
        navigate(`/?c=${encodeURIComponent(conversationId)}`);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}
