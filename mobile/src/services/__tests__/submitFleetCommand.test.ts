import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stabilizePlanForStdb } from '../planWire';
import { routePlanThroughSuperPlane } from '../superplane';
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

describe('submitFleetCommandFlow', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'mock');
    mockGenerateContent.mockReset();
  });

  it('produces planJson Rust can consume (depends_on indices, integer pc ids)', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        tasks: [
          {
            type: 'shell',
            target_pc_id: 1.0,
            command: 'step a',
            params: {},
          },
          {
            type: 'shell',
            target_pc_id: null,
            command: 'step b',
            params: {},
            depends_on: 0,
          },
        ],
      }),
    });

    const { plan, planJson } = await submitFleetCommandFlow('do two steps', fleet);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].target_pc_id).toBe(1);
    expect(plan.tasks[1].depends_on).toBe(0);
    const parsed = JSON.parse(planJson) as { tasks: unknown[] };
    expect(parsed.tasks).toHaveLength(2);
  });

  it('SuperPlane pass-through does not mutate shape', () => {
    const p = stabilizePlanForStdb({
      tasks: [{ type: 'x', target_pc_id: 2, command: 'c', params: {} }],
    });
    expect(routePlanThroughSuperPlane(p)).toEqual(p);
  });
});
