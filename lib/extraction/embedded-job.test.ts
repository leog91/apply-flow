import { describe, expect, it } from 'vitest';
import { parseGreenhouseJobResponse } from './embedded-job';

describe('parseGreenhouseJobResponse', () => {
  it('normalizes structured embedded-job content', () => {
    expect(
      parseGreenhouseJobResponse(
        {
          absolute_url: 'https://careers.synthetic.test/job?job_id=42',
          company_name: 'SYNTHETIC LABS',
          content:
            '&lt;p&gt;&lt;strong&gt;Location:&lt;/strong&gt; Example City, Spain — &lt;strong&gt;Hybrid&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;Build with React and TypeScript.&lt;/p&gt;',
          location: { name: 'Spain' },
          title: ' Platform Engineer ',
        },
        'Synthetic Labs',
      ),
    ).toEqual({
      company: 'Synthetic Labs',
      position: 'Platform Engineer',
      location: 'Example City, Spain',
      url: 'https://careers.synthetic.test/job?job_id=42',
      description:
        'Location: Example City, Spain — Hybrid\nBuild with React and TypeScript.',
    });
  });

  it('rejects malformed responses', () => {
    expect(parseGreenhouseJobResponse({ title: 'Incomplete' })).toBeUndefined();
  });
});
