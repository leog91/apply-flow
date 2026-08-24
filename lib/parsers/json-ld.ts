import { cleanDisplayText } from '@/lib/normalization/text';

type JsonObject = Record<string, unknown>;

export interface JobPostingData {
  company?: string;
  position?: string;
  url?: string;
  city?: string;
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

function locationCity(value: unknown): string | undefined {
  const location = Array.isArray(value) ? value[0] : value;
  if (!isObject(location)) return undefined;
  const address = location.address;
  if (typeof address === 'string') return stringValue(address);
  return isObject(address) ? stringValue(address.addressLocality) : undefined;
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
    city: locationCity(posting.jobLocation),
  }));
}
