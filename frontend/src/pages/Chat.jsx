import SocketProvider from '../context/SocketProvider';
import ChatProvider from '../context/ChatProvider';
import { useChat } from '../hooks/useChat';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import './Chat.css';

function ChatLayout() {
  const { conversations, activeId } = useChat();
  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="chat-layout">
      <Sidebar />
      <main className="chat-main">
        {active ? (
          // key makes React rebuild the window when you switch chats, resetting its state
          <ChatWindow key={active.id} conversation={active} />
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