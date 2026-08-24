import { cleanDisplayText } from '@/lib/normalization/text';
import { extractTechnologyKeywords } from '@/lib/extraction/technology-keywords';
import type { JobPageParser } from './types';

function comparisonValue(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function hostMatchesLabel(url: string, label: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const normalizedLabel = comparisonValue(label);
    return (
      normalizedLabel.length >= 3 &&
      hostname
        .split('.')
        .some((part) => comparisonValue(part) === normalizedLabel)
    );
  } catch {
    return false;
  }
}

function hasCareerSubdomain(url: string): boolean {
  try {
    const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
    return parts.some((part) => ['career', 'careers', 'jobs', 'join'].includes(part));
  } catch {
    return false;
  }
}

function companyFromHiringTitle(
  title: string | undefined,
  position: string | undefined,
): string | undefined {
  if (!title || !position) return undefined;
  const markerIndex = title.toLocaleLowerCase().indexOf(' hiring ');
  if (markerIndex <= 0) return undefined;

  const company = cleanDisplayText(title.slice(0, markerIndex));
  const remainder = comparisonValue(title.slice(markerIndex + ' hiring '.length));
  return remainder.includes(comparisonValue(position)) ? company : undefined;
}

function isGenericCareersHeading(value: string | undefined): boolean {
  if (!value) return false;
  return /^(?:open positions?|open roles?|jobs?|careers?|vacancies|vacantes|posiciones abiertas)\.?$/i.test(
    cleanDisplayText(value),
  );
}

export const genericParser: JobPageParser = {
  id: 'generic-metadata',
  matches: () => true,
  parse(context) {
    const subheadings = context.subheadings ?? [];
    const embeddedPosition =
      isGenericCareersHeading(context.headings[0]) && subheadings.length === 1
        ? subheadings[0]
        : undefined;
    const titleParts = context.title
      .split('|')
      .map(cleanDisplayText)
      .filter(Boolean);
    const titlePosition = titleParts[0];
    const matchingHeading = titlePosition
      ? context.headings.find(
          (heading) => comparisonValue(heading) === comparisonValue(titlePosition),
        )
      : undefined;
    const hostBrandedTitle =
      titleParts.length >= 2 && hostMatchesLabel(context.url, titleParts.at(-1) ?? '');
    const platformTitle = titleParts.length >= 3 && hostBrandedTitle;
    const hiringCompany = hostBrandedTitle
      ? companyFromHiringTitle(titlePosition, context.headings[0])
      : undefined;
    const companySiteTitle =
      titleParts.length === 2 &&
      hasCareerSubdomain(context.url) &&
      hostMatchesLabel(context.url, titleParts[1] ?? '');
    const siteCompany =
      embeddedPosition &&
      context.openGraph.siteName &&
      hostMatchesLabel(context.url, context.openGraph.siteName)
        ? context.openGraph.siteName
        : undefined;
    const company =
      hiringCompany ??
      (platformTitle || companySiteTitle ? titleParts[1] : undefined) ??
      siteCompany;
    const stack = extractTechnologyKeywords(context.jobSectionText ?? context.pageText);
    const position = cleanDisplayText(
      embeddedPosition ??
        (hiringCompany ? context.headings[0] : matchingHeading) ??
        (platformTitle || companySiteTitle ? titlePosition : undefined) ??
        context.headings[0] ??
        context.openGraph.title ??
        context.title,
    );

    return {
      candidate: {
        company: company || undefined,
        position: position || undefined,
        stack: stack.length > 0 ? stack : undefined,
      },
      source: embeddedPosition
        ? 'Embedded job section'
        : matchingHeading || context.headings[0]
        ? 'Semantic page heading'
        : context.openGraph.title
          ? 'OpenGraph title'
          : company
            ? 'Document title pattern'
            : 'Document title',
      confidence: 'low',
    };
  },
};
