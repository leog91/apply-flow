import { describe, expect, it } from 'vitest';
import { JOB_INBOX_HEADERS } from '@/lib/job-inbox/sheet';
import { parseApplicationHistoryResponse, parseJobInboxSyncResponse } from './client';

describe('parseApplicationHistoryResponse', () => {
  it('aligns the three minimal ranges by sheet row', () => {
    expect(
      parseApplicationHistoryResponse({
        valueRanges: [
          {
            values: [
              ['Date Applied', 'Company', 'Position'],
              ['2026-08-20', 'Synthetic Labs', 'Platform Engineer'],
              ['2026-07-03', 'Demo Works', 'Web Engineer'],
            ],
          },
          {
            values: [
              ['Job Post URL'],
              ['https://jobs.synthetic.test/42'],
              ['https://jobs.demo.test/8'],
            ],
          },
          {
            values: [
              ['Stage', 'Outcome', 'Next Action', 'Next Action Date'],
              ['Interview', 'Open', 'Prepare examples', '2026-08-25'],
              ['Applied', 'Rejected'],
            ],
          },
        ],
      }),
    ).toEqual([
      {
        row: 2,
        dateApplied: '2026-08-20',
        company: 'Synthetic Labs',
        position: 'Platform Engineer',
        url: 'https://jobs.synthetic.test/42',
        stage: 'Interview',
        outcome: 'Open',
        nextAction: 'Prepare examples',
        nextActionDate: '2026-08-25',
      },
      {
        row: 3,
        dateApplied: '2026-07-03',
        company: 'Demo Works',
        position: 'Web Engineer',
        url: 'https://jobs.demo.test/8',
        stage: 'Applied',
        outcome: 'Rejected',
        nextAction: '',
        nextActionDate: '',
      },
    ]);
  });

  it('rejects responses missing any requested range', () => {
    expect(() =>
      parseApplicationHistoryResponse({ valueRanges: [] }),
    ).toThrow('unexpected response');
  });
});

describe('parseJobInboxSyncResponse', () => {
  it('parses one combined Applications and Job Inbox read', () => {
    const response = {
      valueRanges: [
        { values: [['Date Applied', 'Company', 'Position'], ['2026-09-01', 'Synthetic Labs', 'Engineer']] },
        { values: [['Job Post URL'], ['https://jobs.synthetic.test/applied']] },
        { values: [['Stage', 'Outcome', 'Next Action', 'Next Action Date'], ['Applied']] },
        { values: [
          [...JOB_INBOX_HEADERS],
          [
            '2026-09-03', 'Demo Works', 'Frontend Developer', 'Barcelona', 'new',
            'https://careers.demo.test/jobs/7', 'Barcelona jobs', '2026-09-01',
            'day', 'chatgpt', 'https://chatgpt.com/c/chat-1', 'message-1',
            '2026-09-03T09:00:00.000Z', '2026-09-03T10:00:00.000Z', '',
            'url:job-1', 'chat-1', '', '',
          ],
        ] },
      ],
    };

    const parsed = parseJobInboxSyncResponse(response);
    expect(parsed.applications).toHaveLength(1);
    expect(parsed.inboxNeedsMigration).toBe(false);
    expect(parsed.inboxJobs[0]).toMatchObject({
      company: 'Demo Works',
      status: 'new',
      sourceMessage: { timestampPrecision: 'day' },
    });
  });
});
