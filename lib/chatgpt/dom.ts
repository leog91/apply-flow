import type { ChatGptMessageBlock, ChatGptMessageSnapshot } from './parser';

const ASSISTANT_SELECTOR = [
  '[data-message-author-role="assistant"]',
  '[data-message-role="assistant"]',
].join(',');

function conversationId(url: URL): string | undefined {
  return /\/(?:c|uc)\/([^/?#]+)/.exec(url.pathname)?.[1];
}

function messageBlocks(root: Element): ChatGptMessageBlock[] {
  const content = root.querySelector('[data-assistant-markdown], .markdown') ?? root;
  const links = [...content.querySelectorAll<HTMLAnchorElement>('a[href]')].slice(0, 100);
  const headings = [...content.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const containers = new Map<Element, HTMLAnchorElement[]>();
  for (const link of links) {
    const container = link.closest('li, tr, p') ?? link.parentElement ?? content;
    containers.set(container, [...(containers.get(container) ?? []), link]);
  }

  return [...containers.entries()].map(([container, containerLinks]) => {
    const heading = headings.findLast((candidate) =>
      Boolean(candidate.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    const headingText = heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const containerText = container.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const emphasisRoot = heading ? [heading, container] : [container];
    return {
      text: [headingText, containerText].filter(Boolean).join(' — ').slice(0, 10_000),
      links: containerLinks.map((link) => ({
        text: link.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        url: link.href,
      })),
      emphasizedTexts: emphasisRoot
        .flatMap((element) => [...element.querySelectorAll('strong, b')])
        .slice(0, 20)
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean),
    };
  });
}

function timestampCandidates(root: Element): string[] {
  const boundary = root.closest('article, li') ?? root;
  const values = new Set<string>();
  const directTimes = [...boundary.children].filter((element) => element.tagName === 'TIME');
  for (const element of [root, boundary, ...directTimes]) {
    for (const name of ['datetime', 'data-timestamp', 'data-message-timestamp']) {
      const value = element.getAttribute(name)?.trim();
      if (value) values.add(value);
    }
    if (element.tagName === 'TIME' && element.textContent?.trim()) {
      values.add(element.textContent.trim());
    }
  }
  return [...values];
}

export function snapshotRenderedChatGptMessages(
  document: Document,
): ChatGptMessageSnapshot[] {
  const url = new URL(document.location.href);
  const cleanConversationUrl = `${url.origin}${url.pathname}`;
  const title = document.title
    .replace(/\s*[|·-]\s*ChatGPT.*$/i, '')
    .trim();
  const sourceName = title && !/^ChatGPT(?::|$)/i.test(title) ? title : undefined;
  const roots = [...document.querySelectorAll(ASSISTANT_SELECTOR)].filter(
    (root, index, all) => !all.some((candidate, candidateIndex) =>
      candidateIndex !== index && candidate.contains(root),
    ),
  ).slice(-500);

  return roots.map((root) => {
    const article = root.closest('article, li');
    return {
      conversationUrl: cleanConversationUrl,
      conversationId: conversationId(url),
      sourceName,
      messageId:
        root.getAttribute('data-message-id') ??
        article?.getAttribute('data-message-id') ??
        (article?.id || undefined),
      timestampCandidates: timestampCandidates(root),
      blocks: messageBlocks(root),
    };
  });
}
