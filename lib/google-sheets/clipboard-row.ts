import { getSourceHost } from '@/lib/normalization/url';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';

function sheetDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cell(value: string | undefined): string {
  return value?.replace(/[\t\r\n]+/g, ' ').trim() ?? '';
}

export function buildApplicationClipboardRow(
  candidate: ApplicationCandidate,
  technologies: string[],
  date = new Date(),
): string {
  const values = [
    sheetDate(date),
    candidate.company,
    candidate.position,
    candidate.location,
    candidate.language,
    technologies.join(', '),
    candidate.sourceHost ?? getSourceHost(candidate.url),
    candidate.url,
    '',
    '',
    candidate.salaryRange,
    'Applied',
    '',
    '',
    '',
    '',
  ];

  return values.map(cell).join('\t');
}
