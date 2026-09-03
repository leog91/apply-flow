import { describe, expect, it } from 'vitest';
import { getSourceHost, normalizeJobUrl, selectJobUrl } from './url';

describe('normalizeJobUrl', () => {
  it('removes known tracking parameters and preserves identifying parameters', () => {
    expect(
      normalizeJobUrl(
        'https://jobs.example.com/apply?id=42&utm_source=mail&refId=abc&team=eng',
      ),
    ).toBe('https://jobs.example.com/apply?id=42&team=eng');
  });

  it('rejects non-web URLs', () => {
    expect(normalizeJobUrl('chrome://extensions')).toBeUndefined();
  });

  it('canonicalizes fragments, query ordering, trailing slashes, and known wrappers', () => {
    expect(
      normalizeJobUrl(
        'https://www.google.com/url?q=https%3A%2F%2Fjobs.example.com%2Froles%2F42%2F%3Fb%3D2%26a%3D1%26utm_id%3Dcampaign%23apply',
      ),
    ).toBe('https://jobs.example.com/roles/42?a=1&b=2');
  });

  it('reduces LinkedIn job URLs to their stable numeric identity', () => {
    expect(
      normalizeJobUrl(
        'https://www.linkedin.com/jobs/view/platform-engineer-at-example-1234567890/?trackingId=abc',
      ),
    ).toBe('https://www.linkedin.com/jobs/view/1234567890');
  });
});

describe('getSourceHost', () => {
  it('identifies any job source from its URL without provider rules', () => {
    expect(getSourceHost('https://www.examplejobs.test/jobs/view/42')).toBe(
      'examplejobs.test',
    );
    expect(getSourceHost('https://careers.acme.com/jobs/42')).toBe(
      'careers.acme.com',
    );
  });
});

describe('selectJobUrl', () => {
  it('prefers a canonical URL over structured and current URLs', () => {
    expect(
      selectJobUrl(
        'https://example.com/job?utm_source=test',
        'https://example.com/jobs/42',
        'https://example.com/job/42',
      ),
    ).toBe('https://example.com/jobs/42');
  });

  it('rejects a generic root canonical and falls back to OpenGraph URL', () => {
    expect(
      selectJobUrl(
        'https://example.com/careers/open-role',
        'https://example.com/',
        undefined,
        'https://example.com/jobs/42?utm_medium=social',
      ),
    ).toBe('https://example.com/jobs/42');
  });

  it('prefers a direct selected-job link over a side-view search URL', () => {
    expect(
      selectJobUrl(
        'https://examplejobs.test/jobs/search?currentJobId=12345&session=abc',
        'https://examplejobs.test/jobs/search',
        undefined,
        undefined,
        'https://examplejobs.test/jobs/view/12345?opaqueSession=value&eBP=token#details',
      ),
    ).toBe('https://examplejobs.test/jobs/view/12345');
  });
});
