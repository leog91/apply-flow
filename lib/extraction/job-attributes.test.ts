import { describe, expect, it } from 'vitest';
import {
  extractDescriptionSection,
  inferLocation,
  inferWorkMode,
  extractRemoteEligibility,
} from './job-attributes';

describe('extractDescriptionSection', () => {
  it('isolates visible description text before related jobs', () => {
    expect(
      extractDescriptionSection(
        'Page header\nAbout the job\nTypeScript and Angular are required.\nAbout the company\nMongoDB partner\nSimilar jobs\nPython role',
      ),
    ).toBe('TypeScript and Angular are required.');
  });
});

describe('inferWorkMode', () => {
  it('recognizes common English and Spanish work arrangements', () => {
    expect(inferWorkMode('Sample City · Hybrid')).toBe('Hybrid');
    expect(inferWorkMode('Trabajo remoto desde cualquier lugar')).toBe('Remote');
    expect(inferWorkMode('Puesto presencial')).toBe('On-site');
  });
});

describe('extractRemoteEligibility', () => {
  it('keeps an explicit restriction as source text, including negation', () => {
    expect(extractRemoteEligibility('Build React apps. Remote within the Netherlands only. Benefits included.')).toBe('Remote within the Netherlands only');
    expect(extractRemoteEligibility('You must be based in Spain to work remotely.')).toBe('You must be based in Spain to work remotely');
    expect(extractRemoteEligibility('Not remote from outside Denmark.')).toBe('Not remote from outside Denmark');
  });

  it('does not infer remote eligibility from office or marketing text', () => {
    expect(extractRemoteEligibility('Remote-first company. Our office is in Amsterdam.')).toBeUndefined();
  });
});

describe('inferLocation', () => {
  it('extracts a location near the semantic job heading', () => {
    expect(
      inferLocation(
        'Platform Engineer\nExample Company\nSample City, Sample Region · Hybrid\n2 days ago',
        'Platform Engineer',
        'Example Company',
        'Platform Engineer | Example Company | ExampleJobs',
      ),
    ).toBe('Sample City, Sample Region');
  });

  it('extracts a location from a hiring metadata title', () => {
    expect(
      inferLocation(
        undefined,
        'Platform Engineer',
        'Example Company',
        'Example Company hiring Platform Engineer in Sample City, Sample Region | ExampleJobs',
      ),
    ).toBe('Sample City, Sample Region');
  });

  it('does not mistake an on-site requirement sentence for a location', () => {
    expect(
      inferLocation(
        'Availability for on-site work\nSample City · On-site',
        'Platform Engineer',
        'Example Company',
        'Open position | Example Company',
      ),
    ).toBe('Sample City');
  });

  it('finds location in a position-company-location side-view sequence', () => {
    expect(
      inferLocation(
        'Other content\nPlatform Engineer\nExample Company\nSample City, Sample Region · 1 week ago · 20 applicants',
        'Platform Engineer',
        'Example Company',
        'Job search',
      ),
    ).toBe('Sample City, Sample Region');
  });

  it('finds location when the company appears before the position', () => {
    expect(
      inferLocation(
        'Example Company\nPlatform Engineer\nSample City, Sample Region · 1 week ago',
        'Platform Engineer',
        'Example Company',
        'Job search',
      ),
    ).toBe('Sample City, Sample Region');
  });
});
