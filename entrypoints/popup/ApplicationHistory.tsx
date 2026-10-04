import { useEffect, useRef, useState } from 'react';
import {
  applicationTrackerRowUrl,
  matchApplicationHistory,
  type ApplicationHistoryRecord,
} from '@/lib/google-sheets/application-history';
import { loadApplicationHistory, type HistorySnapshot } from '@/lib/google-sheets/history-cache';
import { GoogleAuthorizationRequiredError } from '@/lib/google-sheets/auth';
import {
  extractSpreadsheetId,
  getGoogleSheetsSettings,
  saveGoogleSheetsSettings,
} from '@/lib/google-sheets/settings';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';

const OAUTH_CONFIGURED = Boolean(
  import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID || import.meta.env.WXT_GOOGLE_WEB_OAUTH_CLIENT_ID,
);

interface ApplicationHistoryProps {
  candidate: ApplicationCandidate;
  autoLookupKey: number;
}

function recordSummary(record: ApplicationHistoryRecord): string {
  return [record.dateApplied, record.stage, record.outcome].filter(Boolean).join(' · ');
}

export default function ApplicationHistory({ candidate, autoLookupKey }: ApplicationHistoryProps) {
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>();
  const [snapshot, setSnapshot] = useState<HistorySnapshot>();
  const [status, setStatus] = useState<'unconfigured' | 'loading' | 'success' | 'error' | 'connection-required'>('unconfigured');
  const [errorMessage, setErrorMessage] = useState('');
  const lookupRequest = useRef(0);

  async function lookup(id: string, refresh: boolean) {
    const request = ++lookupRequest.current;
    setSnapshot(undefined);
    if (!OAUTH_CONFIGURED) {
      setStatus('error');
      setErrorMessage('Google OAuth is not configured in this extension build.');
      return;
    }
    setStatus('loading');
    try {
      const result = await loadApplicationHistory(id, refresh);
      if (request !== lookupRequest.current) return;
      setSnapshot(result);
      setStatus('success');
    } catch (error) {
      if (request !== lookupRequest.current) return;
      setStatus(error instanceof GoogleAuthorizationRequiredError ? 'connection-required' : 'error');
      setErrorMessage(error instanceof Error ? error.message : 'Could not read application history.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    void getGoogleSheetsSettings().then((settings) => {
      if (cancelled) return;
      if (!settings) {
        setStatus('unconfigured');
        setSnapshot(undefined);
        setSpreadsheetId(undefined);
        return;
      }
      setSpreadsheetId(settings.spreadsheetId);
      setSpreadsheetInput(settings.spreadsheetId);
      void lookup(settings.spreadsheetId, false);
    });
    return () => {
      cancelled = true;
      lookupRequest.current += 1;
    };
  }, [autoLookupKey]);

  async function saveConnection(event: React.FormEvent) {
    event.preventDefault();
    const id = extractSpreadsheetId(spreadsheetInput);
    if (!id) {
      setErrorMessage('Enter a valid Google Sheets URL or spreadsheet ID.');
      setSnapshot(undefined);
      setStatus('error');
      return;
    }
    await saveGoogleSheetsSettings(id);
    setSpreadsheetId(id);
    setSpreadsheetInput(id);
    await lookup(id, true);
  }

  const hasJob = Boolean(candidate.company || candidate.url);
  const match = snapshot && hasJob ? matchApplicationHistory(snapshot.records, candidate) : undefined;
  const exactRows = new Set(match?.exactJobs.map((record) => record.row));
  const relevant = [...(match?.exactJobs ?? []), ...(match?.probableJobs.filter((record) => !exactRows.has(record.row)) ?? [])];
  const relevantRows = new Set(relevant.map((record) => record.row));
  const otherRecords = match?.companyHistory.filter((record) => !relevantRows.has(record.row)) ?? [];
  const message = status === 'loading' ? 'Checking previous applications…'
    : status === 'unconfigured' ? 'Connect your tracker to check application history.'
    : status !== 'success' ? errorMessage
    : !hasJob ? 'Sheet connected. Open or enter a job to check history.'
    : match?.exactJob ? 'Already applied — same job URL.'
    : match?.probableJob ? 'Possible previous application — same company and normalized title.'
    : otherRecords.length ? `${otherRecords.length} previous application${otherRecords.length === 1 ? '' : 's'} at this company.`
    : 'No match found in the checked application history.';

  function renderRecord(record: ApplicationHistoryRecord, reason?: string) {
    return <div key={record.row} className={reason ? `history-highlight ${exactRows.has(record.row) ? 'exact' : 'probable'}` : undefined}>
      {reason && <small>{reason}</small>}
      <strong>{record.position || 'Unspecified position'}</strong>
      <span>{recordSummary(record)}</span>
      {record.nextAction && <span>Next: {record.nextAction}{record.nextActionDate ? ` · ${record.nextActionDate}` : ''}</span>}
      {spreadsheetId && <a href={applicationTrackerRowUrl(spreadsheetId, record.row)} target="_blank" rel="noreferrer">Open tracker row</a>}
    </div>;
  }

  return <section className="history" aria-labelledby="history-heading">
    <div className="section-heading"><h2 id="history-heading">Application history</h2><span>Read only</span></div>
    <div className={`history-status ${status}`} aria-live="polite">
      <p>{message}</p>
      {spreadsheetId && status !== 'loading' && <button type="button" onClick={() => void lookup(spreadsheetId, true)}>
        {status === 'connection-required' ? 'Reconnect Google Sheets' : 'Check again'}
      </button>}
    </div>
    {snapshot && <p className="history-checked">Last checked {new Date(snapshot.checkedAt).toLocaleTimeString()} · edits recheck these results. Refresh after pasting a new application.</p>}
    {relevant.slice(0, 4).map((record) => renderRecord(record, exactRows.has(record.row) ? 'Same job URL' : 'Same company and normalized title · may be a different vacancy or location'))}
    {relevant.length > 4 && <details className="history-settings"><summary>{relevant.length - 4} more possible matches</summary>
      {relevant.slice(4).map((record) => renderRecord(record, exactRows.has(record.row) ? 'Same job URL' : 'Same company and normalized title'))}
    </details>}
    {otherRecords.length > 0 && <details className="history-settings"><summary>Other applications at this company ({otherRecords.length})</summary>
      <div className="history-list">{otherRecords.map((record) => renderRecord(record))}</div>
    </details>}
    <details className="history-settings" open={!spreadsheetId}>
      <summary>Sheet connection</summary>
      <form onSubmit={saveConnection}>
        <input value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} placeholder="Google Sheets URL or spreadsheet ID" aria-label="Google Sheets URL or spreadsheet ID" />
        <button type="submit">Connect</button>
      </form>
      {!OAUTH_CONFIGURED && <p>Build with <code>WXT_GOOGLE_OAUTH_CLIENT_ID</code> before connecting.</p>}
    </details>
  </section>;
}
