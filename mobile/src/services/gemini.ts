import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DecomposedPlanSchema } from '../schemas/intent';
import { SynthesisOutputSchema } from '../schemas/synthesis';
import type { FleetPcSnapshot } from '../types/fleet';
import type { DecomposedPlan, TaskIntent } from '../types/intent';
import type { PcExecutionSnippet } from '../types/synthesis';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function pcId(agent: FleetPcSnapshot): number {
  return Number(agent.id);
}

function buildFleetContext(agents: FleetPcSnapshot[]): string {
  if (agents.length === 0) {
    return 'No PCs are registered.';
  }
  const lines = agents.map((a) => {
    let apps = a.installedApps;
    try {
      apps = JSON.stringify(JSON.parse(a.installedApps));
    } catch {
      /* keep raw */
    }
    return [
      `pc_id=${pcId(a)}`,
      `hostname=${a.hostname}`,
      `ip=${a.ip}`,
      `status=${a.status} (only use online PCs for work)`,
      `cpu_load_percent=${a.cpuLoad}`,
      `memory_usage_percent=${a.memoryUsage}`,
      `installed_apps_json=${apps}`,
    ].join(', ');
  });
  return [
    'FLEET PROFILE (use this to pick target_pc_id per sub-task):',
    ...lines.map((l) => `- ${l}`),
    '',
    'Profiling rules:',
    '- Match required software to installed_apps_json when choosing a PC.',
    '- Prefer lower cpu_load_percent and memory_usage_percent among suitable online PCs.',
    '- Do not assign work to status=offline.',
  ].join('\n');
}

const responseSchema = zodToJsonSchema(DecomposedPlanSchema, {
  $refStrategy: 'none',
});

const synthesisResponseSchema = zodToJsonSchema(SynthesisOutputSchema, {
  $refStrategy: 'none',
});

function extractText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (typeof r.text === 'string' && r.text.length > 0) {
    return r.text;
  }
  const part = r.candidates?.[0]?.content?.parts?.find((p) => p.text != null);
  if (part?.text) {
    return part.text;
  }
  throw new Error('Gemini returned no text');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Models sometimes emit params as a JSON string or omit it. */
function normalizeParams(p: unknown): Record<string, unknown> {
  if (p == null) return {};
  if (isPlainObject(p)) return p as Record<string, unknown>;
  if (typeof p === 'string') {
    try {
      const j = JSON.parse(p) as unknown;
      return isPlainObject(j) ? (j as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Tolerate root-level arrays, string params, and numeric strings from the API. */
function normalizeGeminiPlan(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    raw = { tasks: raw };
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.tasks)) {
    return raw;
  }
  return {
    ...raw,
    tasks: raw.tasks.map((item) => {
      if (!isPlainObject(item)) return item;
      const t = { ...item };
      t.params = normalizeParams(t.params);
      if (typeof t.target_pc_id === 'string' && /^-?\d+$/.test(t.target_pc_id)) {
        t.target_pc_id = Number(t.target_pc_id);
      }
      if (t.depends_on != null && typeof t.depends_on === 'string' && /^\d+$/.test(t.depends_on)) {
        t.depends_on = Number(t.depends_on);
      }
      return t;
    }),
  };
}

/**
 * Decompose a natural-language fleet command into structured tasks.
 * Uses Gemini structured JSON (`responseJsonSchema`) so output matches the schema.
 */
export async function decomposeCommand(
  input: string,
  fleetStatus: FleetPcSnapshot[],
  options?: { apiKey?: string; model?: string }
): Promise<DecomposedPlan> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('input must not be empty');
  }

  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const fleetBlock = buildFleetContext(fleetStatus);
  const prompt = [
    'You break user commands into atomic sub-tasks for a PC fleet.',
    '',
    fleetBlock,
    '',
    'For EACH sub-task you MUST set target_pc_id to the best pc_id from the profile above (or null only if no PC fits).',
    'Choose using: required apps vs installed_apps_json, current cpu_load_percent and memory_usage_percent, and online status.',
    '',
    'Output fields per task: type, target_pc_id, command, params (object), optionally depends_on (0-based index of a prior task).',
    '',
    `User command: ${JSON.stringify(trimmed)}`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
    },
  });

  const text = extractText(response);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  raw = normalizeGeminiPlan(raw);

  try {
    return DecomposedPlanSchema.parse(raw) as DecomposedPlan;
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid structured output: ${msg}`);
    }
    throw err;
  }
}

export function selectOptimalPC(
  _taskType: string,
  requiredApps: string[],
  fleetStatus: FleetPcSnapshot[]
): number {
  const candidates = fleetStatus.filter(
    (a) => a.status === 'online' && a.cpuLoad < 80 && a.memoryUsage < 90
  );
  if (candidates.length === 0) {
    throw new Error('No healthy PCs available for task assignment');
  }

  const matchesApps = (a: FleetPcSnapshot): boolean => {
    if (requiredApps.length === 0) return true;
    try {
      const installed: unknown = JSON.parse(a.installedApps);
      if (!Array.isArray(installed)) return false;
      const names = installed.map((x) => String(x).toLowerCase());
      return requiredApps.every((req) =>
        names.some((n) => n.includes(req.toLowerCase()))
      );
    } catch {
      return false;
    }
  };

  const pool = candidates.filter(matchesApps);
  const pickFrom = pool.length > 0 ? pool : candidates;
  const best = pickFrom.reduce((a, b) => (a.cpuLoad <= b.cpuLoad ? a : b));
  return pcId(best);
}

export function validateDependencies(tasks: TaskIntent[]): void {
  tasks.forEach((task, i) => {
    if (task.depends_on == null) return;
    const d = task.depends_on;
    if (d < 0 || d >= i) {
      throw new Error(
        `Task ${i} depends_on ${d} is invalid (must be an earlier index 0..${i - 1})`
      );
    }
  });
}

/** Build the user message sent to Gemini for synthesis (handy for tests / debugging). */
export function buildSynthesisPrompt(results: PcExecutionSnippet[]): string {
  if (results.length === 0) {
    throw new Error('results must not be empty');
  }
  return [
    'Summarize these fleet task results in 2–4 sentences for an operator.',
    'Mention each PC (hostname or pc_id), whether work succeeded (exit_code), and any notable stderr or enforcement_decision.',
    '',
    'Raw results (JSON):',
    JSON.stringify(results, null, 2),
  ].join('\n');
}

/**
 * Turn many per-PC execution snippets into one short natural-language summary.
 */
export async function synthesizeResults(
  results: PcExecutionSnippet[],
  options?: { apiKey?: string; model?: string }
): Promise<string> {
  if (results.length === 0) {
    throw new Error('results must not be empty');
  }

  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildSynthesisPrompt(results);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: synthesisResponseSchema,
    },
  });

  const text = extractText(response);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Synthesis response was not valid JSON');
  }

  if (typeof raw === 'string') {
    raw = { summary: raw };
  }

  const parsed = SynthesisOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid synthesis output: ${msg}`);
  }
  return parsed.data.summary;
}
