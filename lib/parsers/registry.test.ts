import { describe, expect, it } from 'vitest';
import { parseJobPage } from './registry';

describe('parseJobPage', () => {
  it('layers structured data with generic URL source tracking', () => {
    const result = parseJobPage({
      url: 'https://careers.acme.com/apply/engineer?utm_source=mail',
      title: 'Engineer at Acme',
      headings: ['Engineer'],
      pageText: 'Build services with TypeScript and PostgreSQL.',
      openGraph: {},
      jsonLdScripts: [
        JSON.stringify({
          '@type': 'JobPosting',
          title: 'Senior Engineer',
          hiringOrganization: { name: 'Acme' },
        }),
      ],
    });

    expect(result.candidate).toMatchObject({
      company: 'Acme',
      position: 'Senior Engineer',
      sourceHost: 'careers.acme.com',
      stack: ['TypeScript', 'PostgreSQL'],
      url: 'https://careers.acme.com/apply/engineer',
    });
    expect(result.metadata.parsers).toEqual([
      'schema-org-job-posting',
      'generic-metadata',
    ]);
    expect(result.metadata.sourceHost).toBe('careers.acme.com');
    expect(result.metadata.structured).toBe(true);
  });

  it('supports partial generic extraction without guessing a company', () => {
    const result = parseJobPage({
      url: 'https://example.com/jobs/42',
      title: 'Open role',
      headings: ['Product Engineer'],
      pageText: '',
      openGraph: {},
      jsonLdScripts: [],
    });

    expect(result.candidate).toMatchObject({
      company: '',
      position: 'Product Engineer',
      sourceHost: 'example.com',
      url: 'https://example.com/jobs/42',
    });
    expect(result.metadata.structured).toBe(false);
  });

  it('extracts a platform-style title without provider-specific selectors', () => {
    const result = parseJobPage({
      url: 'https://www.examplejobs.test/jobs/view/12345?trk=public_jobs',
      title: 'Platform Engineer | Example Company | ExampleJobs',
      headings: ['About the job'],
      pageText: '',
      openGraph: {},
      jsonLdScripts: [],
    });

    expect(result.candidate).toMatchObject({
      company: 'Example Company',
      position: 'Platform Engineer',
      sourceHost: 'examplejobs.test',
      url: 'https://www.examplejobs.test/jobs/view/12345',
    });
  });

  it('extracts a public job-board metadata and semantic h1 pattern', () => {
    const result = parseJobPage({
      url: 'https://www.examplejobs.test/jobs/view/12345/',
      title:
        'Example Company hiring Platform Engineer in Sample City | ExampleJobs',
      headings: [
        'Platform Engineer',
        'ExampleJobs respects your privacy',
        'Join or sign in to find your next job',
      ],
      pageText: '',
      canonicalUrl:
        'https://regional.examplejobs.test/jobs/view/platform-engineer-at-example-company-12345',
      openGraph: {
        title:
          'Example Company hiring Platform Engineer in Sample City | ExampleJobs',
      },
      jsonLdScripts: [],
    });

    expect(result.candidate).toMatchObject({
      company: 'Example Company',
      position: 'Platform Engineer',
      sourceHost: 'regional.examplejobs.test',
      url: 'https://regional.examplejobs.test/jobs/view/platform-engineer-at-example-company-12345',
    });
  });

  it('recognizes a company-site title when the company matches the hostname', () => {
    const result = parseJobPage({
      url: 'https://careers.acme.com/jobs/42',
      title: 'Product Engineer | Acme',
      headings: [],
      pageText: '',
      openGraph: {},
      jsonLdScripts: [],
    });

    expect(result.candidate).toMatchObject({
      company: 'Acme',
      position: 'Product Engineer',
      sourceHost: 'careers.acme.com',
    });
  });

  it('extracts one embedded vacancy without scanning unrelated careers content', () => {
    const result = parseJobPage({
      url: 'https://examplecompany.test/open-positions',
      title: 'Open positions | Example Company',
      headings: ['Open positions', 'Work with us'],
      subheadings: ['Platform Engineer (React + TypeScript)'],
      pageText:
        'Platform Engineer React TypeScript Node.js Azure PHP Python LLM',
      jobSectionText:
        'Platform Engineer React TypeScript Node.js Express REST PostgreSQL Git',
      openGraph: { siteName: 'Example Company' },
      jsonLdScripts: [],
    });

    expect(result.candidate).toMatchObject({
      company: 'Example Company',
      position: 'Platform Engineer (React + TypeScript)',
      stack: [
        'TypeScript',
        'React',
        'Node.js',
        'Express.js',
        'PostgreSQL',
        'REST',
        'Git',
      ],
    });
    expect(result.candidate.stack).not.toEqual(
      expect.arrayContaining(['Azure', 'PHP', 'Python', 'LLM']),
    );
  });
});
