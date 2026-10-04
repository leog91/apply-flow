import { readApplicationHistory } from './client';
import type { ApplicationHistoryRecord } from './application-history';

export interface HistorySnapshot {
  records: ApplicationHistoryRecord[];
  checkedAt: number;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, HistorySnapshot>();
const pending = new Map<string, { refresh: boolean; promise: Promise<HistorySnapshot> }>();

export function loadApplicationHistory(
  spreadsheetId: string,
  refresh = false,
): Promise<HistorySnapshot> {
  const cached = cache.get(spreadsheetId);
  if (!refresh && cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return Promise.resolve(cached);
  }
  const inFlight = pending.get(spreadsheetId);
  if (inFlight) {
    if (refresh && !inFlight.refresh) {
      // A manual refresh must not reuse a read started before a Sheets paste.
      return inFlight.promise.catch(() => undefined).then(() => loadApplicationHistory(spreadsheetId, true));
    }
    return inFlight.promise;
  }
  if (refresh) cache.delete(spreadsheetId);
  const request = readApplicationHistory(spreadsheetId, refresh).then((records) => {
    const snapshot = { records, checkedAt: Date.now() };
    cache.set(spreadsheetId, snapshot);
    return snapshot;
  }).finally(() => pending.delete(spreadsheetId));
  pending.set(spreadsheetId, { refresh, promise: request });
  return request;
}
