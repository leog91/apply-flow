import { normalizeJobUrl } from '@/lib/normalization/url';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';

export interface ApplicationHistoryRecord {
  row: number;
  dateApplied: string;
  company: string;
  position: string;
  url: string;
  stage: string;
  outcome: string;
  nextAction: string;
  nextActionDate: string;
}

export interface ApplicationHistoryMatch {
  exactJob?: ApplicationHistoryRecord;
  probableJob?: ApplicationHistoryRecord;
  companyHistory: ApplicationHistoryRecord[];
}

export function normalizeComparisonValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchApplicationHistory(
  records: ApplicationHistoryRecord[],
  candidate: Pick<ApplicationCandidate, 'company' | 'position' | 'url'>,
): ApplicationHistoryMatch {
  const company = normalizeComparisonValue(candidate.company);
  const position = normalizeComparisonValue(candidate.position);
  const url = normalizeJobUrl(candidate.url);
  const companyHistory = company
    ? records.filter(
        (record) => normalizeComparisonValue(record.company) === company,
      )
    : [];

  return {
    exactJob: url
      ? records.find((record) => normalizeJobUrl(record.url) === url)
      : undefined,
    probableJob:
      company && position
        ? companyHistory.find(
            (record) => normalizeComparisonValue(record.position) === position,
          )
        : undefined,
    companyHistory,
  };
}
