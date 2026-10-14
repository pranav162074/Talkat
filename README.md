# Talkat

A real-time chat app with 1-on-1 and group conversations, file and location sharing, email OTP verification and Google sign-in.

**Live demo:** https://talkat-app.onrender.com

> The backend runs on a free hosting plan that sleeps when idle, so the first request after a quiet period can take 15 to 60 seconds. After that it responds normally.

## Features

- **Authentication:** email and password with bcrypt, email OTP verification, and Google sign-in. Google accounts link to an existing account with the same email.
- **Real-time messaging:** Socket.io with JWT-authenticated connections, instant delivery, typing indicators, online presence and read receipts.
- **Direct and group chats:** one direct chat per pair of users, groups with admin and member roles, admin-only add and remove, and automatic admin promotion when the last admin leaves.
- **Attachments:** images, videos and documents (up to 10 MB) stored on Cloudinary.
- **Location sharing:** send your position and see it on an interactive Leaflet map inside the chat.
- **Message history:** cursor-based pagination with infinite scroll, and unread counts per conversation.
- **Quality checks:** automated API tests and a CI pipeline on every pull request.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router, Axios, Socket.io client, React Leaflet |
| Backend | Node.js 20+, Express 5, Socket.io, Zod |
| Database | PostgreSQL (Neon) with Prisma 6 |
| Cache and ephemeral data | Redis (Upstash) |
| File storage | Cloudinary |
| Email | Brevo HTTP API |
| Auth | JWT, bcrypt, Google Identity Services |
| Testing and CI | Vitest, Supertest, GitHub Actions |
| Hosting | Render (backend web service and frontend static site) |

## Architecture

```text
React app (Render static site)
   |  HTTPS (REST)                  |  WebSocket (Socket.io)
   v                                v
Express + Socket.io server (Render web service)
   |            |             |              |
   v            v             v              v
PostgreSQL    Redis       Cloudinary       Brevo
 (Neon)     (Upstash)      (files)        (OTP email)
```

### Design decisions

- **PostgreSQL for chat data.** Users, conversations, participants and messages are relational, so foreign keys, unique constraints and joins fit naturally.
- **Direct chats are unique per pair.** A sorted `directKey` with a unique constraint means the database itself prevents duplicates, even if two users open the chat at the same moment.
- **OTP codes live in Redis, not Postgres.** Codes are stored hashed with a 5-minute TTL, a 60-second resend cooldown and a 5-attempt lockout.
- **Message history uses cursor pagination.** Offset pagination shifts when new messages arrive, while a cursor stays stable and uses the `(conversationId, createdAt)` index.
- **Recent messages are cached in Redis.** Reads use cache-aside, sends write through only when the cache already exists, and any Redis failure falls back to Postgres.
- **Unread counts come from one SQL query.** Each member stores a `lastReadMessageId`, which also drives read receipts, so there is no per-message, per-user table.
- **One delivery path for messages.** The REST endpoints and the socket events call the same service and emit through the same helper.
- **Presence supports multiple tabs.** Each user has a Redis set of socket ids and counts as online while the set is non-empty.
- **The Socket.io Redis adapter is optional.** Set `USE_REDIS_ADAPTER=true` to broadcast across several server instances. It is off by default to stay within free-tier Redis command limits.
- **Security basics.** Passwords are hashed, input is validated with Zod, auth and message endpoints are rate limited, login errors do not reveal which emails exist, user search matches emails exactly only, and uploads use a file type allow-list and a size limit.

## Project structure

```text
Talkat/
├── .github/workflows/ci.yml      # Tests, lint and build on every pull request
├── backend/
│   ├── prisma/                   # Schema and migrations
│   ├── src/
│   │   ├── config/               # env, prisma, redis, cloudinary
│   │   ├── controllers/          # auth, user, conversation, message
│   │   ├── middleware/           # auth, validation, rate limits, uploads
│   │   ├── routes/
│   │   ├── services/             # otp, email, google, messages, uploads
│   │   ├── sockets/              # handshake auth, handlers, emitters
│   │   ├── utils/
│   │   ├── app.js                # Express app (imported by tests)
│   │   └── server.js             # HTTP server and Socket.io
│   └── tests/                    # Vitest and Supertest tests
└── frontend/
    └── src/
        ├── api/                  # Axios instance
        ├── components/           # Sidebar, ChatWindow, MessageBubble, modals, map
        ├── context/              # Auth, socket and chat providers
        ├── hooks/                # useAuth, useSocket, useChat, useMessages
        ├── pages/                # Login, Register, VerifyOtp, Chat
        └── utils/
```

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create an account and send an OTP |
| POST | `/api/auth/verify-otp` | Verify the email and receive a token |
| POST | `/api/auth/resend-otp` | Send a new code (60 second cooldown) |
| POST | `/api/auth/login` | Log in with email and password |
| POST | `/api/auth/google` | Log in with a Google credential |
| GET | `/api/auth/me` | Current user |
| GET | `/api/users/search?q=` | Find people by name or exact email |
| POST | `/api/conversations/direct` | Open or create a 1-on-1 chat |
| POST | `/api/conversations/group` | Create a group |
| GET | `/api/conversations` | List conversations with unread counts |
| GET | `/api/conversations/:id` | One conversation |
| POST | `/api/conversations/:id/participants` | Add members (admin) |
| DELETE | `/api/conversations/:id/participants/:userId` | Remove a member (admin) or leave |
| GET | `/api/conversations/:id/messages?limit=&cursor=` | Message history, newest first |
| POST | `/api/conversations/:id/messages` | Send a text or location message |
| POST | `/api/conversations/:id/attachments` | Upload a file as a message |
| POST | `/api/conversations/:id/read` | Mark messages as read |
| GET | `/health` | Server, Postgres and Redis status |
| GET | `/ping` | Lightweight check for uptime monitors |

