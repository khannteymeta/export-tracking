import { defineConfig } from 'vitest/config';
import path from 'path';

// Configure test environment variables before module imports are evaluated
process.env.DATABASE_URL = 'postgresql://postgres:1111@localhost:5432/exporttrack';
process.env.WEBHOOK_SECRET = 'tracker-webhook-secret-key-development';
process.env.BETTER_AUTH_URL = 'http://localhost';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
