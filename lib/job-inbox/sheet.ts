import { matchApplicationHistory } from '@/lib/google-sheets/application-history';
import type { ApplicationHistoryRecord } from '@/lib/google-sheets/application-history';
import { normalizeJobUrl } from '@/lib/normalization/url';
import { DiscoveredJobSchema } from './types';
import type { DiscoveredJob, JobInboxLocalState } from './types';

export const JOB_INBOX_SHEET_NAME = 'Job Inbox';
export const JOB_INBOX_RANGE = `'${JOB_INBOX_SHEET_NAME}'!A:S`;
export const JOB_INBOX_HEADERS = [
  'Date Discovered',
  'Company',
  'Position',
  'Location',
  'Status',
  'Job URL',
  'Source Name',
  'ChatGPT Sent Date',
  'Timestamp Precision',
  'Source',
  'Conversation URL',
  'Message ID',
  'First Seen At',
  'Synced At',
  'Application Ref',
  'ID',
  'Conversation ID',
  'ChatGPT Sent At',
  'Notes',
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

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
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

const COLUMN_NAMES: Record<keyof JobInboxColumns, string> = {
  id: 'id',
  company: 'company',
  position: 'position',
  location: 'location',
  status: 'status',
  jobUrl: 'job_url',
  sourceName: 'source_name',
  sentDate: 'chatgpt_sent_date',
  timestampPrecision: 'timestamp_precision',
  source: 'source',
  conversationUrl: 'conversation_url',
  messageId: 'message_id',
  firstSeenAt: 'first_seen_at',
  syncedAt: 'synced_at',
  applicationRef: 'application_ref',
  conversationId: 'conversation_id',
  sentAt: 'chatgpt_sent_at',
  notes: 'notes',
};

function columnsFromHeader(header: unknown[]): {
  columns: JobInboxColumns;
  needsMigration: boolean;
} {
  const indexes = new Map<string, number>();
  const duplicates = new Set<string>();
  for (let index = 0; index < header.length; index += 1) {
    const name = normalizeHeader(cell(header, index));
    if (!name) continue;
    if (indexes.has(name)) duplicates.add(name);
    else indexes.set(name, index);
  }

  const missing = Object.values(COLUMN_NAMES).filter((name) => !indexes.has(name));
  if (missing.length > 0 || duplicates.size > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      duplicates.size > 0 ? `duplicated: ${[...duplicates].join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`The ${JOB_INBOX_SHEET_NAME} header is invalid (${details}).`);
  }

  const columns = Object.fromEntries(
    Object.entries(COLUMN_NAMES).map(([property, name]) => [property, indexes.get(name)!]),
  ) as unknown as JobInboxColumns;
  const preferredOrder = JOB_INBOX_HEADERS.map(normalizeHeader);
  const actualOrder = header.map((_, index) => normalizeHeader(cell(header, index)));
  const needsMigration = preferredOrder.some((name, index) => actualOrder[index] !== name);
  return { columns, needsMigration };
}

export interface ParsedJobInboxSheet {
  jobs: DiscoveredJob[];
  needsMigration: boolean;
  sourceRowCount: number;
}

export function parseJobInboxSheet(values: unknown[][] | undefined): ParsedJobInboxSheet {
  const rows = values ?? [];
  const header = rows[0] ?? [];
  const { columns, needsMigration } = columnsFromHeader(header);

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
  return { jobs, needsMigration, sourceRowCount: Math.max(0, rows.length - 1) };
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

export function jobInboxRewriteRows(
  jobs: DiscoveredJob[],
  sourceRowCount: number,
): string[][] {
  const values = [[...JOB_INBOX_HEADERS], ...jobInboxRows(jobs)];
  while (values.length < sourceRowCount + 1) {
    values.push(Array.from({ length: JOB_INBOX_HEADERS.length }, () => ''));
  }
  return values;
}

export interface ReconciledRemoteInbox {
  jobs: DiscoveredJob[];
  changed: boolean;
}

export function reconcileRemoteInboxJobs(
  remoteJobs: DiscoveredJob[],
  localState: JobInboxLocalState,
): ReconciledRemoteInbox {
  const localById = new Map(localState.jobs.map((job) => [job.id, job]));
  const messageJobs = new Map(
    localState.messages.flatMap((message) => {
      const source = message.sourceMessage;
      return source.messageId
        ? [[`${source.conversationUrl}\n${source.messageId}`, new Set(message.jobIds)] as const]
        : [];
    }),
  );
  let changed = false;
  const jobs = remoteJobs.flatMap((remoteJob) => {
    const source = remoteJob.sourceMessage;
    const observedJobIds = source.messageId
      ? messageJobs.get(`${source.conversationUrl}\n${source.messageId}`)
      : undefined;
    if (
      remoteJob.status === 'new' &&
      observedJobIds &&
      !observedJobIds.has(remoteJob.id)
    ) {
      changed = true;
      return [];
    }

    const localJob = localById.get(remoteJob.id);
    if (!localJob) return [remoteJob];
    const refreshed: DiscoveredJob = {
      ...remoteJob,
      company: localJob.company || remoteJob.company,
      position: localJob.position || remoteJob.position,
      location: localJob.location ?? remoteJob.location,
      jobUrl: localJob.jobUrl ?? remoteJob.jobUrl,
      canonicalUrl: localJob.canonicalUrl ?? remoteJob.canonicalUrl,
    };
    if (JSON.stringify(jobInboxRows([refreshed])) !== JSON.stringify(jobInboxRows([remoteJob]))) {
      changed = true;
    }
    return [refreshed];
  });
  return { jobs, changed };
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
