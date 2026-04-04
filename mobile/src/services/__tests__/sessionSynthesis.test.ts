import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sessionAllTasksHaveResults,
  buildSnippetsForSession,
  runSessionSynthesis,
  type SessionTaskRow,
  type SessionTaskResultRow,
  type SessionPcRow,
} from '../sessionSynthesis';

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

/** 3 tasks in one session across PC 10 and PC 20 (two physical agents). */
const SESSION_ID = 500;
const tasks: SessionTaskRow[] = [
  { id: 901, commandSessionId: SESSION_ID, commandText: 'build frontend' },
  { id: 902, commandSessionId: SESSION_ID, commandText: 'run tests' },
  { id: 903, commandSessionId: SESSION_ID, commandText: 'deploy artifact' },
];

const agents: SessionPcRow[] = [
  { id: 10, hostname: 'pc-alpha' },
  { id: 20, hostname: 'pc-beta' },
];

function resultsForSuccess(): SessionTaskResultRow[] {
  return [
    {
      taskId: 901,
      pcId: 10,
      stdout: 'webpack ok',
      stderr: '',
      exitCode: 0,
      enforcementDecision: 'allowed',
    },
    {
      taskId: 902,
      pcId: 10,
      stdout: '3 passed',
      stderr: '',
      exitCode: 0,
      enforcementDecision: 'allowed',
    },
    {
      taskId: 903,
      pcId: 20,
      stdout: 'uploaded',
      stderr: '',
      exitCode: 0,
      enforcementDecision: 'allowed',
    },
  ];
}

describe('sessionSynthesis', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'mock');
    mockGenerateContent.mockReset();
  });

  it('sessionAllTasksHaveResults is false until every task has a result', () => {
    const partial = resultsForSuccess().slice(0, 2);
    expect(sessionAllTasksHaveResults(SESSION_ID, tasks, partial)).toBe(false);
    expect(sessionAllTasksHaveResults(SESSION_ID, tasks, resultsForSuccess())).toBe(true);
  });

  it('buildSnippetsForSession maps 3 tasks and 2 PCs with hostnames', () => {
    const snippets = buildSnippetsForSession(SESSION_ID, tasks, resultsForSuccess(), agents);
    expect(snippets).toHaveLength(3);
    expect(snippets[0].pc_id).toBe(10);
    expect(snippets[0].hostname).toBe('pc-alpha');
    expect(snippets[2].pc_id).toBe(20);
    expect(snippets[2].hostname).toBe('pc-beta');
    expect(snippets[2].command).toBe('deploy artifact');
  });

  it('runSessionSynthesis calls Gemini and returns summary string', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ summary: 'Alpha built and tested; Beta deployed successfully.' }),
    });

    const summary = await runSessionSynthesis(SESSION_ID, tasks, resultsForSuccess(), agents);
    expect(summary).toContain('Alpha');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const call = mockGenerateContent.mock.calls[0][0] as { contents?: string };
    expect(call.contents).toContain('pc-alpha');
    expect(call.contents).toContain('pc-beta');
  });
});
