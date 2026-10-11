import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { SocketContext } from './socketContext';

export default function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) return;

    // The backend checks this token during the handshake
    const s = io(import.meta.env.VITE_SOCKET_URL, { auth: { token } });
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}