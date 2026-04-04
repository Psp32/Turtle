/**
 * Real Gemini calls — not part of default `npm test`.
 * Run: `npm run test:live` (uses `vitest.live.config.ts`).
 * Without GEMINI_API_KEY the suite is skipped (exit 0).
 */
import * as dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { decomposeCommand, synthesizeResults } from '../gemini';
import { mockFleetStatus } from './fixtures/fleet-status';
import { mockMultiPcResults } from './fixtures/multi-pc-results';

dotenv.config();

describe.skipIf(!process.env.GEMINI_API_KEY)('Gemini live API', () => {
  it('decomposeCommand returns tasks', async () => {
    const result = await decomposeCommand(
      'Update the database config on the DB server',
      mockFleetStatus
    );

    expect(result.tasks.length).toBeGreaterThan(0);
    for (const t of result.tasks) {
      expect(t.command).toBeTruthy();
    }
  }, 60_000);

  it('synthesizeResults returns text', async () => {
    const summary = await synthesizeResults(mockMultiPcResults);
    expect(summary.trim().length).toBeGreaterThan(10);
  }, 60_000);
});
