import type { DecomposedPlan, TaskIntent } from '../types/intent';

/** Coerce Gemini output so Rust `submit_planned_session` and Zod stay aligned. */
export function stabilizePlanForStdb(plan: DecomposedPlan): DecomposedPlan {
  return {
    tasks: plan.tasks.map((t: TaskIntent) => normalizeTask(t)),
  };
}

function normalizeTask(t: TaskIntent): TaskIntent {
  const params =
    t.params &&
    typeof t.params === 'object' &&
    !Array.isArray(t.params) &&
    t.params !== null
      ? (t.params as Record<string, unknown>)
      : {};

  let target: number | null = null;
  if (t.target_pc_id !== null && t.target_pc_id !== undefined) {
    const n = Number(t.target_pc_id);
    if (!Number.isNaN(n) && Number.isFinite(n)) {
      target = Math.trunc(n);
    }
  }

  let dep: number | undefined;
  if (t.depends_on !== null && t.depends_on !== undefined) {
    const n = Number(t.depends_on);
    if (!Number.isNaN(n) && n >= 0) {
      dep = Math.trunc(n);
    }
  }

  return {
    type: String(t.type ?? 'task').trim() || 'task',
    target_pc_id: target,
    command: String(t.command ?? '').trim(),
    params,
    ...(dep === undefined ? {} : { depends_on: dep }),
  };
}
