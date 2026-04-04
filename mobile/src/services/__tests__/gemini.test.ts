import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mock Gemini HTTP client so `npm test` works without a real API key. */
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

import {
  buildSynthesisPrompt,
  decomposeCommand,
  isRetryableGeminiError,
  parseJsonLenient,
  selectOptimalPC,
  synthesizeResults,
  validateDependencies,
} from '../gemini';
import { mockFleetStatus } from './fixtures/fleet-status';
import { mockMultiPcResults } from './fixtures/multi-pc-results';
import type { TaskIntent } from '../../types/intent';

describe('Gemini fleet service', () => {
  describe('parseJsonLenient + isRetryableGeminiError', () => {
    it('parses JSON inside a markdown fence', () => {
      const raw = parseJsonLenient('```json\n{"tasks":[]}\n```');
      expect(raw).toEqual({ tasks: [] });
    });

    it('treats 503 as retryable, 403 as not', () => {
      expect(isRetryableGeminiError(new Error('upstream 503'))).toBe(true);
      expect(isRetryableGeminiError(new Error('403 forbidden'))).toBe(false);
    });
  });

  describe('selectOptimalPC', () => {
    it('picks the online PC with lowest CPU when no app filter', () => {
      expect(selectOptimalPC('system_command', [], mockFleetStatus)).toBe(2);
    });

    it('prefers a PC that has required apps', () => {
      expect(selectOptimalPC('query', ['PostgreSQL'], mockFleetStatus)).toBe(2);
    });

    it('does not pick an offline PC', () => {
      expect(selectOptimalPC('system_command', [], mockFleetStatus)).not.toBe(3);
    });

    it('throws when no healthy PC exists', () => {
      const bad = [
        { ...mockFleetStatus[0], status: 'offline' as const, cpuLoad: 95 },
        { ...mockFleetStatus[1], cpuLoad: 85 },
      ] as typeof mockFleetStatus;
      expect(() => selectOptimalPC('file_edit', [], bad)).toThrow('No healthy PCs');
    });
  });

  describe('validateDependencies', () => {
    it('accepts a valid chain', () => {
      const tasks: TaskIntent[] = [
        { type: 'shell', target_pc_id: 1, command: 'a', params: {} },
        { type: 'shell', target_pc_id: 1, command: 'b', params: {}, depends_on: 0 },
        { type: 'shell', target_pc_id: 1, command: 'c', params: {}, depends_on: 1 },
      ];
      expect(() => validateDependencies(tasks)).not.toThrow();
    });

    it('rejects forward references', () => {
      const tasks: TaskIntent[] = [
        { type: 'shell', target_pc_id: 1, command: 'a', params: {}, depends_on: 1 },
      ];
      expect(() => validateDependencies(tasks)).toThrow('invalid');
    });

    it('rejects negative depends_on', () => {
      const tasks: TaskIntent[] = [
        { type: 'shell', target_pc_id: 1, command: 'a', params: {}, depends_on: -1 },
      ];
      expect(() => validateDependencies(tasks)).toThrow('invalid');
    });
  });

  describe('buildSynthesisPrompt (mock multi-PC inputs)', () => {
    it('includes each PC and task payload for Gemini', () => {
      const p = buildSynthesisPrompt(mockMultiPcResults);
      expect(p).toContain('api-server-1');
      expect(p).toContain('db-server-1');
      expect(p).toContain('"pc_id": 1');
      expect(p).toContain('"pc_id": 2');
      expect(p).toContain('pg_dump');
      expect(p).toContain('npm run build');
    });

    it('throws on empty results', () => {
      expect(() => buildSynthesisPrompt([])).toThrow('empty');
    });
  });

  describe('decomposeCommand (mocked Gemini)', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_API_KEY', 'vitest-mock-key');
      mockGenerateContent.mockReset();
    });

    it('parses structured object response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          tasks: [
            {
              type: 'file_edit',
              target_pc_id: 2,
              command: 'update postgres.conf',
              params: {},
            },
          ],
        }),
      });

      const result = await decomposeCommand('fix db config', mockFleetStatus);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].type).toBe('file_edit');
      expect(result.tasks[0].target_pc_id).toBe(2);
      expect(() => validateDependencies(result.tasks)).not.toThrow();
    });

    it('normalizes root-level task array from model', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify([
          { type: 'shell', target_pc_id: 1, command: 'echo ok', params: '{}' },
        ]),
      });

      const result = await decomposeCommand('say ok', mockFleetStatus);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].command).toBe('echo ok');
    });

    it('retries on retryable failures then succeeds', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('503 unavailable'))
        .mockResolvedValueOnce({
          text: JSON.stringify({
            tasks: [{ type: 'shell', target_pc_id: 1, command: 'ok', params: {} }],
          }),
        });

      const result = await decomposeCommand('retry me', mockFleetStatus, {
        maxAttempts: 3,
        backoffMs: 1,
      });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.tasks[0].command).toBe('ok');
    });

    it('falls back to a single task after bad JSON responses', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'not valid json {{{' });

      const result = await decomposeCommand('do something', mockFleetStatus, {
        maxAttempts: 2,
        backoffMs: 1,
      });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].command).toBe('do something');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('synthesizeResults (mocked Gemini)', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_API_KEY', 'vitest-mock-key');
      mockGenerateContent.mockReset();
    });

    it('returns summary from structured JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          summary: 'PC1 and PC2 finished; builds and backups succeeded.',
        }),
      });

      const summary = await synthesizeResults(mockMultiPcResults);
      expect(summary).toContain('PC1');
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('accepts bare string JSON as summary', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify('Plain summary line from model.'),
      });

      const summary = await synthesizeResults(mockMultiPcResults);
      expect(summary).toBe('Plain summary line from model.');
    });

    it('falls back to deterministic text when JSON stays invalid', async () => {
      mockGenerateContent.mockResolvedValue({ text: '%%%' });

      const summary = await synthesizeResults(mockMultiPcResults, {
        maxAttempts: 2,
        backoffMs: 1,
      });
      expect(summary).toContain('pc_id=');
      expect(summary).toContain('exit');
    });
  });
});
