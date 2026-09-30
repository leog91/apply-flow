import { useEffect, useRef, useState } from 'react';
import {
  matchApplicationHistory,
  type ApplicationHistoryMatch,
  type ApplicationHistoryRecord,
} from '@/lib/google-sheets/application-history';
import { readApplicationHistory } from '@/lib/google-sheets/client';
import { GoogleAuthorizationRequiredError } from '@/lib/google-sheets/auth';
import {
  extractSpreadsheetId,
  getGoogleSheetsSettings,
  saveGoogleSheetsSettings,
} from '@/lib/google-sheets/settings';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';

const OAUTH_CONFIGURED = Boolean(
  import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID ||
    import.meta.env.WXT_GOOGLE_WEB_OAUTH_CLIENT_ID,
);

interface ApplicationHistoryProps {
  candidate: ApplicationCandidate;
  autoLookupKey: number;
}

function recordSummary(record: ApplicationHistoryRecord): string {
  return [record.dateApplied, record.stage, record.outcome].filter(Boolean).join(' · ');
}

export default function ApplicationHistory({
  candidate,
  autoLookupKey,
}: ApplicationHistoryProps) {
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>();
  const [match, setMatch] = useState<ApplicationHistoryMatch>();
  const lookupRequest = useRef(0);
  const [status, setStatus] = useState<
    'unconfigured' | 'ready' | 'loading' | 'success' | 'error' | 'connection-required'
  >('unconfigured');
  const [message, setMessage] = useState('Connect your tracker to check application history.');

  async function lookup(id: string, interactive: boolean) {
    const request = ++lookupRequest.current;
    if (!candidate.company && !candidate.url) {
      setStatus('ready');
      setMessage('Sheet connected. Open or enter a job to check history.');
      return;
    }
    if (!OAUTH_CONFIGURED) {
      setStatus('error');
      setMessage('Google OAuth is not configured in this extension build.');
      return;
    }

    setStatus('loading');
    setMessage('Checking previous applications...');
    try {
      const records = await readApplicationHistory(id, interactive);
      if (request !== lookupRequest.current) return;
      const result = matchApplicationHistory(records, candidate);
      setMatch(result);
      setStatus('success');
      if (result.exactJob) {
        setMessage('You already applied to this exact job.');
      } else if (result.probableJob) {
        setMessage('Possible previous application to this position.');
      } else if (result.companyHistory.length > 0) {
        setMessage(
          `${result.companyHistory.length} previous application${result.companyHistory.length === 1 ? '' : 's'} at this company.`,
        );
      } else {
        setMessage('No previous applications found for this company.');
      }
    } catch (error) {
      if (request !== lookupRequest.current) return;
      setMatch(undefined);
      setStatus(error instanceof GoogleAuthorizationRequiredError ? 'connection-required' : 'error');
      setMessage(error instanceof Error ? error.message : 'Could not read application history.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    void getGoogleSheetsSettings().then((settings) => {
      if (cancelled) return;
      if (!settings) {
        setStatus('unconfigured');
        return;
      }
      setSpreadsheetId(settings.spreadsheetId);
      setSpreadsheetInput(settings.spreadsheetId);
      setStatus('ready');
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
      setStatus('error');
      setMessage('Enter a valid Google Sheets URL or spreadsheet ID.');
      return;
    }
    await saveGoogleSheetsSettings(id);
    setSpreadsheetId(id);
    setSpreadsheetInput(id);
    await lookup(id, true);
  }

  const highlightedRecord = match?.exactJob ?? match?.probableJob;
  const otherCompanyRecords = match?.companyHistory.filter(
    (record) => record.row !== highlightedRecord?.row,
  );

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="section-heading">
        <h2 id="history-heading">Application history</h2>
        <span>Read only</span>
      </div>

      <div className={`history-status ${status}`} aria-live="polite">
        <p>{message}</p>
        {spreadsheetId && (candidate.company || candidate.url) && status !== 'loading' && (
          <button type="button" onClick={() => void lookup(spreadsheetId, true)}>
            {status === 'connection-required' ? 'Reconnect Google Sheets' : 'Check again'}
          </button>
        )}
      </div>

      {highlightedRecord && (
        <div className={`history-highlight ${match?.exactJob ? 'exact' : 'probable'}`}>
          <strong>{highlightedRecord.position || 'Previous application'}</strong>
          <span>{recordSummary(highlightedRecord)}</span>
          {highlightedRecord.nextAction && (
            <span>
              Next: {highlightedRecord.nextAction}
              {highlightedRecord.nextActionDate
                ? ` · ${highlightedRecord.nextActionDate}`
                : ''}
            </span>
          )}
        </div>
      )}

      {otherCompanyRecords && otherCompanyRecords.length > 0 && (
        <div className="history-list">
          {otherCompanyRecords.slice(0, 4).map((record) => (
            <div key={record.row}>
              <strong>{record.position || 'Unspecified position'}</strong>
              <span>{recordSummary(record)}</span>
            </div>
          ))}
        </div>
      )}

      <details className="history-settings" open={!spreadsheetId}>
        <summary>Sheet connection</summary>
        <form onSubmit={saveConnection}>
          <input
            value={spreadsheetInput}
            onChange={(event) => setSpreadsheetInput(event.target.value)}
            placeholder="Google Sheets URL or spreadsheet ID"
            aria-label="Google Sheets URL or spreadsheet ID"
          />
          <button type="submit">Connect</button>
        </form>
        {!OAUTH_CONFIGURED && (
          <p>
            Build with <code>WXT_GOOGLE_OAUTH_CLIENT_ID</code> before connecting.
          </p>
        )}
      </details>
    </section>
  );
}
