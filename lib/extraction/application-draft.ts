import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';
import { normalizeJobUrl } from '@/lib/normalization/url';
import { normalizeComparisonValue } from '@/lib/google-sheets/application-history';

export type EditableField = 'company' | 'position' | 'url' | 'location' | 'workMode';

export function sameJobListing(previous: ApplicationCandidate, next: ApplicationCandidate): boolean {
  const previousUrl = normalizeJobUrl(previous.url);
  if (!previousUrl || previousUrl !== normalizeJobUrl(next.url)) return false;
  // Some careers pages replace the selected vacancy without changing the URL.
  return (['company', 'position'] as const).every((field) => !previous[field] || !next[field] ||
    normalizeComparisonValue(previous[field]) === normalizeComparisonValue(next[field]));
}

export function preserveDraftEdits(
  previous: ApplicationCandidate,
  detected: ApplicationCandidate,
  edited: Set<EditableField>,
): ApplicationCandidate {
  const result = { ...detected };
  for (const field of edited) {
    // Preserve even an intentionally cleared field.
    Object.assign(result, { [field]: previous[field] });
  }
  return result;
}
