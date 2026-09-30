import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOB_INBOX_HEADERS } from '@/lib/job-inbox/sheet';
import { parseApplicationHistoryResponse, parseJobInboxSyncResponse, readApplicationHistory, readJobInboxSyncSnapshot } from './client';
import { getGoogleAuthToken, invalidateGoogleAuthToken } from './auth';

vi.mock('./auth', () => ({
  getGoogleAuthToken: vi.fn(),
  invalidateGoogleAuthToken: vi.fn(),
}));

describe('Sheets read token recovery', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['history', readApplicationHistory, 3],
    ['inbox', readJobInboxSyncSnapshot, 4],
  ] as const)('retries %s once with a fresh token after a 401', async (_name, read, ranges) => {
    vi.mocked(getGoogleAuthToken).mockResolvedValueOnce('old').mockResolvedValueOnce('fresh');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ valueRanges: Array.from({ length: ranges }, (_, index) => ({
        values: index === 3 ? [[...JOB_INBOX_HEADERS]] : [],
      })) }));
    vi.stubGlobal('fetch', fetchMock);
    await read('synthetic-sheet', false);
    expect(invalidateGoogleAuthToken).toHaveBeenCalledWith('old');
    expect(getGoogleAuthToken).toHaveBeenNthCalledWith(2, false);
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), {
      headers: { Authorization: 'Bearer fresh' },
    });
  });

  it('stops after a second unauthorized response', async () => {
    vi.mocked(getGoogleAuthToken).mockResolvedValueOnce('old').mockResolvedValueOnce('fresh');
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(readApplicationHistory('synthetic-sheet')).rejects.toThrow('read failed (401)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(invalidateGoogleAuthToken).toHaveBeenNthCalledWith(2, 'fresh');
  });

  it('does not retry denied spreadsheet access', async () => {
    vi.mocked(getGoogleAuthToken).mockResolvedValue('token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(readApplicationHistory('synthetic-sheet')).rejects.toThrow('denied access');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invalidateGoogleAuthToken).not.toHaveBeenCalled();
  });
});

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
