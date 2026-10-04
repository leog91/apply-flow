import { cleanDisplayText } from '@/lib/normalization/text';

type JsonObject = Record<string, unknown>;

export interface JobPostingData {
  company?: string;
  position?: string;
  url?: string;
  location?: string;
  workMode?: 'Remote';
  remoteEligibility?: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJobPosting(value: JsonObject): boolean {
  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (item) =>
      typeof item === 'string' &&
      (item === 'JobPosting' || item.endsWith('/JobPosting')),
  );
}

function collectJobPostings(value: unknown, results: JsonObject[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, results);
    return;
  }

  if (!isObject(value)) return;
  if (isJobPosting(value)) results.push(value);

  const graph = value['@graph'];
  if (graph) collectJobPostings(graph, results);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return cleanDisplayText(value) || undefined;
}

function organizationName(value: unknown): string | undefined {
  if (typeof value === 'string') return stringValue(value);
  return isObject(value) ? stringValue(value.name) : undefined;
}

function locationText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const locations = [...new Set(value.map(locationText).filter(Boolean))];
    return locations.join('; ') || undefined;
  }
  if (typeof value === 'string') return stringValue(value);
  const location = value;
  if (!isObject(location)) return undefined;
  const address = location.address;
  if (typeof address === 'string') return stringValue(address);
  if (!isObject(address)) return stringValue(location.name);

  const country = isObject(address.addressCountry)
    ? stringValue(address.addressCountry.name)
    : stringValue(address.addressCountry);
  const parts = [
    stringValue(address.addressLocality),
    stringValue(address.addressRegion),
    country,
  ].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(', ') || undefined;
}

function eligibilityText(value: unknown): string | undefined {
  const values = Array.isArray(value) ? value : [value];
  const names = values.flatMap((item) => {
    const name = typeof item === 'string' ? stringValue(item) : isObject(item) ? stringValue(item.name) : undefined;
    return name ? [name] : [];
  });
  return [...new Set(names)].join('; ') || undefined;
}

function isRemote(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.some(
    (item) => typeof item === 'string' && item.toUpperCase().includes('TELECOMMUTE'),
  );
}

export function extractJobPostings(jsonLdScripts: string[]): JobPostingData[] {
  const objects: JsonObject[] = [];

  for (const script of jsonLdScripts) {
    try {
      collectJobPostings(JSON.parse(script), objects);
    } catch {
      // A malformed block should not prevent valid JSON-LD blocks from being used.
    }
  }

  return objects.map((posting) => ({
    company: organizationName(posting.hiringOrganization),
    position: stringValue(posting.title),
    url: stringValue(posting.url),
    location: locationText(posting.jobLocation),
    workMode: isRemote(posting.jobLocationType) ? 'Remote' : undefined,
    ...(eligibilityText(posting.applicantLocationRequirements)
      ? { remoteEligibility: eligibilityText(posting.applicantLocationRequirements) }
      : {}),
  }));
}
