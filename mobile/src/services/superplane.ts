import type { DecomposedPlan } from '../types/intent';

/**
 * SuperPlane-style orchestration hook (dependencies, reroutes, external workflows).
 * Pass-through for now — replace with real SuperPlane when integrated.
 */
export function routePlanThroughSuperPlane(plan: DecomposedPlan): DecomposedPlan {
  return plan;
}
