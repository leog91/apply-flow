import { z } from 'zod';
import { cleanDisplayText } from '@/lib/normalization/text';
import type { JobPageContext } from '@/lib/schemas/job-page-context';

const GreenhouseJobSchema = z.object({
  absolute_url: z.url().optional(),
  company_name: z.string(),
  content: z.string(),
  location: z.object({ name: z.string() }),
  title: z.string(),
});

function decodeJobContent(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);|&apos;/gi, "'")
    .replace(/<(?:br|\/p|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function contentLocation(content: string): string | undefined {
  return cleanDisplayText(
    /(?:^|\n)Location:\s*([^\n—|]{2,100})/i.exec(content)?.[1],
  ) || undefined;
}

export function parseGreenhouseJobResponse(
  response: unknown,
  siteName?: string,
): JobPageContext['embeddedJob'] {
  const parsed = GreenhouseJobSchema.safeParse(response);
  if (!parsed.success) return undefined;
  const job = parsed.data;
  const description = decodeJobContent(job.content);
  const company =
    siteName?.toLocaleLowerCase() === job.company_name.trim().toLocaleLowerCase()
      ? siteName
      : cleanDisplayText(job.company_name);

  return {
    company,
    position: cleanDisplayText(job.title),
    location: contentLocation(description) ?? cleanDisplayText(job.location.name),
    url: job.absolute_url,
    description,
  };
}

function greenhouseReference(context: JobPageContext) {
  for (const value of context.embeddedUrls ?? []) {
    try {
      const url = new URL(value);
      if (url.hostname !== 'job-boards.greenhouse.io') continue;
      const board = url.searchParams.get('for');
      const jobId =
        url.searchParams.get('token') ?? new URL(context.url).searchParams.get('gh_jid');
      if (board && jobId && /^\d+$/.test(jobId)) return { board, jobId };
    } catch {
      // Ignore malformed resource URLs and continue with the page fallback.
    }
  }
  return undefined;
}

export async function enrichEmbeddedJob(
  context: JobPageContext,
): Promise<JobPageContext> {
  const reference = greenhouseReference(context);
  if (!reference) return context;

  try {
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(reference.board)}/jobs/${encodeURIComponent(reference.jobId)}?content=true`,
    );
    if (!response.ok) return context;
    const embeddedJob = parseGreenhouseJobResponse(
      await response.json(),
      context.openGraph.siteName,
    );
    return embeddedJob
      ? {
          ...context,
          embeddedJob,
          selectedJobUrl: embeddedJob.url ?? context.selectedJobUrl,
        }
      : context;
  } catch {
    return context;
  }
}
