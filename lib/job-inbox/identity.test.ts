import { describe, expect, it } from 'vitest';
import { createDiscoveredJobIdentity } from './identity';

describe('createDiscoveredJobIdentity', () => {
  it('generates the same URL identity for tracking variants', async () => {
    const first = await createDiscoveredJobIdentity({
      company: 'Synthetic Labs',
      position: 'Platform Engineer',
      jobUrl: 'https://jobs.synthetic.test/roles/42/?utm_source=chatgpt#apply',
    });
    const second = await createDiscoveredJobIdentity({
      company: 'Different scraped label',
      position: 'Different scraped title',
      jobUrl: 'https://jobs.synthetic.test/roles/42',
    });

    expect(first).toEqual(second);
    expect(first.identityKind).toBe('url');
  });

  it('marks URL-less fallback identities explicitly', async () => {
    const first = await createDiscoveredJobIdentity({
      company: 'Synthetíc Labs',
      position: 'Platform Engineer',
      location: 'Amsterdam',
    });
    const second = await createDiscoveredJobIdentity({
      company: 'synthetic labs',
      position: 'platform engineer',
      location: 'Amsterdam',
    });

    expect(first).toEqual(second);
    expect(first.identityKind).toBe('metadata');
  });
});
