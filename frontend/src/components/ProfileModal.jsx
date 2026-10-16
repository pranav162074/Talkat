import { useEffect, useState } from 'react';
import api from '../api/axios';
import './Modal.css';
import './ProfileModal.css';

const joinedOn = (iso) =>
  new Date(iso).toLocaleDateString([], { month: 'long', year: 'numeric' });

// Shows another person's public profile. Mount it only while it is open, so the
// loading state starts fresh each time.
export default function ProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    api
      .get(`/users/${userId}`)
      .then(({ data }) => {
        if (!cancelled) setProfile(data.user);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this profile');
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        {!profile && !error && <p className="pm-note">Loading...</p>}
        {error && <p className="modal-error">{error}</p>}

        {profile && (
          <>
            {profile.avatar ? (
              <img
                className="pm-avatar"
                src={profile.avatar}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="pm-avatar pm-avatar-fallback">
                {(profile.name?.trim()?.[0] || '?').toUpperCase()}
              </div>
            )}

            <h2 className="pm-name">{profile.name}</h2>
            <p className="pm-tagline">{profile.tagline}</p>

            {profile.bio ? (
              <p className="pm-bio">{profile.bio}</p>
            ) : (
              <p className="pm-bio pm-empty">No bio yet</p>
            )}

            <p className="pm-joined">On Talkat since {joinedOn(profile.createdAt)}</p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}