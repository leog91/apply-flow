import { describe, expect, it } from 'vitest';
import {
  matchApplicationHistory,
  normalizeComparisonValue,
  type ApplicationHistoryRecord,
} from './application-history';

const records: ApplicationHistoryRecord[] = [
  {
    row: 2,
    dateApplied: '2026-08-10',
    company: 'Example & Company',
    position: 'Frontend Engineer',
    url: 'https://jobs.example.test/123?utm_source=mail',
    stage: 'Screening',
    outcome: 'Open',
    nextAction: 'Reply to recruiter',
    nextActionDate: '2026-08-14',
  },
  {
    row: 3,
    dateApplied: '2026-07-02',
    company: 'Example and Company',
    position: 'Product Engineer',
    url: 'https://jobs.example.test/100',
    stage: 'Applied',
    outcome: 'Rejected',
    nextAction: '',
    nextActionDate: '',
  },
];

describe('normalizeComparisonValue', () => {
  it('normalizes accents, punctuation, whitespace, and ampersands', () => {
    expect(normalizeComparisonValue('  Exámple & Company, S.L. ')).toBe(
      'example and company s l',
    );
  });
});

describe('matchApplicationHistory', () => {
  it('matches legal suffix and title spelling variants across different job sites', () => {
    const result = matchApplicationHistory(records, { company: 'Example and Company B.V.', position: 'Front-end Engineer', url: 'https://linkedin.com/jobs/view/42' });
    expect(result.exactJob).toBeUndefined();
    expect(result.probableJobs.map((record) => record.row)).toEqual([2]);
  });

  it('returns all relevant matches newest first without merging different roles or levels', () => {
    const additional = [
      { ...records[0]!, row: 4, dateApplied: '2026-09-01', url: 'https://jobs.example.test/new' },
      { ...records[0]!, row: 5, dateApplied: '2026-09-02', position: 'Senior Frontend Engineer' },
      { ...records[0]!, row: 6, dateApplied: '2026-09-03', company: 'Example and Company Labs' },
    ];
    const result = matchApplicationHistory([...records, ...additional], { company: 'Example & Company', position: 'Frontend Engineer', url: '' });
    expect(result.probableJobs.map((record) => record.row)).toEqual([4, 2]);
    expect(result.companyHistory.map((record) => record.row)).toEqual([5, 4, 2, 3]);
  });

  it('finds an exact normalized URL and company history', () => {
    const result = matchApplicationHistory(records, {
      company: 'Example and Company',
      position: 'Frontend Engineer',
      url: 'https://jobs.example.test/123',
    });

    expect(result.exactJob?.row).toBe(2);
    expect(result.probableJob?.row).toBe(2);
    expect(result.companyHistory.map((record) => record.row)).toEqual([2, 3]);
  });

  it('treats a company-only match as history rather than an exact job', () => {
    const result = matchApplicationHistory(records, {
      company: 'Example & Company',
      position: 'New Role',
      url: 'https://jobs.example.test/999',
    });

    expect(result.exactJob).toBeUndefined();
    expect(result.probableJob).toBeUndefined();
    expect(result.companyHistory).toHaveLength(2);
  });
});
