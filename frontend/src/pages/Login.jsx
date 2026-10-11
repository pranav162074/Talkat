import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      // Account exists but the email isn't verified yet: a new code was just sent
      if (err.response?.status === 403 && data?.needsVerification) {
        navigate('/verify', { state: { email: data.email } });
        return;
      }
      setError(data?.message || 'Something went wrong, try again');
    } finally {
      setBusy(false);
    }
  };

  const onGoogleSuccess = async (response) => {
    setError('');
    try {
      const { data } = await api.post('/auth/google', { credential: response.credential });
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Google sign-in failed');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="auth-sub">Log in to Talkat</p>

        {error && <p className="auth-error">{error}</p>}

        <form onSubmit={onSubmit}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={onChange}
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={onChange}
            required
          />
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <div className="auth-divider">or</div>
        <div className="auth-google">
          <GoogleLogin
            onSuccess={onGoogleSuccess}
            onError={() => setError('Google sign-in failed')}
          />
        </div>

        <p className="auth-footer">
          No account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}