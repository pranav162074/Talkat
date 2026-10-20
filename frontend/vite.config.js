
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: ['favicon.svg'],

      manifest: {
        id: '/',
        name: 'Talkat - Real-Time Chat',
        short_name: 'Talkat',
        description:
          'Private conversations, group chats, and real-time messaging.',

        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',

        theme_color: '#111827',
        background_color: '#f5f6fa',

        categories: ['social', 'communication'],

        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Adds the push and notification-click handlers from public/push-sw.js
        importScripts: ['push-sw.js'],
        navigateFallback: 'index.html',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff2}',
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
