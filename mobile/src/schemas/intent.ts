import { z } from 'zod';

/** One atomic task the fleet should run (matches Gemini JSON schema output). */
export const TaskIntentSchema = z.object({
  type: z.string().min(1).describe('e.g. shell, file_edit, package, query'),
  target_pc_id: z
    .union([z.number().int(), z.null()])
    .describe('PcAgent.id from fleet context, or null if not yet chosen'),
  command: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  depends_on: z
    .union([z.number().int().nonnegative(), z.null()])
    .optional()
    .describe('0-based index of another task in tasks[] that must finish first'),
});

/** Root object returned by `decomposeCommand`. */
export const DecomposedPlanSchema = z.object({
  tasks: z.array(TaskIntentSchema),
});

export type TaskIntentIn = z.infer<typeof TaskIntentSchema>;
export type DecomposedPlan = z.infer<typeof DecomposedPlanSchema>;
