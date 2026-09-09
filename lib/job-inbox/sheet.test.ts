import { describe, expect, it } from 'vitest';
import type { ApplicationHistoryRecord } from '@/lib/google-sheets/application-history';
import type { DiscoveredJob, JobInboxLocalState } from './types';
import {
  JOB_INBOX_HEADERS,
  LEGACY_JOB_INBOX_HEADERS,
  jobInboxRewriteRows,
  jobInboxRows,
  parseJobInboxSheet,
  parseJobInboxRows,
  planJobInboxSync,
  reconcileRemoteInboxJobs,
} from './sheet';

function job(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: 'url:job-1',
    identityKind: 'url',
    company: 'Synthetic Labs',
    position: 'Platform Engineer',
    location: 'Amsterdam',
    jobUrl: 'https://jobs.synthetic.test/42',
    canonicalUrl: 'https://jobs.synthetic.test/42',
    sourceMessage: {
      source: 'chatgpt',
      sourceName: 'Amsterdam jobs',
      conversationUrl: 'https://chatgpt.com/c/chat-1',
      conversationId: 'chat-1',
      messageId: 'message-1',
      sentDate: '2026-09-01',
      timestampPrecision: 'day',
      firstSeenAt: '2026-09-03T09:00:00.000Z',
    },
    firstSeenAt: '2026-09-03T09:00:00.000Z',
    status: 'new',
    ...overrides,
  };
}

describe('Job Inbox rows', () => {
  it('round trips the human-readable A:S schema without shifting empty cells', () => {
    const expected = job({ syncedAt: '2026-09-03T10:00:00.000Z' });
    const parsed = parseJobInboxSheet([[...JOB_INBOX_HEADERS], ...jobInboxRows([expected])]);
    expect(parsed.jobs).toEqual([expected]);
    expect(parsed.needsMigration).toBe(false);
  });

  it('maps recognized headers by name when reordered', () => {
    const expected = job({ syncedAt: '2026-09-03T10:00:00.000Z' });
    const headers = [...JOB_INBOX_HEADERS];
    const row = jobInboxRows([expected])[0]!;
    [headers[0], headers[1]] = [headers[1]!, headers[0]!];
    [row[0], row[1]] = [row[1]!, row[0]!];

    const parsed = parseJobInboxSheet([headers, row]);
    expect(parsed.jobs).toEqual([expected]);
    expect(parsed.needsMigration).toBe(true);
  });

  it('reports missing and duplicate headers', () => {
    expect(() => parseJobInboxRows([])).toThrow('missing:');
    const duplicate = [...JOB_INBOX_HEADERS];
    duplicate[1] = 'Position';
    expect(() => parseJobInboxRows([duplicate])).toThrow('duplicated: position');
  });

  it('reads the original machine-first schema and marks it for migration', () => {
    const legacyRow = [
      'url:job-1', 'Synthetic Labs', 'Platform Engineer', 'Amsterdam',
      'https://jobs.synthetic.test/42', 'chatgpt', 'Amsterdam jobs',
      'https://chatgpt.com/c/chat-1', 'chat-1', 'message-1', '', '2026-09-01',
      'day', '2026-09-03T09:00:00.000Z', '2026-09-03T10:00:00.000Z', 'new', '', '',
    ];

    const parsed = parseJobInboxSheet([[...LEGACY_JOB_INBOX_HEADERS], legacyRow]);
    expect(parsed.needsMigration).toBe(true);
    expect(parsed.sourceRowCount).toBe(1);
    expect(parsed.jobs[0]).toMatchObject({
      company: 'Synthetic Labs',
      position: 'Platform Engineer',
    });
  });

  it('removes only stale new rows from a source message and refreshes valid data', () => {
    const validRemote = job({ company: '🟢 1. Synthetic Labs' });
    const staleNew = job({ id: 'url:citation', position: 'LinkedIn +1' });
    const staleReviewed = job({ id: 'url:reviewed-citation', position: 'Salary', status: 'reviewed' });
    const localValid = job({ company: 'Synthetic Labs' });
    const localState: JobInboxLocalState = {
      jobs: [localValid],
      messages: [{
        key: 'chat-1:message-1',
        sourceMessage: localValid.sourceMessage,
        jobIds: [localValid.id],
      }],
    };

    const result = reconcileRemoteInboxJobs(
      [validRemote, staleNew, staleReviewed],
      localState,
    );

    expect(result.changed).toBe(true);
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]?.company).toBe('Synthetic Labs');
    expect(result.jobs[1]).toMatchObject({ id: 'url:reviewed-citation', status: 'reviewed' });
  });

  it('pads a compact rewrite to clear stale source rows', () => {
    const rows = jobInboxRewriteRows([job()], 3);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual([...JOB_INBOX_HEADERS]);
    expect(rows[1]?.[1]).toBe('Synthetic Labs');
    expect(rows[2]).toEqual(Array.from({ length: JOB_INBOX_HEADERS.length }, () => ''));
    expect(rows[3]).toEqual(Array.from({ length: JOB_INBOX_HEADERS.length }, () => ''));
  });
});

describe('planJobInboxSync', () => {
  it('batches new jobs while reconciling known and previously applied jobs', () => {
    const known = job({ id: 'url:known', canonicalUrl: 'https://jobs.synthetic.test/known', jobUrl: 'https://jobs.synthetic.test/known' });
    const applied = job({ id: 'url:applied', canonicalUrl: 'https://jobs.synthetic.test/applied', jobUrl: 'https://jobs.synthetic.test/applied' });
    const fresh = job({ id: 'url:fresh', canonicalUrl: 'https://jobs.synthetic.test/fresh', jobUrl: 'https://jobs.synthetic.test/fresh' });
    const state: JobInboxLocalState = { jobs: [known, applied, fresh], messages: [] };
    const remote = job({ ...known, status: 'shortlisted', syncedAt: '2026-09-02T10:00:00.000Z' });
    const applications: ApplicationHistoryRecord[] = [{
      row: 9,
      dateApplied: '2026-09-02',
      company: applied.company,
      position: applied.position,
      url: applied.canonicalUrl!,
      stage: 'Applied',
      outcome: '',
      nextAction: '',
      nextActionDate: '',
    }];

    const plan = planJobInboxSync(
      state,
      [remote],
      applications,
      '2026-09-03T10:00:00.000Z',
    );

    expect(plan.alreadyKnown).toBe(1);
    expect(plan.previouslyApplied).toBe(1);
    expect(plan.appendJobs).toHaveLength(2);
    expect(plan.appendJobs.find((item) => item.id === applied.id)).toMatchObject({
      status: 'applied',
      applicationRef: 'Applications!9',
    });
    expect(plan.reconciledJobs.get(known.id)).toMatchObject({ status: 'shortlisted' });
  });
});
