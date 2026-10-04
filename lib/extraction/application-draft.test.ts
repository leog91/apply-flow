import { describe, expect, it } from 'vitest';
import { preserveDraftEdits, sameJobListing } from './application-draft';

const detected = { company: 'Example', position: 'Frontend Engineer', url: 'https://www.linkedin.com/jobs/view/123', location: 'Amsterdam', workMode: 'Hybrid' as const };

describe('application drafts', () => {
  it('recognizes the same listing despite tracking or title-slug changes', () => {
    expect(sameJobListing(detected, { ...detected, url: 'https://www.linkedin.com/jobs/view/frontend-engineer-123?trk=mail' })).toBe(true);
    expect(sameJobListing(detected, { ...detected, url: 'https://www.linkedin.com/jobs/view/456' })).toBe(false);
    expect(sameJobListing(detected, { ...detected, position: 'Product Designer' })).toBe(false);
    expect(sameJobListing({ ...detected, url: '' }, { ...detected, url: '' })).toBe(false);
  });

  it('preserves corrected and deliberately cleared fields while accepting new unedited data', () => {
    expect(preserveDraftEdits(
      { ...detected, company: 'Corrected', location: undefined },
      { ...detected, position: 'Senior Frontend Engineer', location: 'Barcelona' },
      new Set(['company', 'location']),
    )).toEqual({ ...detected, company: 'Corrected', position: 'Senior Frontend Engineer', location: undefined });
  });
});
