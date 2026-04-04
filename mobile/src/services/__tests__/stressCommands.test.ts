import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitFleetCommandFlow } from '../submitFleetCommand';
import type { FleetPcSnapshot } from '../../types/fleet';

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

const fleet: FleetPcSnapshot[] = [
  {
    id: 1,
    hostname: 'a',
    ip: '10.0.0.1',
    status: 'online',
    cpuLoad: 10,
    memoryUsage: 20,
    installedApps: '[]',
  },
];

describe('stress: rapid command decomposition', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'mock');
    mockGenerateContent.mockReset();
    mockGenerateContent.mockImplementation((_req: unknown) =>
      Promise.resolve({
        text: JSON.stringify({
          tasks: [{ type: 'shell', target_pc_id: 1, command: 'noop', params: {} }],
        }),
      })
    );
  });

  it('resolves 10 parallel planner-style flows without throwing', async () => {
    const flows = Array.from({ length: 10 }, (_, i) =>
      submitFleetCommandFlow(`stress command ${i}`, fleet, { maxAttempts: 1, backoffMs: 0 })
    );
    const results = await Promise.all(flows);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.plan.tasks.length >= 1)).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalled();
  });
});
