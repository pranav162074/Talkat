# Talkat

[![CI](https://github.com/pranav162074/Talkat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pranav162074/Talkat/actions/workflows/ci.yml)

A real-time chat app with 1-on-1 and group conversations, file and location sharing, user profiles, email OTP verification, Google sign-in, and Progressive Web App (PWA) support.

**Live demo:** https://talkat-app.onrender.com

> The backend runs on a free hosting plan that sleeps when idle, so the first request after a quiet period can take 15 to 60 seconds. After that it responds normally.

## Features

- **Authentication:** Email and password with bcrypt, email OTP verification, and Google sign-in. Google accounts link to an existing account with the same email.
- **Real-time messaging:** Socket.IO with JWT-authenticated connections, instant delivery, typing indicators, online presence, and read receipts.
- **Direct and group chats:** One direct chat per pair of users, groups with admin and member roles, admin-only add and remove, and automatic admin promotion when the last admin leaves.
- **Responsive mobile layout:** Full-screen conversation list and chat views on mobile, with back navigation. Desktop retains the two-panel layout.
- **Progressive Web App:** Install Talkat on supported browsers and devices for quick access from the home screen or desktop.
- **Automatic PWA updates:** Web app manifest, service worker, app icons, and automatic service-worker updates through Vite PWA.
- **Install prompt:** An in-app installation prompt appears when the browser supports the installation event.
- **User profiles:** A profile page where you can change your picture, name, tagline, and bio. Tap a person's name in a chat or group member list to see their profile.
- **Attachments:** Images, videos, and documents (up to 10 MB) stored on Cloudinary.
- **Location sharing:** Send your position and see it on an interactive Leaflet map inside the chat.
- **Message history:** Cursor-based pagination with infinite scroll, and unread counts per conversation.
- **Quality checks:** Automated API tests, frontend linting, production builds, and a CI pipeline on pull requests.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router, Axios, Socket.IO Client, React Leaflet |
| PWA | Vite PWA plugin, Web App Manifest, Workbox service worker |
| Backend | Node.js 20+, Express 5, Socket.IO, Zod |
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
    | HTTPS (REST)                  | WebSocket (Socket.IO)
    v                               v
Express + Socket.IO server (Render web service)
    |             |             |             |
    v             v             v             v
PostgreSQL       Redis      Cloudinary       Brevo
 (Neon)        (Upstash)      (files)      (OTP email)