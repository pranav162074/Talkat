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
    },
  },
});