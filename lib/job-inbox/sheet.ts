import { matchApplicationHistory } from '@/lib/google-sheets/application-history';
import type { ApplicationHistoryRecord } from '@/lib/google-sheets/application-history';
import { normalizeJobUrl } from '@/lib/normalization/url';
import { DiscoveredJobSchema } from './types';
import type { DiscoveredJob, JobInboxLocalState } from './types';

export const JOB_INBOX_SHEET_NAME = 'Job Inbox';
export const JOB_INBOX_RANGE = `'${JOB_INBOX_SHEET_NAME}'!A:S`;
export const JOB_INBOX_HEADERS = [
  'date_discovered',
  'company',
  'position',
  'location',
  'status',
  'job_url',
  'source_name',
  'chatgpt_sent_date',
  'timestamp_precision',
  'source',
  'conversation_url',
  'message_id',
  'first_seen_at',
  'synced_at',
  'application_ref',
  'id',
  'conversation_id',
  'chatgpt_sent_at',
  'notes',
] as const;

export const LEGACY_JOB_INBOX_HEADERS = [
  'id', 'company', 'position', 'location', 'job_url', 'source', 'source_name',
  'conversation_url', 'conversation_id', 'message_id', 'chatgpt_sent_at',
  'chatgpt_sent_date', 'timestamp_precision', 'first_seen_at', 'synced_at',
  'status', 'application_ref', 'notes',
] as const;

