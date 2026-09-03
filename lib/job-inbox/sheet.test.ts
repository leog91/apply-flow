import { describe, expect, it } from 'vitest';
import type { ApplicationHistoryRecord } from '@/lib/google-sheets/application-history';
import type { DiscoveredJob, JobInboxLocalState } from './types';
import {
  JOB_INBOX_HEADERS,
  LEGACY_JOB_INBOX_HEADERS,
  jobInboxRows,
  parseJobInboxSheet,
  parseJobInboxRows,
  planJobInboxSync,
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
  it('round trips the fixed A:R schema without shifting empty cells', () => {
    const expected = job({ syncedAt: '2026-09-03T10:00:00.000Z' });
    expect(parseJobInboxRows([[...JOB_INBOX_HEADERS], ...jobInboxRows([expected])])).toEqual([
      expected,
    ]);
  });

  it('rejects a missing or reordered header', () => {
    expect(() => parseJobInboxRows([])).toThrow('header does not match');
    const reordered = [...JOB_INBOX_HEADERS];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(() => parseJobInboxRows([reordered])).toThrow('header does not match');
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
    expect(parsed.jobs[0]).toMatchObject({
      company: 'Synthetic Labs',
      position: 'Platform Engineer',
    });
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
