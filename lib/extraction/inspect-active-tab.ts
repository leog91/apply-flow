import { parseJobPage } from '@/lib/parsers/registry';
import { JobPageContextSchema } from '@/lib/schemas/job-page-context';
import type { ExtractionResult } from '@/lib/parsers/types';

export type ActiveTabExtraction =
  | { status: 'success'; result: ExtractionResult }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

function inspectPage() {
  const metaContent = (property: string) =>
    document
      .querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
      ?.content.trim();
  const currentUrl = new URL(window.location.href);
  const selectedJobId = [...currentUrl.searchParams.entries()].find(
    ([key, value]) => /jobid$/i.test(key) && Boolean(value),
  )?.[1];
  const selectedJobUrl = selectedJobId
    ? Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((anchor) => anchor.href)
        .filter((href) => {
          try {
            const candidate = new URL(href);
            return (
              candidate.protocol.startsWith('http') &&
              candidate.hostname === currentUrl.hostname &&
              candidate.pathname !== currentUrl.pathname &&
              href.includes(selectedJobId)
            );
          } catch {
            return false;
          }
        })
        .sort((left, right) => {
          const leftIsView = /\/view\//i.test(new URL(left).pathname) ? 0 : 1;
          const rightIsView = /\/view\//i.test(new URL(right).pathname) ? 0 : 1;
          return leftIsView - rightIsView || left.length - right.length;
        })[0]
    : undefined;
  const subheadingElements = Array.from(
    document.querySelectorAll<HTMLHeadingElement>('main h3, [role="main"] h3, article h3'),
  );
  const jobSectionText =
    subheadingElements.length === 1
      ? (() => {
          const heading = subheadingElements[0];
          let container = heading?.parentElement;
          while (container && container !== document.body) {
            const text = container.innerText.trim();
            if (text.length >= 300 && container.querySelector('a[href]')) {
              return text.slice(0, 50_000);
            }
            container = container.parentElement;
          }
          return undefined;
        })()
      : undefined;

  return {
    url: window.location.href,
    title: document.title,
    pageText: (
      document.querySelector<HTMLElement>('main, [role="main"], article')?.innerText ??
      document.body.innerText
    ).slice(0, 100_000),
    selectedJobUrl,
    headings: [
      ...document.querySelectorAll<HTMLHeadingElement>('h1'),
      ...document.querySelectorAll<HTMLHeadingElement>('h2'),
    ]
      .map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((heading, index, headings) =>
        Boolean(heading) && headings.indexOf(heading) === index,
      )
      .slice(0, 20),
    subheadings: subheadingElements
      .map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .slice(0, 20),
    jobSectionText,
    canonicalUrl: document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.href.trim(),
    openGraph: {
      title: metaContent('og:title'),
      url: metaContent('og:url'),
      siteName: metaContent('og:site_name'),
    },
    jsonLdScripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
      (script) => script.textContent ?? '',
    ),
  };
}

export async function extractFromActiveTab(): Promise<ActiveTabExtraction> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      return {
        status: 'unsupported',
        message: 'This browser page cannot be inspected. Open an HTTP or HTTPS job listing.',
      };
    }

    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: inspectPage,
    });
    const parsedContext = JobPageContextSchema.safeParse(injection?.result);
    if (!parsedContext.success) {
      return { status: 'error', message: 'The page returned data in an unexpected format.' };
    }

    return { status: 'success', result: parseJobPage(parsedContext.data) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown browser error';
    return { status: 'error', message: `Could not inspect this page: ${detail}` };
  }
}
