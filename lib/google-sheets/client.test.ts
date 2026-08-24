import { describe, expect, it } from 'vitest';
import { parseApplicationHistoryResponse } from './client';

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
