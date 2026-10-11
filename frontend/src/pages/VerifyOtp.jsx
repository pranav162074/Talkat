import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

export default function VerifyOtp() {
  const { state } = useLocation();
  const email = state?.email;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  // A code was just sent, so resend is locked for the backend's 60 seconds
  const [cooldown, setCooldown] = useState(60);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Opened directly without registering first
  if (!email) return <Navigate to="/login" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email, code });
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong, try again');
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setError('');
    setInfo('');
    try {
      await api.post('/auth/resend-otp', { email });
      setInfo('A new code was sent');
      setCooldown(60);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the code');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Check your email</h1>
        <p className="auth-sub">We sent a 6-digit code to {email}. It expires in 5 minutes.</p>

        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-sub">{info}</p>}

        <form onSubmit={onSubmit}>
          <input
            className="otp-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
          <button className="btn-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <p className="auth-footer">
          Didn't get it?{' '}
          <button className="btn-link" onClick={onResend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <br />
          Check your spam folder too.
        </p>
      </div>
    </div>
  );
}