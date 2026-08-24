import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';
import type { JobPageContext } from '@/lib/schemas/job-page-context';

export type CandidateFields = Partial<Omit<ApplicationCandidate, 'sourceHost'>>;

export interface ParserOutput {
  candidate: CandidateFields;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  structured?: boolean;
}

export interface JobPageParser {
  id: string;
  matches(context: JobPageContext): boolean;
  parse(context: JobPageContext): ParserOutput | null;
}

export interface ExtractionMetadata {
  sourceHost?: string;
  parsers: string[];
  sources: string[];
  confidence: ParserOutput['confidence'];
  structured: boolean;
}

export interface ExtractionResult {
  candidate: ApplicationCandidate;
  metadata: ExtractionMetadata;
}
