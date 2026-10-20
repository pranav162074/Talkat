# Talkat

[![CI](https://github.com/pranav162074/Talkat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pranav162074/Talkat/actions/workflows/ci.yml)

A real-time chat application with 1-on-1 and group conversations, message editing and unsending, file and location sharing, user profiles, email OTP verification, Google sign-in, and Progressive Web App (PWA) support.

**Live demo:** [https://talkat-app.onrender.com](https://talkat-app.onrender.com)

> **Note:** The backend runs on a free hosting plan that may sleep when idle, so the first request after a quiet period can take 15–60 seconds. After that, it should respond normally.

## Features

- **Authentication:** Email and password authentication with bcrypt, email OTP verification, and Google sign-in. Google accounts link to existing accounts with the same email.
- **Real-time messaging:** Socket.IO with JWT-authenticated connections, instant message delivery, typing indicators, online presence, and read receipts.
- **Message editing:** Edit your own text messages within 5 minutes of sending them. Edited messages display an edited indicator, and the time limit is enforced by the backend.
- **Message unsending:** Unsend your own messages at any time, including messages containing attachments or location data. Unsent messages display a placeholder while preserving conversation ordering.
- **Live message updates:** Message edits and unsends synchronize between participants through Socket.IO without requiring a page refresh.
- **Direct and group chats:** One direct conversation per pair of users, groups with admin and member roles, admin-only member management, and automatic admin promotion when the last admin leaves.
- **Responsive mobile layout:** Full-screen conversation list and chat views on mobile, with back navigation. Desktop retains the two-panel layout.
- **Progressive Web App:** Install Talkat on supported browsers and devices for quick access from the home screen or desktop.
- **Automatic PWA updates:** Web app manifest, service worker, app icons, and automatic service-worker updates through Vite PWA.
- **Install prompt:** An in-app installation prompt appears when the browser supports the installation event.
- **Push notifications:** Web Push (VAPID) notifications for new messages, sent only to people who don't have Talkat on screen. Each tab reports its visibility over Socket.IO, notifications collapse per chat, and tapping one opens that chat. Logging out turns notifications off on that device.
- **User profiles:** Change your profile picture, name, tagline, and bio. Tap a person's name in a chat or group member list to view their profile.
- **Attachments:** Share images, videos, and documents up to 10 MB, stored on Cloudinary.
- **Location sharing:** Send your location and view it on an interactive Leaflet map inside the chat.
- **Message history:** Cursor-based pagination with infinite scroll and unread counts per conversation.
- **Caching:** Redis-backed caching for recent messages, with cache invalidation after edits and unsends.
- **Quality checks:** Automated API tests, frontend linting, production builds, and a GitHub Actions CI pipeline.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router, Axios, Socket.IO Client, React Leaflet |
| PWA | Vite PWA plugin, Web App Manifest, Workbox service worker |
| Backend | Node.js 20+, Express 5, Socket.IO, Zod |
| Database | PostgreSQL (Neon) with Prisma 6 |
| Cache and ephemeral data | Redis (Upstash) |
| File storage | Cloudinary |
| Email | Brevo HTTP API |
| Push notifications | Web Push API, VAPID, `web-push` |
| Authentication | JWT, bcrypt, Google Identity Services |
| Testing and CI | Vitest, Supertest, GitHub Actions |
| Hosting | Render (backend web service and frontend static site) |

## Architecture

```text
React app (Render static site)
    | HTTPS (REST API)           | WebSocket (Socket.IO)
    v                            v
Express + Socket.IO server (Render web service)
    |              |             |              |
    v              v             v              v
PostgreSQL        Redis       Cloudinary       Brevo
(Neon)           (Upstash)     (files)       (OTP email)
```

## Message Editing and Unsend

Talkat supports editing and unsending messages with server-side authorization.

- **Edit:** Only the original sender can edit a text message, and only within 5 minutes of its creation.
- **Unsend:** Only the original sender can unsend a message. There is no time limit.
- **Soft deletion:** Unsent messages remain in the database with a deletion timestamp to preserve conversation ordering and existing references. Their visible content, attachment metadata, and location data are cleared from the message record.
- **Real-time synchronization:** Socket.IO events notify conversation participants when messages are edited or unsent.
- **Cache consistency:** Recent-message caches are invalidated after edits and unsends.

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm
- PostgreSQL database
- Redis instance
- Cloudinary account for attachments
- Brevo account/API key for email OTP
- Google OAuth client configuration if Google sign-in is enabled

### 1. Clone the Repository

```bash
git clone https://github.com/pranav162074/Talkat.git
cd Talkat
```

### 2. Install Dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3. Configure Environment Variables

Create the required environment files for the backend and frontend. Configure the database, Redis, JWT, email, Cloudinary, Google authentication, and frontend API URL settings according to the variable names used in the project's configuration.

**Do not commit environment files or secrets to GitHub.**

### 4. Apply Database Migrations

From the backend directory, run:

```bash
npx prisma migrate deploy
```

This applies pending Prisma migrations without resetting the database. Ensure your database connection is configured correctly before running the command.

### 5. Run the Application

Start the backend and frontend in separate terminals using the development scripts defined in their respective `package.json` files.

Open the local frontend URL printed by Vite in your browser.

## Testing

The project uses Vitest and Supertest for automated backend API tests, alongside frontend linting and production build checks.

Backend tests require a dedicated test environment, including PostgreSQL and Redis. Follow the repository's test setup and environment requirements.

GitHub Actions runs the configured CI checks on pull requests and pushes to the relevant branches.

## Deployment

- Deploy the frontend and backend to their configured hosting services.
- Set all required production environment variables in the hosting dashboards.
- Apply pending Prisma migrations to the production database before using schema-dependent features.
- Ensure the frontend points to the deployed backend API and the Socket.IO connection is configured for the production origin.
- Keep API keys, database credentials, JWT secrets, and OAuth secrets out of source control.
- To enable push notifications, generate a VAPID key pair once with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` on the backend. Without them the app runs normally and sends no notifications. Changing the keys later invalidates every existing subscription.
- Uploaded files are stored on Cloudinary. Clearing an attachment URL from a message record does not necessarily delete the underlying file from Cloudinary.

## Security and Data Handling

- Passwords are hashed with bcrypt.
- Protected API routes use authentication and authorization checks.
- Message editing and unsending are restricted to the original sender.
- Message edit time limits are validated by the backend, not only by the frontend.
- Unsent message content, attachment metadata, and location data are cleared from the message record.
- Push subscription endpoints are restricted to known browser push services, so the server can't be made to send requests to arbitrary URLs.
- Notification payloads are encrypted for the receiving browser, so push services can't read message previews.