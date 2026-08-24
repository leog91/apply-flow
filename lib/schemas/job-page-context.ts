import { z } from 'zod';

export const JobPageContextSchema = z.object({
  url: z.url(),
  title: z.string(),
  headings: z.array(z.string()),
  headingContext: z.string().optional(),
  subheadings: z.array(z.string()).optional(),
  pageText: z.string(),
  bodyText: z.string().optional(),
  jobSectionText: z.string().optional(),
  jobDescriptionText: z.string().optional(),
  selectedJobUrl: z.string().optional(),
  canonicalUrl: z.string().optional(),
  openGraph: z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    siteName: z.string().optional(),
  }),
  jsonLdScripts: z.array(z.string()),
});

export type JobPageContext = z.infer<typeof JobPageContextSchema>;
