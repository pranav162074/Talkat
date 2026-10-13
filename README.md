# Talkat

**Talkat** is a real-time chat application built to provide user authentication, messaging, and group conversations through a modern web interface.

## Features

- **Authentication** — Login, registration, and OTP verification interfaces.
- **Real-Time Communication** — Socket-based communication for chat functionality.
- **Private and Group Chats** — Chat interface with group creation and group information components.
- **Message Interface** — Dedicated message bubbles and message input components.
- **Location Sharing** — Map component for displaying location-related messages.
- **Protected Routes** — Route guards for controlling access to application pages.
- **State Management** — Context providers and custom hooks for authentication, chats, and socket connections.
- **Reusable Components** — Modular React components for a maintainable frontend architecture.

## Tech Stack

### Frontend
- React
- JavaScript (JSX)
- CSS
- Axios
- Socket.IO client
- Leaflet or a compatible mapping library for location features

### Backend and Infrastructure
The backend and infrastructure technologies should be documented according to the actual implementation in the project.

## Project Structure

```text
Talkat/
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── api/
│       │   └── axios.js
│       ├── components/
│       │   ├── ChatWindow.jsx
│       │   ├── CreateGroupModal.jsx
│       │   ├── GroupInfoModal.jsx
│       │   ├── LocationMap.jsx
│       │   ├── MessageBubble.jsx
│       │   ├── MessageInput.jsx
│       │   ├── Modal.css
│       │   ├── RouteGuards.jsx
│       │   ├── Sidebar.jsx
│       │   └── UserPicker.jsx
│       ├── contexts/
│       │   ├── authContext.js
│       │   ├── AuthProvider.jsx
│       │   ├── chatContext.js
│       │   ├── ChatProvider.jsx
│       │   ├── socketContext.js
│       │   └── SocketProvider.jsx
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useChat.js
│       │   ├── useMessages.js
│       │   └── useSocket.js
│       ├── pages/
│       │   ├── Auth.css
│       │   ├── Chat.css
│       │   ├── Chat.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   └── VerifyOtp.jsx
│       ├── utils/
│       │   └── format.js
│       ├── App.jsx
│       ├── index.css
│       └── main.jsx
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm
- The services and environment variables required by the backend, if applicable

### Installation

Clone the repository:

```bash
git clone https://github.com/pranav162074/Talkat.git
cd Talkat
```

Install the frontend dependencies:

```bash
cd frontend
npm install
```

### Running the Frontend

Start the frontend using the development script defined in `frontend/package.json`. For a Vite project, the usual command is:

```bash
npm run dev
```

Open the local URL printed in the terminal.

### Backend Configuration

If the project includes a separate backend, install its dependencies and configure the required environment variables according to its package configuration and environment example files. Start the backend using its defined scripts.

Ensure the frontend API client is configured to connect to the correct backend URL.

## Application Architecture

Talkat organizes its frontend into distinct layers:

- **Pages** handle the main application screens.
- **Components** provide reusable chat, message, group, and location interfaces.
- **Contexts and Providers** manage shared authentication, chat, and socket state.
- **Custom Hooks** provide reusable access to application state and messaging functionality.
- **API Layer** centralizes HTTP communication through Axios.
- **Utilities** contain shared helper functions.

## Future Improvements

Potential areas for further development include:

- Message delivery and read receipts
- Typing indicators and online presence
- Image and file sharing
- Push notifications
- Improved accessibility and responsive layouts
- Automated testing and deployment

## Repository

[GitHub — Talkat](https://github.com/pranav162074/Talkat)

## License

A license has not yet been specified. Add a `LICENSE` file if the project is intended for public reuse.
