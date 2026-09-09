import { DiscoveredJobSchema, EMPTY_JOB_INBOX_STATE } from './types';
import { cleanChatGptCompanyLabel } from '@/lib/chatgpt/normalize';
import type {
  DiscoveredJob,
  JobInboxLocalState,
  ObservedSourceMessage,
} from './types';

const STORAGE_KEY = 'jobInboxState';

function timestampRank(value: DiscoveredJob['sourceMessage']['timestampPrecision']): number {
  return { unknown: 0, day: 1, exact: 2 }[value];
}

function mergeJob(existing: DiscoveredJob, incoming: DiscoveredJob): DiscoveredJob {
  const sameSourceMessage = Boolean(
    existing.sourceMessage.messageId &&
    incoming.sourceMessage.messageId &&
    existing.sourceMessage.messageId === incoming.sourceMessage.messageId &&
    existing.sourceMessage.conversationUrl === incoming.sourceMessage.conversationUrl,
  );
  const useIncomingTimestamp = sameSourceMessage &&
    timestampRank(incoming.sourceMessage.timestampPrecision) >
      timestampRank(existing.sourceMessage.timestampPrecision);
  const rolePattern = /\b(?:engineer|developer|designer|manager|scientist|analyst|architect|consultant|specialist|lead|director|intern|administrator|programmer|devops|sre|owner|recruiter|accountant|sales|marketing|operations|qa|tester)\b/i;
  const incomingHasBetterPosition = rolePattern.test(incoming.position) &&
    !rolePattern.test(existing.position);
  const existingCompany = cleanChatGptCompanyLabel(existing.company);
  const incomingCompany = cleanChatGptCompanyLabel(incoming.company);
  const incomingHasCleanerCompany = Boolean(
    incomingCompany && existingCompany === incomingCompany && existing.company !== incomingCompany,
  );
  return DiscoveredJobSchema.parse({
    ...existing,
    company: incomingHasBetterPosition || incomingHasCleanerCompany
      ? incoming.company || existing.company
      : existing.company || incoming.company,
    position: incomingHasBetterPosition ? incoming.position : existing.position || incoming.position,
    location: incomingHasBetterPosition
      ? incoming.location ?? existing.location
      : existing.location ?? incoming.location,
    jobUrl: existing.jobUrl ?? incoming.jobUrl,
    canonicalUrl: existing.canonicalUrl ?? incoming.canonicalUrl,
    sourceMessage: {
      ...existing.sourceMessage,
      sourceName: existing.sourceMessage.sourceName ?? incoming.sourceMessage.sourceName,
      conversationId: existing.sourceMessage.conversationId ?? incoming.sourceMessage.conversationId,
      messageId: existing.sourceMessage.messageId ?? incoming.sourceMessage.messageId,
      ...(useIncomingTimestamp
        ? {
            sentAt: incoming.sourceMessage.sentAt,
            sentDate: incoming.sourceMessage.sentDate,
            timestampPrecision: incoming.sourceMessage.timestampPrecision,
          }
        : {}),
    },
  });
}

export function mergeJobInboxState(
  current: JobInboxLocalState,
  incomingJobs: DiscoveredJob[],
  incomingMessage: ObservedSourceMessage,
): JobInboxLocalState {
  const jobs = new Map(current.jobs.map((job) => [job.id, job]));
  for (const job of incomingJobs) {
    const existing = jobs.get(job.id);
    jobs.set(job.id, existing ? mergeJob(existing, job) : DiscoveredJobSchema.parse(job));
  }
  const messages = new Map(current.messages.map((message) => [message.key, message]));
  const existingMessage = messages.get(incomingMessage.key);
  const existingPrecision = existingMessage?.sourceMessage.timestampPrecision ?? 'unknown';
  const useIncomingTimestamp = timestampRank(incomingMessage.sourceMessage.timestampPrecision) >
    timestampRank(existingPrecision);
  messages.set(incomingMessage.key, {
    ...incomingMessage,
    sourceMessage: existingMessage
      ? {
          ...existingMessage.sourceMessage,
          sourceName: existingMessage.sourceMessage.sourceName ?? incomingMessage.sourceMessage.sourceName,
          ...(useIncomingTimestamp
            ? {
                sentAt: incomingMessage.sourceMessage.sentAt,
                sentDate: incomingMessage.sourceMessage.sentDate,
                timestampPrecision: incomingMessage.sourceMessage.timestampPrecision,
              }
            : {}),
        }
      : incomingMessage.sourceMessage,
    jobIds: [...new Set(incomingMessage.jobIds)],
  });
  return { jobs: [...jobs.values()], messages: [...messages.values()] };
}

export function mergeParsedMessages(
  current: JobInboxLocalState,
  parsedMessages: Array<{
    jobs: DiscoveredJob[];
    message: ObservedSourceMessage;
  }>,
): JobInboxLocalState {
  const merged = parsedMessages.reduce(
    (state, parsed) => mergeJobInboxState(state, parsed.jobs, parsed.message),
    current,
  );
  const referencedIds = new Set(merged.messages.flatMap((message) => message.jobIds));
  return {
    ...merged,
    jobs: merged.jobs.filter((job) => referencedIds.has(job.id)),
  };
}

export function reconcileJobInboxState(
  current: JobInboxLocalState,
  syncedJobs: Map<string, Pick<DiscoveredJob, 'status' | 'syncedAt' | 'applicationRef'>>,
): JobInboxLocalState {
  return {
    ...current,
    jobs: current.jobs.map((job) => {
      const synced = syncedJobs.get(job.id);
      return synced ? { ...job, ...synced } : job;
    }),
  };
}

export async function getJobInboxState(): Promise<JobInboxLocalState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<JobInboxLocalState> | undefined;
  if (!value || !Array.isArray(value.jobs) || !Array.isArray(value.messages)) {
    return EMPTY_JOB_INBOX_STATE;
  }
  const jobs = value.jobs.flatMap((job) => {
    const parsed = DiscoveredJobSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
  return { jobs, messages: value.messages as ObservedSourceMessage[] };
}

export async function saveJobInboxState(state: JobInboxLocalState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}
