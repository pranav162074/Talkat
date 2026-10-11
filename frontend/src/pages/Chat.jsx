import SocketProvider from '../context/SocketProvider';
import ChatProvider from '../context/ChatProvider';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import Sidebar from '../components/Sidebar';
import './Chat.css';

function ChatLayout() {
  const { user } = useAuth();
  const { conversations, activeId } = useChat();
  const active = conversations.find((c) => c.id === activeId);

  const title = active
    ? active.type === 'GROUP'
      ? active.name
      : active.participants.find((p) => p.id !== user.id)?.name
    : null;

  return (
    <div className="chat-layout">
      <Sidebar />
      <main className="chat-main">
        {active ? (
          <div className="chat-placeholder">
            <h2>{title}</h2>
            <p>Messages arrive in the next branch.</p>
          </div>
        ) : (
          <div className="chat-placeholder">
            <h2>Talkat</h2>
            <p>Select a chat or search for someone to start talking.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// The providers live here, so the socket only connects for logged-in users
export default function Chat() {
  return (
    <SocketProvider>
      <ChatProvider>
        <ChatLayout />
      </ChatProvider>
    </SocketProvider>
  );
}