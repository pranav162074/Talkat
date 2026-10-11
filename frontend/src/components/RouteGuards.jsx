import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Loading = () => <p style={{ textAlign: 'center', marginTop: '3rem' }}>Loading...</p>;

// Only for logged-in users
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

// Login and register pages: logged-in users go straight to the app
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Navigate to="/" replace /> : children;
}