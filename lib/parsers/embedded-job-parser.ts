import { extractRemoteEligibility, inferWorkMode } from '@/lib/extraction/job-attributes';
import { extractTechnologyKeywords } from '@/lib/extraction/technology-keywords';
import type { JobPageParser } from './types';

export const embeddedJobParser: JobPageParser = {
  id: 'embedded-job-board',
  matches: (context) => Boolean(context.embeddedJob),
  parse(context) {
    const job = context.embeddedJob;
    if (!job) return null;
    const stack = extractTechnologyKeywords(job.description);

    return {
      candidate: {
        company: job.company,
        position: job.position,
        location: job.location,
        url: job.url,
        workMode: inferWorkMode(job.description),
        remoteEligibility: extractRemoteEligibility(job.description),
        stack: stack.length > 0 ? stack : undefined,
      },
      source: 'Embedded job board',
      confidence: 'high',
      structured: true,
    };
  },
};
