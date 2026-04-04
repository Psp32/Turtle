import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['mobile/src/**/*.test.ts'],
    /** Live Gemini file is opt-in: `npm run test:live` */
    exclude: ['**/node_modules/**', '**/gemini.live.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
