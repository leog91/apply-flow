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
  'fbclid',
  'gclid',
  'msclkid',
]);

function unwrapKnownRedirect(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'google.com' && url.pathname === '/url') {
      return url.searchParams.get('q') ?? url.searchParams.get('url') ?? value;
    }
    if (host === 'l.facebook.com' && url.pathname === '/l.php') {
      return url.searchParams.get('u') ?? value;
    }
  } catch {
    // The normalizer below handles invalid URLs.
  }
  return value;
}

export function normalizeJobUrl(value: string): string | undefined {
  try {
    const url = new URL(unwrapKnownRedirect(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;

    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (TRACKING_PARAMETERS.has(normalizedKey) || normalizedKey.startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }

    const linkedInJobId = /\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/i.exec(
      url.pathname,
    )?.[1];
    if (url.hostname.endsWith('linkedin.com') && linkedInJobId) {
      url.pathname = `/jobs/view/${linkedInJobId}`;
      url.search = '';
    } else {
      const sortedParameters = [...url.searchParams.entries()].sort(
        ([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
      );
      url.search = '';
      for (const [key, parameterValue] of sortedParameters) {
        url.searchParams.append(key, parameterValue);
      }
    }

    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');

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
