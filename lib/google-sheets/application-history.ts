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
  exactJobs: ApplicationHistoryRecord[];
  probableJobs: ApplicationHistoryRecord[];
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
  const company = normalizeCompany(candidate.company);
  const position = normalizePosition(candidate.position);
  const url = normalizeJobUrl(candidate.url);
  const companyHistory = company
    ? records.filter(
         (record) => normalizeCompany(record.company) === company,
       )
     : [];

  const newestFirst = (items: ApplicationHistoryRecord[]) => [...items].sort(
    (a, b) => applicationDate(b.dateApplied) - applicationDate(a.dateApplied) || b.row - a.row,
  );
  const exactJobs = newestFirst(url
    ? records.filter((record) => normalizeJobUrl(record.url) === url)
    : []);
  const probableJobs = newestFirst(company && position
    ? companyHistory.filter((record) => normalizePosition(record.position) === position)
    : []);

  return {
    exactJob: exactJobs[0],
    probableJob: probableJobs[0],
    exactJobs,
    probableJobs,
    companyHistory: newestFirst(companyHistory),
  };
}

function normalizeCompany(value: string): string {
  const normalized = normalizeComparisonValue(value);
  // Strip legal suffixes only; do not merge brands or subsidiaries.
  return normalized.replace(/\s+(?:inc|incorporated|ltd|limited|llc|gmbh|b v|bv|s l|sl|s l u|slu)$/, '') || normalized;
}

function normalizePosition(value: string): string {
  return normalizeComparisonValue(value)
    .replace(/\bfront end\b/g, 'frontend')
    .replace(/\bback end\b/g, 'backend')
    .replace(/\bfull stack\b/g, 'fullstack');
}

function applicationDate(value: string): number {
  // ISO dates are unambiguous. Fall back to sheet row order for other formats.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value) || 0 : 0;
}

export function applicationTrackerRowUrl(spreadsheetId: string, row: number): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit#range=${encodeURIComponent(`Applications!A${row}:P${row}`)}`;
}
