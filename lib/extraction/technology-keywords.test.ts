import { describe, expect, it } from 'vitest';
import { extractTechnologyKeywords, groupTechnologies } from './technology-keywords';

describe('extractTechnologyKeywords', () => {
  it('extracts, canonicalizes, and prioritizes explicitly mentioned technologies', () => {
    expect(
      extractTechnologyKeywords(
        'Build services with TypeScript, JavaScript, React.js, NodeJS, Postgres and Docker. React experience is required.',
      ),
    ).toEqual(['TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Docker']);
  });

  it('supports common aliases', () => {
    expect(
      extractTechnologyKeywords(
        'Experience with Amazon Web Services, K8s, Golang, and large language models.',
      ),
    ).toEqual(['Go', 'AWS', 'Kubernetes', 'LLM']);
  });

  it('avoids common substring and prose false positives', () => {
    expect(
      extractTechnologyKeywords(
        'You will write JavaScript and react to changing requirements as projects go forward.',
      ),
    ).toEqual(['JavaScript']);
  });

  it('recognizes styling, runtime, monorepo, and testing tools', () => {
    expect(
      extractTechnologyKeywords(
        'The project uses Tailwind CSS, Bun, Turborepo, Vitest, and Playwright.',
      ),
    ).toEqual(['CSS', 'Tailwind CSS', 'Bun', 'Turborepo', 'Vitest', 'Playwright']);
  });
});

describe('groupTechnologies', () => {
  it('groups known technologies and retains custom entries', () => {
    expect(
      groupTechnologies(['TypeScript', 'React', 'Tailwind CSS', 'Custom Tool']),
    ).toEqual([
      { category: 'Languages', technologies: ['TypeScript'] },
      { category: 'Frontend', technologies: ['React'] },
      { category: 'Styling', technologies: ['Tailwind CSS'] },
      { category: 'Other', technologies: ['Custom Tool'] },
    ]);
  });
});
