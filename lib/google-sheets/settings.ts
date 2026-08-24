import { z } from 'zod';

const STORAGE_KEY = 'googleSheetsSettings';

const GoogleSheetsSettingsSchema = z.object({
  spreadsheetId: z.string().trim().min(1),
});

export type GoogleSheetsSettings = z.infer<typeof GoogleSheetsSettingsSchema>;

export function extractSpreadsheetId(value: string): string | undefined {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = urlMatch?.[1] ?? trimmed;
  return /^[a-zA-Z0-9-_]+$/.test(id) ? id : undefined;
}

export async function getGoogleSheetsSettings(): Promise<GoogleSheetsSettings | undefined> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const result = GoogleSheetsSettingsSchema.safeParse(stored[STORAGE_KEY]);
  return result.success ? result.data : undefined;
}

export async function saveGoogleSheetsSettings(spreadsheetId: string): Promise<void> {
  const settings = GoogleSheetsSettingsSchema.parse({ spreadsheetId });
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}
