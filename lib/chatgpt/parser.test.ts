import { describe, expect, it } from 'vitest';
import { parseChatGptMessage, parseChatGptTimestamp } from './parser';

const baseMessage = {
  conversationUrl: 'https://chatgpt.com/c/conversation-123',
  conversationId: 'conversation-123',
  sourceName: 'Amsterdam jobs',
  messageId: 'message-456',
  timestampCandidates: [],
};

describe('parseChatGptTimestamp', () => {
  it('distinguishes exact, day-only, and unknown timestamps', () => {
    expect(parseChatGptTimestamp(['2026-09-01T08:04:32Z'])).toEqual({
      sentAt: '2026-09-01T08:04:32.000Z',
      timestampPrecision: 'exact',
    });
    expect(parseChatGptTimestamp(['2026-09-01'])).toEqual({
      sentDate: '2026-09-01',
      timestampPrecision: 'day',
    });
    expect(parseChatGptTimestamp(['September 1, 2026'])).toEqual({
      sentDate: '2026-09-01',
      timestampPrecision: 'day',
    });
    expect(parseChatGptTimestamp(['Sep 1'])).toEqual({
      timestampPrecision: 'unknown',
    });
    expect(parseChatGptTimestamp(['2026-09-01T08:04:32'])).toEqual({
      timestampPrecision: 'unknown',
    });
  });
});

describe('parseChatGptMessage', () => {
  it('parses a simple job result with source metadata', async () => {
    const result = await parseChatGptMessage(
      {
        ...baseMessage,
        timestampCandidates: ['2026-09-01'],
        blocks: [{
          text: 'Platform Engineer at Synthetic Labs — Amsterdam, Netherlands — View job',
          emphasizedTexts: ['Platform Engineer', 'Synthetic Labs'],
          links: [{
            text: 'View job',
            url: 'https://jobs.synthetic.test/roles/42?utm_source=chatgpt',
          }],
        }],
      },
      '2026-09-03T09:00:00.000Z',
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      company: 'Synthetic Labs',
      position: 'Platform Engineer',
      location: 'Amsterdam, Netherlands',
      canonicalUrl: 'https://jobs.synthetic.test/roles/42',
      firstSeenAt: '2026-09-03T09:00:00.000Z',
      status: 'new',
      sourceMessage: {
        source: 'chatgpt',
        sentDate: '2026-09-01',
        timestampPrecision: 'day',
      },
    });
  });

  it('parses several jobs from one message', async () => {
    const result = await parseChatGptMessage({
      ...baseMessage,
      blocks: [
        {
          text: 'Backend Developer at Demo Works — Remote — Apply',
          emphasizedTexts: ['Backend Developer', 'Demo Works'],
          links: [{ text: 'Apply', url: 'https://careers.demo.test/jobs/10' }],
        },
        {
          text: 'Data Engineer at Example Co — Copenhagen — View role',
          emphasizedTexts: ['Data Engineer', 'Example Co'],
          links: [{ text: 'View role', url: 'https://example.test/careers/20' }],
        },
      ],
    });

    expect(result.jobs.map((job) => job.position)).toEqual([
      'Backend Developer',
      'Data Engineer',
    ]);
    expect(result.message.jobIds).toHaveLength(2);
  });

  it('ignores explanatory and careers-home links', async () => {
    const result = await parseChatGptMessage({
      ...baseMessage,
      blocks: [{
        text: 'Read the company background and careers page before applying.',
        links: [
          { text: 'Company background', url: 'https://example.test/about' },
          { text: 'Careers', url: 'https://example.test/careers/' },
          { text: 'Source', url: 'https://chatgpt.com/citation/source-1' },
          { text: 'Acme on LinkedIn', url: 'https://www.linkedin.com/company/acme' },
          { text: 'Search LinkedIn jobs', url: 'https://www.linkedin.com/jobs/search/software-engineering' },
        ],
      }],
    });

    expect(result.jobs).toEqual([]);
  });

  it('accepts a structured non-engineering role on a jobs subdomain', async () => {
    const result = await parseChatGptMessage({
      ...baseMessage,
      blocks: [{
        text: 'Product Owner at Synthetic Labs — Valencia — Apply',
        links: [{ text: 'Apply', url: 'https://jobs.synthetic.test/8472' }],
      }],
    });

    expect(result.jobs[0]).toMatchObject({
      position: 'Product Owner',
      company: 'Synthetic Labs',
    });
  });

  it('uses a job heading while ignoring ChatGPT citation pills', async () => {
    const result = await parseChatGptMessage({
      ...baseMessage,
      blocks: [
        {
          text: '5. Maisa — Software Engineer (Backend) — Maisa is an AI product startup.',
          emphasizedTexts: ['5. Maisa — Software Engineer (Backend)'],
          links: [
            { text: 'Kula Careers', url: 'https://jobs.kula.ai/maisa/software-engineer' },
          ],
        },
        {
          text: '5. Maisa — Software Engineer (Backend) — Apply at Maisa',
          emphasizedTexts: ['5. Maisa — Software Engineer (Backend)'],
          links: [
            { text: 'Apply at Maisa', url: 'https://jobs.kula.ai/maisa/software-engineer' },
            { text: 'LinkedIn +1', url: 'https://www.linkedin.com/jobs/view/1234567890' },
            { text: 'Salary', url: 'https://jobleads.example/jobs/maisa' },
          ],
        },
      ],
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      company: 'Maisa',
      position: 'Software Engineer (Backend)',
    });
  });
});
