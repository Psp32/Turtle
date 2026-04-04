export interface TaskIntent {
  type: string;
  target_pc_id: number | null;
  command: string;
  params: Record<string, unknown>;
  depends_on?: number | null;
}

export interface DecomposedPlan {
  tasks: TaskIntent[];
}
