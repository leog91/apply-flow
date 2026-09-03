import { z } from 'zod';

export const JobInboxStatusSchema = z.enum([
  'new',
  'reviewed',
  'shortlisted',
  'skipped',
  'applied',
]);

export const TimestampPrecisionSchema = z.enum(['exact', 'day', 'unknown']);

export const SourceMessageSchema = z.object({
  source: z.string().trim().min(1),
  sourceName: z.string().trim().min(1).optional(),
  conversationUrl: z.url(),
  conversationId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1).optional(),
  sentAt: z.iso.datetime().optional(),
  sentDate: z.iso.date().optional(),
  timestampPrecision: TimestampPrecisionSchema,
  firstSeenAt: z.iso.datetime(),
});

export const DiscoveredJobSchema = z.object({
  id: z.string().trim().min(1),
  identityKind: z.enum(['url', 'metadata']),
  company: z.string(),
  position: z.string(),
  location: z.string().optional(),
  jobUrl: z.url().optional(),
  canonicalUrl: z.url().optional(),
  sourceMessage: SourceMessageSchema,
  firstSeenAt: z.iso.datetime(),
  syncedAt: z.iso.datetime().optional(),
  status: JobInboxStatusSchema,
  applicationRef: z.string().optional(),
  notes: z.string().optional(),
});

export type JobInboxStatus = z.infer<typeof JobInboxStatusSchema>;
export type TimestampPrecision = z.infer<typeof TimestampPrecisionSchema>;
export type SourceMessage = z.infer<typeof SourceMessageSchema>;
export type DiscoveredJob = z.infer<typeof DiscoveredJobSchema>;

export interface ObservedSourceMessage {
  key: string;
  sourceMessage: SourceMessage;
  jobIds: string[];
}

export interface JobInboxLocalState {
  jobs: DiscoveredJob[];
  messages: ObservedSourceMessage[];
}

export const EMPTY_JOB_INBOX_STATE: JobInboxLocalState = {
  jobs: [],
  messages: [],
};
