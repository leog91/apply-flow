import { z } from 'zod';

const optionalText = z.string().trim().min(1).optional();

export const ApplicationCandidateSchema = z.object({
  company: z.string(),
  position: z.string(),
  url: z.union([z.literal(''), z.url()]),
  sourceHost: optionalText,
  city: optionalText,
  language: optionalText,
  stack: z.array(z.string().trim().min(1)).optional(),
  salaryRange: optionalText,
});

export type ApplicationCandidate = z.infer<typeof ApplicationCandidateSchema>;
