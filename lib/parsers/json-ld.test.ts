import { describe, expect, it } from 'vitest';
import { extractJobPostings } from './json-ld';

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: ' Senior   Software Engineer ',
  hiringOrganization: { '@type': 'Organization', name: 'Example Company' },
  url: 'https://jobs.example.com/123',
};

describe('extractJobPostings', () => {
  it('extracts a single JobPosting object', () => {
    expect(extractJobPostings([JSON.stringify(posting)])).toEqual([
      {
        company: 'Example Company',
        position: 'Senior Software Engineer',
        url: 'https://jobs.example.com/123',
        city: undefined,
      },
    ]);
  });

  it('extracts a JobPosting from an array', () => {
    expect(extractJobPostings([JSON.stringify([{ '@type': 'WebPage' }, posting])]))
      .toHaveLength(1);
  });

  it('extracts a JobPosting from @graph', () => {
    expect(extractJobPostings([JSON.stringify({ '@graph': [posting] })]))
      .toHaveLength(1);
  });

  it('ignores malformed JSON-LD while retaining valid blocks', () => {
    expect(extractJobPostings(['{not valid', JSON.stringify(posting)]))
      .toHaveLength(1);
  });
});
