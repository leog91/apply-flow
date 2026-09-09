import { createDiscoveredJobIdentity } from '@/lib/job-inbox/identity';
import type {
  DiscoveredJob,
  ObservedSourceMessage,
  SourceMessage,
  TimestampPrecision,
} from '@/lib/job-inbox/types';
import { normalizeJobUrl } from '@/lib/normalization/url';
import { cleanChatGptCompanyLabel } from './normalize';

export { cleanChatGptCompanyLabel } from './normalize';

export interface ChatGptMessageLink {
  text: string;
  url: string;
}

export interface ChatGptMessageBlock {
  text: string;
  links: ChatGptMessageLink[];
  emphasizedTexts?: string[];
}

export interface ChatGptMessageSnapshot {
  conversationUrl: string;
  conversationId?: string;
  sourceName?: string;
  messageId?: string;
  timestampCandidates: string[];
  blocks: ChatGptMessageBlock[];
}

export interface ParsedChatGptMessage {
  jobs: DiscoveredJob[];
  message: ObservedSourceMessage;
}

const GENERIC_LINK_TEXT = /^(?:apply(?: now)?|view(?: job| role)?|job|role|opening|learn more|source|\[?\d+\]?)$/i;
const ACTION_LINK_TEXT = /\b(?:apply|view|job|role|opening)\b/i;
const CITATION_LINK_TEXT = /(?:^|\s)(?:source|sources|salary|linkedin|greenhouse|jobleads|kula careers)(?:\s*\+?\d+)?$/i;
const JOB_DETAIL_PATH = /(?:^|\/)(?:jobs?|positions?|vacancies?|openings?|opportunities)\/(?:[^/?#]+\/)*[^/?#]+/i;
const ROLE_WORD = /\b(?:engineer|developer|designer|manager|scientist|analyst|architect|consultant|specialist|lead|director|intern|administrator|programmer|devops|sre|owner|recruiter|accountant|sales|marketing|operations|qa|tester)\b/i;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s*#>-]+|[\s*#>-]+$/g, '').trim();
}

function isoDay(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.trim()
    ? undefined
    : value.trim();
}

function englishDay(value: string): string | undefined {
  const match = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})$/i.exec(value.trim());
  if (!match) return undefined;
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = monthNames.indexOf((match[1] ?? '').slice(0, 3).toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return month >= 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
}

export function parseChatGptTimestamp(candidates: string[]): {
  sentAt?: string;
  sentDate?: string;
  timestampPrecision: TimestampPrecision;
} {
  for (const candidate of candidates.map((value) => value.trim()).filter(Boolean)) {
    const day = isoDay(candidate) ?? englishDay(candidate);
    if (day) return { sentDate: day, timestampPrecision: 'day' };

    const milliseconds = /^\d{13}$/.test(candidate)
      ? Number(candidate)
      : /^\d{10}$/.test(candidate)
        ? Number(candidate) * 1_000
        : undefined;
    const date = milliseconds === undefined ? new Date(candidate) : new Date(milliseconds);
    const zonedIsoDateTime = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(candidate);
    if (zonedIsoDateTime || milliseconds !== undefined) {
      if (!Number.isNaN(date.valueOf())) {
        return { sentAt: date.toISOString(), timestampPrecision: 'exact' };
      }
    }
  }
  return { timestampPrecision: 'unknown' };
}

function likelyJobLink(link: ChatGptMessageLink, block: ChatGptMessageBlock): boolean {
  const normalized = normalizeJobUrl(link.url);
  if (!normalized) return false;
  const url = new URL(normalized);
  if (url.hostname === 'chatgpt.com' || url.hostname.endsWith('.openai.com')) return false;
  const hostname = url.hostname.replace(/^www\./, '');
  const structuredRole = /\s(?:at|@)\s/i.test(block.text) || (block.emphasizedTexts?.length ?? 0) >= 2;
  const linkText = clean(link.text);
  const linkHasRole = ROLE_WORD.test(linkText);
  const linkHasAction = ACTION_LINK_TEXT.test(linkText);
  const descriptiveRoleLink = linkHasRole &&
    linkText.split(/\s+/).length >= 3 &&
    /\s(?:at|@)\s|\s[—–|]\s/i.test(linkText);
  if (CITATION_LINK_TEXT.test(linkText) || (!linkHasRole && !linkHasAction)) return false;
  const knownProvider = /(^|\.)(?:linkedin\.com|indeed\.com|greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com)$/.test(hostname);
  const providerDetail =
    (/(^|\.)linkedin\.com$/.test(hostname) && /\/jobs\/view\/\d+/.test(url.pathname)) ||
    (/(^|\.)indeed\.com$/.test(hostname) && url.pathname === '/viewjob' && url.searchParams.has('jk')) ||
    (/(^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com)$/.test(hostname) && JOB_DETAIL_PATH.test(url.pathname));
  const jobSubdomain = /^(?:jobs?|careers?)\./.test(hostname);
  return (
    (linkHasRole && (
      (knownProvider && providerDetail) ||
      (!knownProvider && (
        JOB_DETAIL_PATH.test(url.pathname) ||
        jobSubdomain ||
        structuredRole ||
        descriptiveRoleLink
      ))
    )) ||
    (linkHasAction && structuredRole && (
      providerDetail ||
      !knownProvider ||
      jobSubdomain
    ))
  );
}

