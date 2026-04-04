import { decomposeCommand, type GeminiClientOptions } from './gemini';
import { stabilizePlanForStdb } from './planWire';
import { routePlanThroughSuperPlane } from './superplane';
import type { FleetPcSnapshot } from '../types/fleet';
import type { DecomposedPlan } from '../types/intent';

export type SubmitFleetCommandResult = {
  plan: DecomposedPlan;
  /** String passed to `submit_planned_session(..., plan_json)`. */
  planJson: string;
};

/**
 * Mobile / API path: fleet snapshot → Gemini decomposition → SuperPlane hook → JSON safe for SpacetimeDB.
 * Call `submit_planned_session` on your module with `raw_input` + `planJson` (after `spacetime generate`).
 */
export async function submitFleetCommandFlow(
  rawInput: string,
  fleet: FleetPcSnapshot[],
  options?: GeminiClientOptions
): Promise<SubmitFleetCommandResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('rawInput is empty');
  }

  const decomposed = await decomposeCommand(trimmed, fleet, options);
  const routed = routePlanThroughSuperPlane(decomposed);
  const plan = stabilizePlanForStdb(routed);

  for (const t of plan.tasks) {
    if (!t.command) {
      throw new Error('stabilized plan contains an empty command');
    }
  }

  return {
    plan,
    planJson: JSON.stringify(plan),
  };
}
