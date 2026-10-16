import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import './Profile.css';
import { useTheme } from '../context/useTheme';

const MAX_PICTURE_SIZE = 5 * 1024 * 1024; // same 5 MB limit as the backend
const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [name, setName] = useState(user.name);
  const [tagline, setTagline] = useState(user.tagline || '');
  const [bio, setBio] = useState(user.bio || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [pictureBusy, setPictureBusy] = useState(false);
  const fileRef = useRef(null);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Only the fields that actually changed are sent
  const changes = {};
  if (name.trim() !== user.name) changes.name = name.trim();
  if (tagline.trim() !== (user.tagline || '')) changes.tagline = tagline.trim();
  if (bio.trim() !== (user.bio || '')) changes.bio = bio.trim();
  const hasChanges = Object.keys(changes).length > 0;

  const onSave = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!hasChanges) return;

    setSaving(true);
    try {
      const { data } = await api.patch('/users/me', changes);
      updateUser(data.user);
      // Show what the server saved (trimmed values)
      setName(data.user.name);
      setTagline(data.user.tagline || '');
      setBio(data.user.bio || '');
      setSuccess('Profile saved');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const onPictureChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // lets you pick the same file again later
    if (!file || pictureBusy) return;

    clearMessages();
    if (!PICTURE_TYPES.includes(file.type)) {
      setError('Profile pictures must be JPG, PNG or WebP');
      return;
    }
    if (file.size > MAX_PICTURE_SIZE) {
      setError('Picture is too large (max 5 MB)');
      return;
    }

    setPictureBusy(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', form);
      updateUser(data.user);
      setSuccess('Profile picture updated');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not upload the picture');
    } finally {
      setPictureBusy(false);
    }
  };

  const onRemovePicture = async () => {
    if (pictureBusy) return;
    clearMessages();
    setPictureBusy(true);
    try {
      const { data } = await api.delete('/users/me/avatar');
      updateUser(data.user);
      setSuccess('Profile picture removed');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove the picture');
    } finally {
      setPictureBusy(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-top">
          <h1>Your profile</h1>
          <Link to="/" className="btn-link">
            ← Back to chats
          </Link>
        </div>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="profile-success">{success}</p>}

        <div className="profile-picture">
          {user.avatar ? (
            <img
              className="profile-avatar"
              src={user.avatar}
              alt="Your profile"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="profile-avatar profile-avatar-fallback">
              {(user.name?.trim()?.[0] || '?').toUpperCase()}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPictureChange}
            hidden
          />
          <div className="profile-picture-actions">
            <button
              type="button"
              className="btn-link"
              onClick={() => fileRef.current.click()}
              disabled={pictureBusy}
            >
              {pictureBusy ? 'Working...' : user.avatar ? 'Change picture' : 'Upload picture'}
            </button>
            {user.avatar && (
              <button
                type="button"
                className="btn-link modal-danger"
                onClick={onRemovePicture}
                disabled={pictureBusy}
              >
                Remove
              </button>
            )}
          </div>
          <p className="profile-email">{user.email}</p>
            <div className="profile-theme">
              <div className="profile-theme-info">
                <span className="profile-theme-title">Appearance</span>
                <span className="profile-theme-description">
                  {theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}
                </span>
              </div>

              <button
                type="button"
                className="profile-theme-toggle"
                onClick={toggleTheme}
                aria-pressed={theme === 'dark'}
                aria-label="Toggle dark mode"
              >
                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>

        <form className="profile-form" onSubmit={onSave}>
          <div className="profile-field">
            <label className="profile-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="profile-input"
              value={name}
              maxLength={50}
              onChange={(e) => {
                setName(e.target.value);
                clearMessages();
              }}
              required
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="tagline">
              Tagline
              <span className="profile-count">{tagline.length}/60</span>
            </label>
            <input
              id="tagline"
              className="profile-input"
              value={tagline}
              maxLength={60}
              placeholder="Hey! I'm on Talkat"
              onChange={(e) => {
                setTagline(e.target.value);
                clearMessages();
              }}
              required
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="bio">
              Bio
              <span className="profile-count">{bio.length}/200</span>
            </label>
            <textarea
              id="bio"
              className="profile-input"
              value={bio}
              maxLength={200}
              placeholder="Tell people a little about yourself"
              onChange={(e) => {
                setBio(e.target.value);
                clearMessages();
              }}
            />
          </div>

          <button className="btn-primary" disabled={saving || !hasChanges}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}