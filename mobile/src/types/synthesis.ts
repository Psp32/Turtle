/** One PC’s task outcome (map from TaskResult / agent logs). */
export interface PcExecutionSnippet {
  pc_id: number;
  hostname?: string;
  task_id?: number;
  command?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  enforcement_decision?: string;
}
