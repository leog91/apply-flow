import { z } from 'zod';
import type { ApplicationHistoryRecord } from './application-history';
import { getGoogleAuthToken, invalidateGoogleAuthToken } from './auth';
import {
  JOB_INBOX_HEADERS,
  JOB_INBOX_RANGE,
  JOB_INBOX_SHEET_NAME,
  jobInboxRows,
  jobInboxRewriteRows,
  parseJobInboxSheet,
} from '@/lib/job-inbox/sheet';
import type { DiscoveredJob } from '@/lib/job-inbox/types';

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

function parseApplicationHistoryRanges(
  valueRanges: z.infer<typeof SheetsBatchResponseSchema>['valueRanges'],
): ApplicationHistoryRecord[] {
  if (valueRanges.length < 3) {
    throw new Error('Google Sheets returned an unexpected response.');
  }

  const identityRows = valueRanges[0]?.values ?? [];
  const urlRows = valueRanges[1]?.values ?? [];
  const statusRows = valueRanges[2]?.values ?? [];
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

export function parseApplicationHistoryResponse(
  response: unknown,
): ApplicationHistoryRecord[] {
  const parsed = SheetsBatchResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new Error('Google Sheets returned an unexpected response.');
  }
  return parseApplicationHistoryRanges(parsed.data.valueRanges);
}

export interface JobInboxSyncSnapshot {
  applications: ApplicationHistoryRecord[];
  inboxJobs: DiscoveredJob[];
  inboxNeedsMigration: boolean;
  inboxSourceRowCount: number;
}

export function parseJobInboxSyncResponse(response: unknown): JobInboxSyncSnapshot {
  const parsed = SheetsBatchResponseSchema.safeParse(response);
  if (!parsed.success || parsed.data.valueRanges.length < 4) {
    throw new Error('Google Sheets returned an unexpected response.');
  }
  const inbox = parseJobInboxSheet(parsed.data.valueRanges[3]?.values);
  return {
    applications: parseApplicationHistoryRanges(parsed.data.valueRanges.slice(0, 3)),
    inboxJobs: inbox.jobs,
    inboxNeedsMigration: inbox.needsMigration,
    inboxSourceRowCount: inbox.sourceRowCount,
  };
}

export class JobInboxSheetMissingError extends Error {}

async function fetchSheetsRead(url: string, interactive: boolean): Promise<Response> {
  let token = await getGoogleAuthToken(interactive);
  let response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    await invalidateGoogleAuthToken(token);
    token = await getGoogleAuthToken(interactive);
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!response.ok) await throwSheetsError(response, token, 'read');
  return response;
}

async function throwSheetsError(
  response: Response,
  token: string,
  action: 'read' | 'write',
): Promise<never> {
  if (response.status === 401) await invalidateGoogleAuthToken(token);
  const body = await response.json().catch(() => undefined) as
    | { error?: { message?: string } }
    | undefined;
  const detail = body?.error?.message ?? '';
  if (response.status === 400 && detail.includes(JOB_INBOX_SHEET_NAME)) {
    throw new JobInboxSheetMissingError(`The ${JOB_INBOX_SHEET_NAME} tab does not exist.`);
  }
  if (response.status === 403) {
    throw new Error(
      action === 'write'
        ? 'Google denied edit access to this spreadsheet.'
        : 'Google denied access to this spreadsheet.',
    );
  }
  throw new Error(`Google Sheets ${action} failed (${response.status}).`);
}

export async function readApplicationHistory(
  spreadsheetId: string,
  interactive = false,
): Promise<ApplicationHistoryRecord[]> {
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const range of ['Applications!A:C', 'Applications!H:H', 'Applications!L:O']) {
    query.append('ranges', range);
  }

  const response = await fetchSheetsRead(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
    interactive,
  );

  return parseApplicationHistoryResponse(await response.json());
}

export async function readJobInboxSyncSnapshot(
  spreadsheetId: string,
  interactive = false,
): Promise<JobInboxSyncSnapshot> {
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const range of [
    'Applications!A:C',
    'Applications!H:H',
    'Applications!L:O',
    JOB_INBOX_RANGE,
  ]) {
    query.append('ranges', range);
  }
  const response = await fetchSheetsRead(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
    interactive,
  );
  return parseJobInboxSyncResponse(await response.json());
}

export async function createJobInboxSheet(
  spreadsheetId: string,
): Promise<void> {
  const token = await getGoogleAuthToken(true);
  const sheetId = crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                sheetId,
                title: JOB_INBOX_SHEET_NAME,
                gridProperties: { rowCount: 1000, columnCount: JOB_INBOX_HEADERS.length },
              },
            },
          },
          {
            updateCells: {
              start: { sheetId, rowIndex: 0, columnIndex: 0 },
              rows: [{
                values: JOB_INBOX_HEADERS.map((value) => ({
                  userEnteredValue: { stringValue: value },
                })),
              }],
              fields: 'userEnteredValue',
            },
          },
        ],
      }),
    },
  );
  if (!response.ok) await throwSheetsError(response, token, 'write');
}

const AppendResponseSchema = z.object({
  updates: z.object({ updatedRows: z.number().int().nonnegative() }),
});

export async function appendJobInboxJobs(
  spreadsheetId: string,
  jobs: DiscoveredJob[],
): Promise<void> {
  if (jobs.length === 0) return;
  const token = await getGoogleAuthToken(true);
  const query = new URLSearchParams({
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
  });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(JOB_INBOX_RANGE)}:append?${query}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ majorDimension: 'ROWS', values: jobInboxRows(jobs) }),
    },
  );
  if (!response.ok) await throwSheetsError(response, token, 'write');
  const parsed = AppendResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.updates.updatedRows !== jobs.length) {
    throw new Error('Google Sheets did not confirm the complete inbox batch.');
  }
}

export async function rewriteJobInboxSheet(
  spreadsheetId: string,
  jobs: DiscoveredJob[],
  sourceRowCount = jobs.length,
): Promise<void> {
  const token = await getGoogleAuthToken(true);
  const query = new URLSearchParams({ valueInputOption: 'RAW' });
  const values = jobInboxRewriteRows(jobs, sourceRowCount);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(JOB_INBOX_RANGE)}?${query}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values,
      }),
    },
  );
  if (!response.ok) await throwSheetsError(response, token, 'write');
}
