import type { PcExecutionSnippet } from '../../../types/synthesis';

/** Mock outputs from three PCs for synthesis tests. */
export const mockMultiPcResults: PcExecutionSnippet[] = [
  {
    pc_id: 1,
    hostname: 'api-server-1',
    task_id: 101,
    command: 'npm run build',
    stdout: 'build finished\n',
    stderr: '',
    exit_code: 0,
    enforcement_decision: 'allowed',
  },
  {
    pc_id: 2,
    hostname: 'db-server-1',
    task_id: 102,
    command: 'pg_dump backup',
    stdout: 'dump complete: 12MB\n',
    stderr: '',
    exit_code: 0,
    enforcement_decision: 'allowed',
  },
  {
    pc_id: 1,
    hostname: 'api-server-1',
    task_id: 103,
    command: 'curl health',
    stdout: '{"ok":true}\n',
    stderr: '',
    exit_code: 0,
    enforcement_decision: 'allowed',
  },
];
