/**
 * Local smoke test for Gemini decomposition.
 * Run: npm run gemini:demo -- "your command here"
 */
import * as dotenv from 'dotenv';
import { decomposeCommand, validateDependencies } from './gemini';
import { mockFleetStatus } from './__tests__/fixtures/fleet-status';

dotenv.config();

async function main() {
  const command = process.argv[2];
  if (!command) {
    console.log('Usage: npm run gemini:demo -- "your natural language command"');
    process.exit(0);
  }

  const result = await decomposeCommand(command, mockFleetStatus);
  console.log(JSON.stringify(result, null, 2));
  validateDependencies(result.tasks);
  console.error('OK: dependencies valid');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
