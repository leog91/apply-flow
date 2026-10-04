import { describe, expect, it } from 'vitest';
import { extractTechnologyKeywords, groupTechnologies } from './technology-keywords';

describe('extractTechnologyKeywords', () => {
  it('recognizes frontend/full-stack and product-tool aliases', () => {
    expect(extractTechnologyKeywords('react.js, next-js, node js, React Query, @radix-ui/react-dialog, MUI, shadcn/ui, tRPC, Drizzle ORM, pnpm, Mock Service Worker, PostHog')).toEqual([
      'Next.js', 'React', 'Node.js', 'TanStack Query', 'Material UI', 'Radix UI', 'shadcn/ui', 'tRPC', 'Drizzle', 'pnpm', 'MSW', 'PostHog',
    ]);
  });

  it('recognizes .NET beside punctuation and expanded delivery wording', () => {
    expect(extractTechnologyKeywords('C#/.NET; continuous integration and continuous deployment')).toEqual(['C#', '.NET', 'CI/CD']);
  });

  it('does not treat ordinary lowercase product prose as tools or short language aliases', () => {
    expect(extractTechnologyKeywords('We react to feedback, express emotion, remix ideas and rollup reports. Enjoy chai, mocha and yarn. TS and JS are initials.')).toEqual([]);
  });

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
  it('categorizes every newly added catalog entry instead of falling through to Other', () => {
    const names = extractTechnologyKeywords('Redux Toolkit Zustand TanStack Query React Router Astro Nuxt Remix Storybook Material UI styled-components Emotion Radix UI shadcn/ui tRPC Drizzle TypeORM Sequelize SQLite Supabase Firebase npm pnpm Yarn Rollup esbuild Testing Library MSW Mocha Chai PostHog Amplitude Mixpanel');
    expect(groupTechnologies(names).some((group) => group.category === 'Other')).toBe(false);
    expect(names).toHaveLength(34);
  });

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
