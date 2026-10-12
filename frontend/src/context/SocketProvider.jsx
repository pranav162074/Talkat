import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { SocketContext } from './socketContext';

export default function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) return;

    // The socket is an external resource, so it is created and stored from an effect
    const s = io(import.meta.env.VITE_SOCKET_URL, { auth: { token } });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}