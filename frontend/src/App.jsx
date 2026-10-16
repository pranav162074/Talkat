import { Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider from './context/AuthProvider';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyOtp from './pages/VerifyOtp';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import PwaInstallPrompt from './components/PwaInstallPrompt';

export default function App() {
  return (
    <AuthProvider>
      <PwaInstallPrompt />

      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/verify" element={<PublicOnlyRoute><VerifyOtp /></PublicOnlyRoute>} />
        <Route path="/" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}