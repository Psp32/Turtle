import { z } from 'zod';

export const SynthesisOutputSchema = z.object({
  summary: z.string().min(1).describe('Short user-facing recap of all PCs'),
});

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;
