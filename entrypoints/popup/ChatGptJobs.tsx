import { useEffect, useRef, useState } from 'react';
import {
  appendJobInboxJobs,
  createJobInboxSheet,
  JobInboxSheetMissingError,
  readJobInboxSyncSnapshot,
  rewriteJobInboxSheet,
} from '@/lib/google-sheets/client';
import {
  extractSpreadsheetId,
  getGoogleSheetsSettings,
  saveGoogleSheetsSettings,
} from '@/lib/google-sheets/settings';
import { getJobInboxState } from '@/lib/job-inbox/state';
import { planJobInboxSync } from '@/lib/job-inbox/sheet';
import type { JobInboxLocalState } from '@/lib/job-inbox/types';
import {
  getChatGptCaptureSettings,
  setChatGptCaptureEnabled,
} from '@/lib/chatgpt/settings';

const GET_SCAN_MESSAGE = 'apply-flow:get-chatgpt-scan';
const SET_CAPTURE_MESSAGE = 'apply-flow:set-chatgpt-capture';
const OAUTH_CONFIGURED = Boolean(
  import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID ||
    import.meta.env.WXT_GOOGLE_WEB_OAUTH_CLIENT_ID,
);

function cleanPageUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

export default function ChatGptJobs() {
  const [state, setState] = useState<JobInboxLocalState>({ jobs: [], messages: [] });
  const [pageUrl, setPageUrl] = useState('');
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'syncing' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Reading rendered ChatGPT messages...');
  const [captureEnabled, setCaptureEnabledState] = useState(false);
  const syncInFlight = useRef(false);

  async function scan() {
    setStatus('loading');
    setMessage('Reading rendered ChatGPT messages...');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) throw new Error('The active ChatGPT tab is unavailable.');
      const currentPageUrl = cleanPageUrl(tab.url);
      setPageUrl(currentPageUrl);
      const result = await browser.tabs.sendMessage(tab.id, { type: GET_SCAN_MESSAGE }) as {
        enabled: boolean;
        state: JobInboxLocalState;
      };
      setState(result.state);
      setCaptureEnabledState(result.enabled);
      setStatus('ready');
      setMessage(
        result.enabled
          ? 'Rendered assistant messages have been scanned locally.'
          : 'ChatGPT capture is off. No message content is being scanned.',
      );
    } catch {
      const [localState, settings] = await Promise.all([
        browser.runtime.sendMessage({ type: 'apply-flow:get-job-inbox-state' }) as Promise<JobInboxLocalState>,
        getChatGptCaptureSettings(),
      ]);
      setState(localState);
      setCaptureEnabledState(settings.enabled);
      setStatus('error');
      setMessage('Reload this ChatGPT tab once so Apply Flow can observe rendered messages.');
    }
  }

  useEffect(() => {
    void Promise.all([scan(), getGoogleSheetsSettings()]).then(([, settings]) => {
      if (!settings) return;
      setSpreadsheetId(settings.spreadsheetId);
      setSpreadsheetInput(settings.spreadsheetId);
    });
  }, []);

  async function changeCaptureEnabled(enabled: boolean) {
    setCaptureEnabledState(enabled);
    await setChatGptCaptureEnabled(enabled);
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('The active ChatGPT tab is unavailable.');
      const result = await browser.tabs.sendMessage(tab.id, {
        type: SET_CAPTURE_MESSAGE,
        enabled,
      }) as { state: JobInboxLocalState };
      setState(result.state);
      setStatus('ready');
      setMessage(
        enabled
          ? 'Capture is on. Only rendered assistant messages are scanned.'
          : 'Capture is off. The ChatGPT page is no longer being scanned.',
      );
    } catch {
      setStatus('error');
      setMessage('Reload this ChatGPT tab to apply the capture setting.');
    }
  }

  async function sync(id: string) {
    if (syncInFlight.current) return;
    if (!OAUTH_CONFIGURED) {
      setStatus('error');
      setMessage('Google OAuth is not configured in this extension build.');
      return;
    }
    syncInFlight.current = true;
    setStatus('syncing');
    setMessage('Reconciling the local queue with Google Sheets...');
    try {
      let snapshot;
      try {
        snapshot = await readJobInboxSyncSnapshot(id, true);
      } catch (error) {
        if (!(error instanceof JobInboxSheetMissingError)) throw error;
        await createJobInboxSheet(id);
        snapshot = await readJobInboxSyncSnapshot(id, true);
      }

      const localState = await getJobInboxState();
      if (snapshot.inboxNeedsMigration) {
        const localById = new Map(localState.jobs.map((job) => [job.id, job]));
        const referencedIds = new Set(
          localState.messages.flatMap((sourceMessage) => sourceMessage.jobIds),
        );
        snapshot.inboxJobs = snapshot.inboxJobs.flatMap((remoteJob) => {
          const localJob = localById.get(remoteJob.id);
          if (localJob && !referencedIds.has(remoteJob.id) && remoteJob.status === 'new') {
            return [];
          }
          return [{
            ...(localJob ?? remoteJob),
            status: remoteJob.status,
            syncedAt: remoteJob.syncedAt,
            applicationRef: remoteJob.applicationRef,
            notes: remoteJob.notes,
          }];
        });
        await rewriteJobInboxSheet(id, snapshot.inboxJobs);
      }

      const plan = planJobInboxSync(
        localState,
        snapshot.inboxJobs,
        snapshot.applications,
        new Date().toISOString(),
      );
      await appendJobInboxJobs(id, plan.appendJobs);
      const reconciled = await browser.runtime.sendMessage({
        type: 'apply-flow:reconcile-job-inbox',
        updates: [...plan.reconciledJobs.entries()],
      }) as JobInboxLocalState;
      setState(reconciled);
      setStatus('success');
      setMessage(
        `${plan.appendJobs.length} synced, ${plan.alreadyKnown} already known, ${plan.previouslyApplied} previously applied.`,
      );
    } catch (error) {
      setStatus('error');
      setMessage(
        `${error instanceof Error ? error.message : 'Could not sync the Job Inbox.'} Pending jobs remain stored locally.`,
      );
    } finally {
      syncInFlight.current = false;
    }
  }

  async function connectAndSync(event: React.FormEvent) {
    event.preventDefault();
    if (syncInFlight.current) return;
    const id = extractSpreadsheetId(spreadsheetInput);
    if (!id) {
      setStatus('error');
      setMessage('Enter a valid Google Sheets URL or spreadsheet ID.');
      return;
    }
    await saveGoogleSheetsSettings(id);
    setSpreadsheetId(id);
    setSpreadsheetInput(id);
    await sync(id);
  }

  const currentMessages = state.messages.filter(
    (item) => item.sourceMessage.conversationUrl === pageUrl,
  );
  const currentIds = new Set(currentMessages.flatMap((item) => item.jobIds));
  const currentJobs = state.jobs.filter((job) => currentIds.has(job.id));
  const pendingJobs = state.jobs.filter((job) => !job.syncedAt);
  const currentKnown = currentJobs.filter((job) => job.syncedAt && job.status !== 'applied').length;
  const currentApplied = currentJobs.filter((job) => job.status === 'applied').length;

  return (
    <section className="chatgpt-jobs" aria-labelledby="chatgpt-jobs-heading">
      <div className="section-heading">
        <h2 id="chatgpt-jobs-heading">Rendered job results</h2>
        <span>{currentMessages.length} source messages</span>
      </div>

      <label className="capture-toggle">
        <span>
          <strong>Capture rendered jobs</strong>
          <small>{captureEnabled ? 'On · observer active' : 'Off · page not scanned'}</small>
        </span>
        <input
          type="checkbox"
          checked={captureEnabled}
          onChange={(event) => void changeCaptureEnabled(event.target.checked)}
        />
      </label>

      <div className="inbox-counts">
        <div><strong>{currentJobs.length}</strong><span>detected here</span></div>
        <div><strong>{currentKnown}</strong><span>already known</span></div>
        <div><strong>{currentApplied}</strong><span>applied</span></div>
        <div><strong>{pendingJobs.length}</strong><span>pending sync</span></div>
      </div>

      <p className={`history-status ${status === 'syncing' || status === 'loading' ? 'loading' : status}`} aria-live="polite">
        <span>{message}</span>
      </p>

      {currentJobs.length > 0 ? (
        <div className="inbox-jobs">
          {currentJobs.slice(0, 10).map((job) => (
            <div key={job.id}>
              <strong>{job.position || 'Position not identified'}</strong>
              <span>{[job.company, job.location].filter(Boolean).join(' · ') || 'Details unavailable'}</span>
              <small>{job.syncedAt ? job.status : 'new · local'}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-technologies">No reliable job links were found in the rendered assistant messages.</p>
      )}

      <p className="render-limit">
        Apply Flow can only capture messages ChatGPT has rendered. Scroll through the conversation, then reopen the popup to see older results.
      </p>

      <div className="inbox-actions">
        <button type="button" onClick={() => void scan()} disabled={!captureEnabled || status === 'loading' || status === 'syncing'}>
          Rescan rendered
        </button>
        <button
          type="button"
          onClick={() => spreadsheetId && void sync(spreadsheetId)}
          disabled={!spreadsheetId || pendingJobs.length === 0 || status === 'syncing'}
        >
          {status === 'syncing' ? 'Syncing...' : 'Sync pending jobs'}
        </button>
      </div>

      <details className="history-settings" open={!spreadsheetId}>
        <summary>Sheet connection</summary>
        <form onSubmit={connectAndSync}>
          <input
            value={spreadsheetInput}
            onChange={(event) => setSpreadsheetInput(event.target.value)}
            placeholder="Google Sheets URL or spreadsheet ID"
            aria-label="Google Sheets URL or spreadsheet ID"
            disabled={status === 'syncing'}
          />
          <button type="submit" disabled={status === 'syncing'}>Connect & sync</button>
        </form>
        {!OAUTH_CONFIGURED && <p>Build with the Google OAuth client IDs before syncing.</p>}
      </details>
    </section>
  );
}
