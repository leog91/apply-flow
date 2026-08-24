import { describe, expect, it } from 'vitest';
import { buildApplicationClipboardRow } from './clipboard-row';

describe('buildApplicationClipboardRow', () => {
  it('creates an aligned Applications A:P row', () => {
    const row = buildApplicationClipboardRow(
      {
        company: 'Synthetic Labs',
        position: 'Platform Engineer',
        location: 'Example City',
        language: 'English',
        stack: ['TypeScript'],
        salaryRange: '50-60k',
        url: 'https://jobs.synthetic.test/42?utm_source=mail',
      },
      ['TypeScript', 'React'],
      new Date(2026, 7, 24),
    ).split('\t');

    expect(row).toHaveLength(16);
    expect(row).toEqual([
      '2026-08-24',
      'Synthetic Labs',
      'Platform Engineer',
      'Example City',
      'English',
      'TypeScript, React',
      'jobs.synthetic.test',
      'https://jobs.synthetic.test/42?utm_source=mail',
      '',
      '',
      '50-60k',
      'Applied',
      '',
      '',
      '',
      '',
    ]);
  });

  it('removes tabs and line breaks that would split pasted cells', () => {
    const row = buildApplicationClipboardRow(
      {
        company: 'Synthetic\tLabs',
        position: 'Platform\nEngineer',
        url: '',
      },
      [],
      new Date(2026, 0, 2),
    ).split('\t');

    expect(row[1]).toBe('Synthetic Labs');
    expect(row[2]).toBe('Platform Engineer');
    expect(row).toHaveLength(16);
  });
});
