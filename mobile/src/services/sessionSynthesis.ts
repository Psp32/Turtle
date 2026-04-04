import { synthesizeResults, type GeminiClientOptions } from './gemini';
import type { PcExecutionSnippet } from '../types/synthesis';

/** Mirrors `task_queue` fields needed for synthesis (camelCase JSON). */
export type SessionTaskRow = {
  id: number;
  commandSessionId: number;
  commandText: string;
  assignedPcId?: number | null;
};

/** Mirrors `task_result` (camelCase JSON). */
export type SessionTaskResultRow = {
  taskId: number;
  pcId: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  enforcementDecision: string;
};

export type SessionPcRow = {
  id: number;
  hostname: string;
};

/**
 * True when every `task_queue` row for `sessionId` has at least one matching `task_result.taskId`.
 * Same idea as the module’s `session_all_tasks_have_results` after each `report_result`.
 */
export function sessionAllTasksHaveResults(
  sessionId: number,
  tasks: SessionTaskRow[],
  results: SessionTaskResultRow[]
): boolean {
  const inSession = tasks.filter((t) => t.commandSessionId === sessionId);
  if (inSession.length === 0) {
    return false;
  }
  const withResult = new Set(results.map((r) => r.taskId));
  return inSession.every((t) => withResult.has(t.id));
}

/** Build Gemini input: one snippet per session task, in `tasks` table order. */
export function buildSnippetsForSession(
  sessionId: number,
  tasks: SessionTaskRow[],
  results: SessionTaskResultRow[],
  agents: SessionPcRow[]
): PcExecutionSnippet[] {
  const hostnameFor = (pcId: number) => agents.find((a) => a.id === pcId)?.hostname;
  const byTask = new Map(results.map((r) => [r.taskId, r]));
  const ordered = tasks.filter((t) => t.commandSessionId === sessionId);

  return ordered.map((t) => {
    const r = byTask.get(t.id);
    if (!r) {
      throw new Error(`missing TaskResult for task_id ${t.id}`);
    }
    return {
      pc_id: r.pcId,
      hostname: hostnameFor(r.pcId),
      task_id: t.id,
      command: t.commandText,
      stdout: r.stdout,
      stderr: r.stderr,
      exit_code: r.exitCode,
      enforcement_decision: r.enforcementDecision,
    };
  });
}

/**
 * When the session is fully reported, call Gemini `synthesizeResults`, then persist with reducer
 * `set_synthesis_summary(session_id, summary)` from your SpacetimeDB client.
 */
export async function runSessionSynthesis(
  sessionId: number,
  tasks: SessionTaskRow[],
  results: SessionTaskResultRow[],
  agents: SessionPcRow[],
  options?: GeminiClientOptions
): Promise<string> {
  if (!sessionAllTasksHaveResults(sessionId, tasks, results)) {
    throw new Error('not all tasks in this session have a TaskResult yet');
  }
  const snippets = buildSnippetsForSession(sessionId, tasks, results, agents);
  return synthesizeResults(snippets, options);
}
