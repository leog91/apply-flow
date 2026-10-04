import { cleanDisplayText } from '@/lib/normalization/text';

export type WorkMode = 'Remote' | 'Hybrid' | 'On-site';

const WORK_MODE_SUFFIX =
  /\s*(?:[([]\s*)?(?:remote|remoto|remota|hybrid|h(?:i|\u00ed)brido|h(?:i|\u00ed)brida|on[- ]?site|onsite|in[- ]office|presencial)(?:\s*[)\]])?\s*$/i;

const DESCRIPTION_HEADING =
  /(?:^|\n)\s*(?:about the job|about this role|job description|role description|descripci(?:o|\u00f3)n del (?:empleo|puesto)|acerca del empleo|sobre el puesto)\s*(?:\n|$)/i;

export function extractDescriptionSection(bodyText: string): string | undefined {
  const heading = DESCRIPTION_HEADING.exec(bodyText);
  if (!heading) return undefined;

  const content = bodyText.slice(heading.index + heading[0].length, heading.index + 50_000);
  const relatedSection = /\n\s*(?:about the company|company overview|acerca de la empresa|sobre la empresa|similar jobs|people also viewed|related jobs|more jobs|empleos similares|otros empleos)\s*\n/i.exec(
    content,
  );
  const section = relatedSection ? content.slice(0, relatedSection.index) : content;
  return section.trim() || undefined;
}

export function inferWorkMode(text: string): WorkMode | undefined {
  const sample = text.slice(0, 2_000);
  if (/\b(?:hybrid|h(?:i|\u00ed)brido|h(?:i|\u00ed)brida)\b/i.test(sample)) {
    return 'Hybrid';
  }
  if (/\b(?:remote|remoto|remota|teletrabajo|remote-first)\b/i.test(sample)) {
    return 'Remote';
  }
  if (/\b(?:on[- ]?site|onsite|in[- ]office|presencial)\b/i.test(sample)) {
    return 'On-site';
  }
  return undefined;
}

export function extractRemoteEligibility(text: string): string | undefined {
  // Retain the source phrase instead of interpreting legal eligibility or negation.
  const sentences = text.slice(0, 50_000).split(/[\n.!?]+/);
  return sentences.map(cleanDisplayText).find((sentence) => sentence.length <= 300 && (
    /\bremote\s+(?:only\s+)?(?:within|from|in|across)\b/i.test(sentence) ||
    /\b(?:must|need to)\s+(?:be\s+)?(?:based|reside|live)\s+in\b/i.test(sentence)
  ));
}

export function inferLocation(
  headingContext: string | undefined,
  position: string | undefined,
  company: string | undefined,
  documentTitle: string,
): string | undefined {
  const lines = headingContext
    ?.split(/\n+/)
    .map(cleanDisplayText)
    .filter(Boolean)
    .slice(0, 80) ?? [];

  if (position && company) {
    const normalizedPosition = position.toLocaleLowerCase();
    const normalizedCompany = company.toLocaleLowerCase();

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]?.toLocaleLowerCase().includes(normalizedPosition)) continue;
      const hasCompanyBefore = lines
        .slice(Math.max(0, index - 3), index)
        .some((line) => line.toLocaleLowerCase().includes(normalizedCompany));
      const nearbyCompanyIndex = lines
        .slice(index + 1, index + 5)
        .findIndex((line) => line.toLocaleLowerCase().includes(normalizedCompany));
      if (!hasCompanyBefore && nearbyCompanyIndex < 0) continue;

      const locationLines = lines.slice(
        nearbyCompanyIndex >= 0 ? index + nearbyCompanyIndex + 2 : index + 1,
        nearbyCompanyIndex >= 0 ? index + nearbyCompanyIndex + 5 : index + 4,
      );
      for (const line of locationLines) {
        const candidate = cleanDisplayText(line.split(/\s+[·|]\s+/)[0]).replace(
          WORK_MODE_SUFFIX,
          '',
        );
        if (
          candidate &&
          candidate.length <= 100 &&
          !/\b(?:applicants?|ago|apply|save|viewed|promoted)\b/i.test(candidate) &&
          !inferWorkMode(candidate)
        ) {
          return candidate;
        }
      }
    }
  }

  for (const line of lines) {
    let candidate = line;
    let removedKnownValue = false;
    for (const knownValue of [position, company]) {
      if (
        knownValue &&
        candidate.toLocaleLowerCase().startsWith(knownValue.toLocaleLowerCase())
      ) {
        candidate = cleanDisplayText(candidate.slice(knownValue.length));
        removedKnownValue = true;
      }
    }
    const lineWorkMode = inferWorkMode(line);
    const beforeModeRemoval = candidate;
    if (lineWorkMode) {
      candidate = cleanDisplayText(candidate.split(/\s+[·|]\s+/)[0]).replace(
        WORK_MODE_SUFFIX,
        '',
      );
    }
    const modeProvidedLocation = Boolean(
      lineWorkMode && candidate && candidate !== beforeModeRemoval,
    );

    if (
      candidate &&
      (removedKnownValue ||
        modeProvidedLocation ||
        candidate.length <= 100 &&
          /,|\b(?:area|region|city|county|province)\b/i.test(candidate))
    ) {
      if (!/\b(?:applicants?|ago|apply|save|viewed|promoted)\b/i.test(candidate)) {
        return candidate;
      }
    }
  }

  const summary = documentTitle.split('|')[0] ?? '';
  const hiringIndex = summary.toLocaleLowerCase().indexOf(' hiring ');
  const locationIndex = summary.toLocaleLowerCase().lastIndexOf(' in ');
  if (hiringIndex >= 0 && locationIndex > hiringIndex) {
    return cleanDisplayText(summary.slice(locationIndex + ' in '.length)) || undefined;
  }

  return undefined;
}