### Socket events

| Event | Direction | Purpose |
|---|---|---|
| `message:send` (with ack) | client to server | Send a text or location message |
| `message:new` | server to room | Deliver a message |
| `typing` | both | Typing indicator |
| `message:read` (with ack) | client to server | Move the read marker forward |
| `conversation:read` | server to room | Read receipt |
| `presence:snapshot`, `presence:update` | server to client | Online status of contacts |
| `conversation:new`, `conversation:removed`, `conversation:members-changed` | server to client | Keep chat lists in sync |

## Running locally

### Prerequisites

- Node.js 20 or newer
- Free accounts for the services below (no local Docker needed):
  - [Neon](https://neon.tech) for PostgreSQL
  - [Upstash](https://upstash.com) for Redis
  - [Brevo](https://www.brevo.com) for OTP emails, with one verified sender address
  - [Cloudinary](https://cloudinary.com) for file storage
  - [Google Cloud Console](https://console.cloud.google.com) for an OAuth Client ID, with `http://localhost:5173` as an authorized JavaScript origin

### Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in the values
npx prisma migrate deploy
npm run dev
```

The server starts on `http://localhost:5000`. Check `http://localhost:5000/health`.

If `BREVO_API_KEY` is left empty, OTP codes are printed in the server terminal instead of being emailed, which is handy for development.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # then fill in the values
npm run dev
```

Open `http://localhost:5173`.

### Environment variables

**Backend (`backend/.env`)**

| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `NODE_ENV` | `development` or `production` |
| `CLIENT_URL` | Allowed frontend origin or origins, comma-separated |
| `DATABASE_URL` | Pooled PostgreSQL connection string |
| `DIRECT_URL` | Direct PostgreSQL connection string (used by migrations) |
| `REDIS_URL` | Redis connection string (`rediss://` for TLS) |
| `USE_REDIS_ADAPTER` | `true` to enable the Socket.io Redis adapter |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing secret and lifetime |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Email delivery |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | File storage |

**Frontend (`frontend/.env`)**

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend REST base URL, for example `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | Backend origin, for example `http://localhost:5000` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |

Never commit `.env` files. Only the `.env.example` templates belong in Git.

## Testing and CI

The backend has 19 automated tests with Vitest and Supertest, covering the signup and OTP flow, login rules, direct and group conversations, message ordering, pagination, unread counts and admin permissions.

```bash
cd backend
npm test
```

The tests create and delete data, so a safety guard refuses to run unless the database and Redis URLs point at `localhost`, `127.0.0.1` or the CI service hostnames. In practice they run in GitHub Actions, which starts throwaway Postgres and Redis containers, applies the migrations to an empty database and runs the suite. The same workflow lints and builds the frontend.

Pull requests to `main` must pass both checks before merging.

## Deployment

- **Backend:** a Render web service with root directory `backend`, build command `npm install --include=dev && npx prisma migrate deploy` and start command `npm start`. The health check path is `/ping`.
- **Frontend:** a Render static site with root directory `frontend`, build command `npm install && npm run build` and publish directory `dist`. A rewrite rule sends `/*` to `/index.html` so client-side routes work on refresh.
- After deploying the frontend, set the backend's `CLIENT_URL` to the frontend address and add that address to the Google OAuth client's authorized JavaScript origins.

## Known limitations

- **Free hosting sleeps when idle.** Expect a cold start after inactivity.
- **The auth token is stored in `localStorage`.** This is simple, but any script on the page can read it. httpOnly cookies would be stronger.
- **File type checks trust the type reported by the browser.** A stricter version would inspect file contents.
- **Presence can go stale if a server instance crashes** while the Redis adapter is enabled. A heartbeat would fix this.
- **Realtime behavior is not covered by automated tests yet.** Socket events are tested manually.
- **No push notifications or message editing and deletion.**