function cell(row: unknown[], index: number): string {
  const value = row[index];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function headerMatches(header: unknown[], expected: readonly string[]): boolean {
  return expected.every((value, index) => cell(header, index) === value);
}

interface JobInboxColumns {
  id: number;
  company: number;
  position: number;
  location: number;
  status: number;
  jobUrl: number;
  sourceName: number;
  sentDate: number;
  timestampPrecision: number;
  source: number;
  conversationUrl: number;
  messageId: number;
  firstSeenAt: number;
  syncedAt: number;
  applicationRef: number;
  conversationId: number;
  sentAt: number;
  notes: number;
}

const CURRENT_COLUMNS: JobInboxColumns = {
  id: 15, company: 1, position: 2, location: 3, status: 4, jobUrl: 5,
  sourceName: 6, sentDate: 7, timestampPrecision: 8, source: 9,
  conversationUrl: 10, messageId: 11, firstSeenAt: 12, syncedAt: 13,
  applicationRef: 14, conversationId: 16, sentAt: 17, notes: 18,
};

const LEGACY_COLUMNS: JobInboxColumns = {
  id: 0, company: 1, position: 2, location: 3, status: 15, jobUrl: 4,
  sourceName: 6, sentDate: 11, timestampPrecision: 12, source: 5,
  conversationUrl: 7, messageId: 9, firstSeenAt: 13, syncedAt: 14,
  applicationRef: 16, conversationId: 8, sentAt: 10, notes: 17,
};

export interface ParsedJobInboxSheet {
  jobs: DiscoveredJob[];
  needsMigration: boolean;
}

export function parseJobInboxSheet(values: unknown[][] | undefined): ParsedJobInboxSheet {
  const rows = values ?? [];
  const header = rows[0] ?? [];
  const needsMigration = headerMatches(header, LEGACY_JOB_INBOX_HEADERS);
  const columns = headerMatches(header, JOB_INBOX_HEADERS)
    ? CURRENT_COLUMNS
    : needsMigration
      ? LEGACY_COLUMNS
      : undefined;
  if (!columns) {
    throw new Error(`The ${JOB_INBOX_SHEET_NAME} header does not match Apply Flow's schema.`);
  }

  const jobs = rows.slice(1).flatMap((row, index) => {
    const id = cell(row, columns.id);
    if (!id) return [];
    const jobUrl = normalizeJobUrl(cell(row, columns.jobUrl));
    const parsed = DiscoveredJobSchema.safeParse({
      id,
      identityKind: id.startsWith('metadata:') ? 'metadata' : 'url',
      company: cell(row, columns.company),
      position: cell(row, columns.position),
      location: cell(row, columns.location) || undefined,
      jobUrl,
      canonicalUrl: jobUrl,
      sourceMessage: {
        source: cell(row, columns.source),
        sourceName: cell(row, columns.sourceName) || undefined,
        conversationUrl: cell(row, columns.conversationUrl),
        conversationId: cell(row, columns.conversationId) || undefined,
        messageId: cell(row, columns.messageId) || undefined,
        sentAt: cell(row, columns.sentAt) || undefined,
        sentDate: cell(row, columns.sentDate) || undefined,
        timestampPrecision: cell(row, columns.timestampPrecision),
        firstSeenAt: cell(row, columns.firstSeenAt),
      },
      firstSeenAt: cell(row, columns.firstSeenAt),
      syncedAt: cell(row, columns.syncedAt) || undefined,
      status: cell(row, columns.status),
      applicationRef: cell(row, columns.applicationRef) || undefined,
      notes: cell(row, columns.notes) || undefined,
    });
    if (!parsed.success) {
      throw new Error(`${JOB_INBOX_SHEET_NAME} row ${index + 2} is invalid.`);
    }
    return [parsed.data];
  });
  return { jobs, needsMigration };
}

export function parseJobInboxRows(values: unknown[][] | undefined): DiscoveredJob[] {
  return parseJobInboxSheet(values).jobs;
}

export function jobInboxRows(jobs: DiscoveredJob[]): string[][] {
  return jobs.map((job) => [
    job.firstSeenAt.slice(0, 10),
    job.company,
    job.position,
    job.location ?? '',
    job.status,
    job.canonicalUrl ?? job.jobUrl ?? '',
    job.sourceMessage.sourceName ?? '',
    job.sourceMessage.sentDate ?? '',
    job.sourceMessage.timestampPrecision,
    job.sourceMessage.source,
    job.sourceMessage.conversationUrl,
    job.sourceMessage.messageId ?? '',
    job.firstSeenAt,
    job.syncedAt ?? '',
    job.applicationRef ?? '',
    job.id,
    job.sourceMessage.conversationId ?? '',
    job.sourceMessage.sentAt ?? '',
    job.notes ?? '',
  ]);
}

export interface JobInboxSyncPlan {
  appendJobs: DiscoveredJob[];
  reconciledJobs: Map<
    string,
    Pick<DiscoveredJob, 'status' | 'syncedAt' | 'applicationRef'>
  >;
  alreadyKnown: number;
  previouslyApplied: number;
}

export function planJobInboxSync(
  localState: JobInboxLocalState,
  remoteJobs: DiscoveredJob[],
  applications: ApplicationHistoryRecord[],
  syncedAt: string,
): JobInboxSyncPlan {
  const remoteById = new Map(remoteJobs.map((job) => [job.id, job]));
  const remoteByUrl = new Map(
    remoteJobs.flatMap((job) => {
      const url = normalizeJobUrl(job.canonicalUrl ?? job.jobUrl ?? '');
      return url ? [[url, job] as const] : [];
    }),
  );
  const appendJobs: DiscoveredJob[] = [];
  const reconciledJobs = new Map<
    string,
    Pick<DiscoveredJob, 'status' | 'syncedAt' | 'applicationRef'>
  >();
  let alreadyKnown = 0;
  let previouslyApplied = 0;

  for (const job of localState.jobs) {
    const url = normalizeJobUrl(job.canonicalUrl ?? job.jobUrl ?? '');
    const remote = remoteById.get(job.id) ?? (url ? remoteByUrl.get(url) : undefined);
    if (remote) {
      if (!job.syncedAt) alreadyKnown += 1;
      reconciledJobs.set(job.id, {
        status: remote.status,
        syncedAt: remote.syncedAt,
        applicationRef: remote.applicationRef,
      });
      continue;
    }
    const application = matchApplicationHistory(applications, {
      company: job.company,
      position: job.position,
      url: job.canonicalUrl ?? job.jobUrl ?? '',
    }).exactJob;
    const prepared = {
      ...job,
      status: application ? 'applied' as const : job.status,
      applicationRef: application ? `Applications!${application.row}` : job.applicationRef,
      syncedAt,
    };
    if (application) previouslyApplied += 1;
    appendJobs.push(prepared);
    reconciledJobs.set(job.id, {
      status: prepared.status,
      syncedAt,
      applicationRef: prepared.applicationRef,
    });
  }

  return { appendJobs, reconciledJobs, alreadyKnown, previouslyApplied };
}