function fieldsFromBlock(
  block: ChatGptMessageBlock,
  link: ChatGptMessageLink,
): { company: string; position: string; location?: string } {
  const text = clean(block.text);
  const emphasized = (block.emphasizedTexts ?? []).map(clean).filter(Boolean);
  const parts = text.split(/\s+[—–|]\s+/).map(clean).filter(Boolean);
  const companyFirst = parts.length >= 2 && ROLE_WORD.test(parts[1] ?? '');
  if (companyFirst) {
    return {
      company: cleanChatGptCompanyLabel(parts[0] ?? ''),
      position: parts[1] ?? '',
      location: parts.length > 2 && !ACTION_LINK_TEXT.test(parts[2] ?? '')
        ? parts[2]
        : undefined,
    };
  }
  const atMatch = /^(?:\d+[.)]\s*)?(.+?)\s+(?:at|@)\s+(.+?)(?:\s+[—–|]\s+|$)(.*)$/i.exec(text);
  if (atMatch) {
    const remainder = clean(atMatch[3] ?? '');
    const location = clean(
      remainder
        .split(/\s+[—–|]\s+/)[0]
        ?.replace(new RegExp(`\\b${link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*$`, 'i'), '') ?? '',
    );
    return {
      position: clean(atMatch[1] ?? ''),
      company: cleanChatGptCompanyLabel(atMatch[2] ?? ''),
      location: location || undefined,
    };
  }

  if (emphasized.length >= 2) {
    return {
      position: emphasized[0] ?? '',
      company: cleanChatGptCompanyLabel(emphasized[1] ?? ''),
      location: parts.find((part) => !emphasized.includes(part) && part !== link.text),
    };
  }
  const meaningfulLinkText = GENERIC_LINK_TEXT.test(clean(link.text)) ? '' : clean(link.text);
  const firstPart = parts[0] === clean(link.text) ? '' : parts[0];
  return {
    company: '',
    position: meaningfulLinkText || firstPart || '',
    location: parts.length > 2 ? parts[2] : undefined,
  };
}

async function messageKey(snapshot: ChatGptMessageSnapshot): Promise<string> {
  if (snapshot.messageId) return `${snapshot.conversationId ?? snapshot.conversationUrl}:${snapshot.messageId}`;
  const identity = await createDiscoveredJobIdentity({
    company: snapshot.conversationId ?? snapshot.conversationUrl,
    position: snapshot.blocks.map((block) => block.text).join('\n'),
  });
  return `message:${identity.id.slice('metadata:'.length)}`;
}

export async function parseChatGptMessage(
  snapshot: ChatGptMessageSnapshot,
  firstSeenAt = new Date().toISOString(),
): Promise<ParsedChatGptMessage> {
  const timestamp = parseChatGptTimestamp(snapshot.timestampCandidates);
  const sourceMessage: SourceMessage = {
    source: 'chatgpt',
    sourceName: snapshot.sourceName,
    conversationUrl: snapshot.conversationUrl,
    conversationId: snapshot.conversationId,
    messageId: snapshot.messageId,
    ...timestamp,
    firstSeenAt,
  };
  const jobs = new Map<string, DiscoveredJob>();

  for (const block of snapshot.blocks) {
    for (const link of block.links) {
      if (!likelyJobLink(link, block)) continue;
      const fields = fieldsFromBlock(block, link);
      const identity = await createDiscoveredJobIdentity({ ...fields, jobUrl: link.url });
      if (jobs.has(identity.id)) continue;
      jobs.set(identity.id, {
        id: identity.id,
        identityKind: identity.identityKind,
        company: fields.company,
        position: fields.position,
        location: fields.location,
        jobUrl: normalizeJobUrl(link.url),
        canonicalUrl: identity.canonicalUrl,
        sourceMessage,
        firstSeenAt,
        status: 'new',
      });
    }
  }

  const parsedJobs = [...jobs.values()];
  return {
    jobs: parsedJobs,
    message: {
      key: await messageKey(snapshot),
      sourceMessage,
      jobIds: parsedJobs.map((job) => job.id),
    },
  };
}
