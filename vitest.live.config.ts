import { defineConfig } from 'vitest/config';

/** Opt-in real Gemini calls (`npm run test:live`). Separate from default config so this file is not excluded. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['mobile/src/services/__tests__/gemini.live.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
