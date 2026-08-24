const TRACKING_PARAMETERS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'refid',
  'trackingid',
  'trk',
]);

export function normalizeJobUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

export function getSourceHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

export function selectJobUrl(
  currentUrl: string,
  canonicalUrl?: string,
  structuredUrl?: string,
  openGraphUrl?: string,
  selectedJobUrl?: string,
): string {
  const normalizedSelectedJob = selectedJobUrl
    ? normalizeJobUrl(selectedJobUrl)
    : undefined;
  if (normalizedSelectedJob) {
    const selected = new URL(normalizedSelectedJob);
    const selectedJobId = [...new URL(currentUrl).searchParams.entries()].find(
      ([key, value]) => /jobid$/i.test(key) && Boolean(value),
    )?.[1];

    if (selectedJobId && selected.pathname.includes(selectedJobId)) {
      selected.search = '';
      selected.hash = '';
    }

    return selected.toString();
  }

  const normalizedCurrent = normalizeJobUrl(currentUrl);
  const normalizedCanonical = canonicalUrl
    ? normalizeJobUrl(canonicalUrl)
    : undefined;

  if (normalizedCanonical) {
    const canonical = new URL(normalizedCanonical);
    const current = normalizedCurrent ? new URL(normalizedCurrent) : undefined;
    const canonicalLooksSpecific =
      canonical.pathname !== '/' || canonical.search !== '' || current?.pathname === '/';
    if (canonicalLooksSpecific) return normalizedCanonical;
  }

  for (const value of [structuredUrl, openGraphUrl, normalizedCurrent]) {
    if (!value) continue;
    const normalized = normalizeJobUrl(value);
    if (normalized) return normalized;
  }

  return '';
}
