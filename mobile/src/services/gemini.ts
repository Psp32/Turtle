import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DecomposedPlanSchema } from '../schemas/intent';
import { SynthesisOutputSchema } from '../schemas/synthesis';
import type { FleetPcSnapshot } from '../types/fleet';
import type { DecomposedPlan, TaskIntent } from '../types/intent';
import type { PcExecutionSnippet } from '../types/synthesis';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 500;
const DEFAULT_TIMEOUT_MS = 60_000;

export type GeminiClientOptions = {
  apiKey?: string;
  model?: string;
  /** Wall-clock cap per HTTP call (default 60s). */
  timeoutMs?: number;
  /** Network / API attempts with backoff (default 3). */
  maxAttempts?: number;
  /** Base backoff between attempts in ms (default 500; grows as 500, 1000, 2000, …). */
  backoffMs?: number;
};

function pcId(agent: FleetPcSnapshot): number {
  return Number(agent.id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Retry on timeouts, rate limits, and transient server/network failures — not auth. */
export function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  if (m.includes('401') || m.includes('403') || m.includes('permission denied')) {
    return false;
  }
  if (m.includes('api key not valid') || m.includes('invalid api key')) {
    return false;
  }
  if (m.includes('timeout after')) return true;
  if (m.includes('fetch') || m.includes('network') || m.includes('econnreset')) return true;
  if (m.includes('429') || m.includes('resource exhausted') || m.includes('rate')) return true;
  if (m.includes('502') || m.includes('503') || m.includes('504')) return true;
  if (err.name === 'AbortError') return true;
  return false;
}

function extractBalanced(s: string, open: string, close: string): string | undefined {
  const start = s.indexOf(open);
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Parse model text: strict JSON, fenced ```json blocks, or first balanced `{…}` / `[…]`. */
export function parseJsonLenient(text: string): unknown | undefined {
  const t = text.trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    /* continue */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as unknown;
    } catch {
      /* continue */
    }
  }
  const objSlice = extractBalanced(t, '{', '}');
  if (objSlice) {
    try {
      return JSON.parse(objSlice) as unknown;
    } catch {
      /* continue */
    }
  }
  const arrSlice = extractBalanced(t, '[', ']');
  if (arrSlice) {
    try {
      return JSON.parse(arrSlice) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function fallbackDecomposePlan(input: string, fleet: FleetPcSnapshot[]): DecomposedPlan {
  const online = fleet.filter((a) => a.status !== 'offline');
  const pick = online[0];
  const target = pick != null ? pcId(pick) : null;
  return {
    tasks: [{ type: 'task', target_pc_id: target, command: input, params: {} }],
  };
}

function fallbackSynthesisSummary(results: PcExecutionSnippet[]): string {
  return results
    .map((r) => {
      const host = r.hostname ? ` (${r.hostname})` : '';
      const err = r.stderr?.trim() ? ` stderr=${JSON.stringify(r.stderr.slice(0, 160))}` : '';
      return `pc_id=${r.pc_id}${host}: exit ${r.exit_code ?? 'unknown'}${err}`;
    })
    .join(' ');
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

async function generateContentOnce(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  jsonSchema: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
      },
    }),
    timeoutMs,
    'Gemini generateContent'
  );
  return extractText(response);
}

/**
 * Decompose a natural-language fleet command into structured tasks.
 * Uses Gemini structured JSON (`responseJsonSchema`) so output matches the schema.
 */
export async function decomposeCommand(
  input: string,
  fleetStatus: FleetPcSnapshot[],
  options?: GeminiClientOptions
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

  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const text = await generateContentOnce(ai, model, prompt, responseSchema, timeoutMs);
      const rawParsed = parseJsonLenient(text);
      if (rawParsed === undefined) {
        if (i < maxAttempts - 1) {
          await sleep(backoffMs * 2 ** i);
          continue;
        }
        return fallbackDecomposePlan(trimmed, fleetStatus);
      }
      const raw = normalizeGeminiPlan(rawParsed);
      const parsed = DecomposedPlanSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data as DecomposedPlan;
      }
      if (i < maxAttempts - 1) {
        await sleep(backoffMs * 2 ** i);
        continue;
      }
      return fallbackDecomposePlan(trimmed, fleetStatus);
    } catch (e) {
      if (!isRetryableGeminiError(e)) {
        throw e;
      }
      if (i < maxAttempts - 1) {
        await sleep(backoffMs * 2 ** i);
        continue;
      }
      return fallbackDecomposePlan(trimmed, fleetStatus);
    }
  }

  return fallbackDecomposePlan(trimmed, fleetStatus);
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
  options?: GeminiClientOptions
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

  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const text = await generateContentOnce(ai, model, prompt, synthesisResponseSchema, timeoutMs);
      const rawParsed = parseJsonLenient(text);
      if (rawParsed === undefined) {
        if (i < maxAttempts - 1) {
          await sleep(backoffMs * 2 ** i);
          continue;
        }
        return fallbackSynthesisSummary(results);
      }
      let raw: unknown = rawParsed;
      if (typeof raw === 'string') {
        raw = { summary: raw };
      }
      const parsed = SynthesisOutputSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data.summary;
      }
      if (i < maxAttempts - 1) {
        await sleep(backoffMs * 2 ** i);
        continue;
      }
      return fallbackSynthesisSummary(results);
    } catch (e) {
      if (!isRetryableGeminiError(e)) {
        throw e;
      }
      if (i < maxAttempts - 1) {
        await sleep(backoffMs * 2 ** i);
        continue;
      }
      return fallbackSynthesisSummary(results);
    }
  }

  return fallbackSynthesisSummary(results);
}
