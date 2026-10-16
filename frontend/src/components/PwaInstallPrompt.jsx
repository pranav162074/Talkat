
import { useEffect, useState } from 'react';
import './PwaInstallPrompt.css';

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  if (isInstalled || dismissed || !installPrompt) {
    return null;
  }

  return (
    <aside className="pwa-install-prompt" aria-label="Install Talkat">
      <div className="pwa-install-copy">
        <strong>Install Talkat</strong>
        <span>Get quick access from your home screen.</span>
      </div>

      <button
        type="button"
        className="pwa-install-button"
        onClick={handleInstall}
      >
        Install
      </button>

      <button
        type="button"
        className="pwa-dismiss-button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss install prompt"
      >
        x
      </button>
    </aside>
  );
}
