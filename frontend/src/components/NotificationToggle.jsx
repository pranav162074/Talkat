import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPushState, syncPush } from '../utils/push';

const LABELS = {
  off: '🔔 Turn on notifications',
  on: '🔕 Turn off notifications',
  denied: '🔕 Notifications blocked in browser settings',
};

export default function NotificationToggle() {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .then((current) => {
        if (cancelled) return;
        setState(current);
        if (current === 'on') syncPush().catch(() => {});
      })
      .catch(() => !cancelled && setState('unsupported'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading' || state === 'unsupported') return null;

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        setState(await enablePush());
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not change notifications');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="sidebar-notify"
        onClick={toggle}
        disabled={busy || state === 'denied'}
      >
        {busy ? 'Working...' : LABELS[state]}
      </button>
      {error && <p className="sidebar-notify-error">{error}</p>}
    </>
  );
}
