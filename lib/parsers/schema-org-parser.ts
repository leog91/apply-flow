import { extractJobPostings } from './json-ld';
import type { JobPageParser } from './types';

export const schemaOrgParser: JobPageParser = {
  id: 'schema-org-job-posting',
  matches: (context) => extractJobPostings(context.jsonLdScripts).length > 0,
  parse(context) {
    const posting = extractJobPostings(context.jsonLdScripts)[0];
    if (!posting) return null;

    return {
      candidate: {
        company: posting.company,
        position: posting.position,
        url: posting.url,
        location: posting.location,
        workMode: posting.workMode,
        remoteEligibility: posting.remoteEligibility,
      },
      source: 'JSON-LD JobPosting',
      confidence: 'high',
      structured: true,
    };
  },
};
