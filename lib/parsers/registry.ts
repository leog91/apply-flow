import { ApplicationCandidateSchema } from '@/lib/schemas/application-candidate';
import type { JobPageContext } from '@/lib/schemas/job-page-context';
import { cleanDisplayText } from '@/lib/normalization/text';
import { getSourceHost, selectJobUrl } from '@/lib/normalization/url';
import { genericParser } from './generic-parser';
import { schemaOrgParser } from './schema-org-parser';
import type { ExtractionResult, JobPageParser, ParserOutput } from './types';

export const parserRegistry: JobPageParser[] = [
  schemaOrgParser,
  genericParser,
];

const confidenceRank: Record<ParserOutput['confidence'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function parseJobPage(context: JobPageContext): ExtractionResult {
  const outputs = parserRegistry.flatMap((parser) => {
    if (!parser.matches(context)) return [];
    const output = parser.parse(context);
    return output ? [{ parserId: parser.id, output }] : [];
  });

  const candidateFields = outputs.reduce<Record<string, unknown>>(
    (candidate, { output }) => {
      for (const [key, value] of Object.entries(output.candidate)) {
        if (candidate[key] === undefined && value !== undefined) candidate[key] = value;
      }
      return candidate;
    },
    {},
  );
  const structuredUrl =
    typeof candidateFields.url === 'string' ? candidateFields.url : undefined;
  const confidence = outputs.reduce<ParserOutput['confidence']>(
    (best, { output }) =>
      confidenceRank[output.confidence] > confidenceRank[best]
        ? output.confidence
        : best,
    'low',
  );

  const url = selectJobUrl(
    context.url,
    context.canonicalUrl,
    structuredUrl,
    context.openGraph.url,
    context.selectedJobUrl,
  );
  const sourceHost = getSourceHost(url);
  const candidate = ApplicationCandidateSchema.parse({
    ...candidateFields,
    company: cleanDisplayText(candidateFields.company as string | undefined),
    position: cleanDisplayText(candidateFields.position as string | undefined),
    url,
    sourceHost,
  });

  return {
    candidate,
    metadata: {
      sourceHost,
      parsers: outputs.map(({ parserId }) => parserId),
      sources: outputs.map(({ output }) => output.source),
      confidence,
      structured: outputs.some(({ output }) => output.structured),
    },
  };
}
