import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // All test files share one database, so run them one after another
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-only-for-tests',
      CLIENT_URL: 'http://localhost:5173',
      // A key pair made only for tests, so the push code runs in CI. Never use it anywhere else.
      VAPID_PUBLIC_KEY: 'BMAxgStKcP311cICnK0UTmgUjcJKiFDvMmquht0a-t12e9HuKGDklDDvueJc2pTG41uMcRm752flOHT6k_aWcdo',
      VAPID_PRIVATE_KEY: 'MvLf--9thkJYmk1V0fYkd13BXLQvwlLuaYg5A9vQWks',
      VAPID_SUBJECT: 'mailto:tests@example.com',
    },
  },
});