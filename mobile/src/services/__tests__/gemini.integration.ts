/**
 * Optional manual run: npx tsx mobile/src/services/__tests__/gemini.integration.ts
 */
import * as dotenv from 'dotenv';
import { decomposeCommand, selectOptimalPC, validateDependencies } from '../gemini';
import { mockFleetStatus } from './fixtures/fleet-status';

dotenv.config();

async function run() {
  console.log('selectOptimalPC →', selectOptimalPC('system_command', [], mockFleetStatus));

  if (!process.env.GEMINI_API_KEY) {
    console.log('Set GEMINI_API_KEY to run live decomposition.');
    return;
  }

  const out = await decomposeCommand('Install Docker on all online PCs', mockFleetStatus);
  console.log(JSON.stringify(out, null, 2));
  validateDependencies(out.tasks);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
