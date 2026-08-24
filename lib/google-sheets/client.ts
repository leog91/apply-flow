import { z } from 'zod';
import type { ApplicationHistoryRecord } from './application-history';
import { getGoogleAuthToken, invalidateGoogleAuthToken } from './auth';

const SheetsBatchResponseSchema = z.object({
  valueRanges: z.array(
    z.object({
      values: z.array(z.array(z.unknown())).optional(),
    }),
  ),
});

function cell(row: unknown[] | undefined, index: number): string {
  const value = row?.[index];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

export function parseApplicationHistoryResponse(
  response: unknown,
): ApplicationHistoryRecord[] {
  const parsed = SheetsBatchResponseSchema.safeParse(response);
  if (!parsed.success || parsed.data.valueRanges.length < 3) {
    throw new Error('Google Sheets returned an unexpected response.');
  }

  const identityRows = parsed.data.valueRanges[0]?.values ?? [];
  const urlRows = parsed.data.valueRanges[1]?.values ?? [];
  const statusRows = parsed.data.valueRanges[2]?.values ?? [];
  const rowCount = Math.max(identityRows.length, urlRows.length, statusRows.length);
  const records: ApplicationHistoryRecord[] = [];

  for (let index = 1; index < rowCount; index += 1) {
    const identity = identityRows[index];
    const company = cell(identity, 1);
    if (!company) continue;
    const status = statusRows[index];
    records.push({
      row: index + 1,
      dateApplied: cell(identity, 0),
      company,
      position: cell(identity, 2),
      url: cell(urlRows[index], 0),
      stage: cell(status, 0),
      outcome: cell(status, 1),
      nextAction: cell(status, 2),
      nextActionDate: cell(status, 3),
    });
  }

  return records;
}

export async function readApplicationHistory(
  spreadsheetId: string,
  interactive = false,
): Promise<ApplicationHistoryRecord[]> {
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const range of ['Applications!A:C', 'Applications!H:H', 'Applications!L:O']) {
    query.append('ranges', range);
  }

  const token = await getGoogleAuthToken(interactive);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    if (response.status === 401) {
      await invalidateGoogleAuthToken(token);
    }
    throw new Error(
      response.status === 403
        ? 'Google denied read access to this spreadsheet.'
        : `Google Sheets request failed (${response.status}).`,
    );
  }

  return parseApplicationHistoryResponse(await response.json());
}
