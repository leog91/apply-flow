import { normalizeComparisonValue } from '@/lib/google-sheets/application-history';
import { normalizeJobUrl } from '@/lib/normalization/url';

interface JobIdentityInput {
  jobUrl?: string;
  company: string;
  position: string;
  location?: string;
}

export interface JobIdentity {
  id: string;
  identityKind: 'url' | 'metadata';
  canonicalUrl?: string;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function createDiscoveredJobIdentity(
  input: JobIdentityInput,
): Promise<JobIdentity> {
  const canonicalUrl = input.jobUrl ? normalizeJobUrl(input.jobUrl) : undefined;
  if (canonicalUrl) {
    return {
      id: `url:${await sha256(canonicalUrl)}`,
      identityKind: 'url',
      canonicalUrl,
    };
  }

  const fingerprint = [input.company, input.position, input.location ?? '']
    .map(normalizeComparisonValue)
    .join('|');
  if (!normalizeComparisonValue(input.company) && !normalizeComparisonValue(input.position)) {
    throw new Error('A URL-less discovered job needs a company or position.');
  }
  return {
    id: `metadata:${await sha256(fingerprint)}`,
    identityKind: 'metadata',
  };
}
