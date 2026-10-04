import { useEffect, useRef, useState } from 'react';
import { extractFromActiveTab } from '@/lib/extraction/inspect-active-tab';
import { groupTechnologies } from '@/lib/extraction/technology-keywords';
import { preserveDraftEdits, sameJobListing, type EditableField } from '@/lib/extraction/application-draft';
import { buildApplicationClipboardRow } from '@/lib/google-sheets/clipboard-row';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';
import type { ExtractionMetadata } from '@/lib/parsers/types';
import {
  APPLY_FLOW_SETTINGS_STORAGE_KEY,
  getApplyFlowSettings,
  saveApplyFlowSettings,
  type ApplyFlowSettings,
} from '@/lib/settings';
import ApplicationHistory from './ApplicationHistory';
import ChatGptJobs from './ChatGptJobs';
import './App.css';

const EMPTY_CANDIDATE: ApplicationCandidate = {
  company: '',
  position: '',
  url: '',
};

interface AppProps {
  surface?: 'popup' | 'sidepanel';
}

function App({ surface = 'popup' }: AppProps) {
  const [view, setView] = useState<'loading' | 'application' | 'chatgpt'>('loading');
  const [settings, setSettings] = useState<ApplyFlowSettings>();
  const [candidate, setCandidate] = useState(EMPTY_CANDIDATE);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [newTechnology, setNewTechnology] = useState('');
  const [metadata, setMetadata] = useState<ExtractionMetadata>();
  const [message, setMessage] = useState('Inspecting the current page...');
  const [statusKind, setStatusKind] = useState<'loading' | 'success' | 'neutral' | 'error'>('loading');
  const [loading, setLoading] = useState(true);
  const [historyLookupKey, setHistoryLookupKey] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const detectionRequest = useRef(0);
  const lastDetected = useRef(EMPTY_CANDIDATE);
  const editedFields = useRef(new Set<EditableField>());
  const editedTechnologies = useRef(false);

  async function detect() {
    const request = ++detectionRequest.current;
    setLoading(true);
    setStatusKind('loading');
    setMessage('Inspecting the current page...');
    const extraction = await extractFromActiveTab();
    if (request !== detectionRequest.current) return;

    if (extraction.status === 'success') {
      const detected = extraction.result.candidate;
      const sameJob = sameJobListing(lastDetected.current, detected);
      if (!sameJob) {
        editedFields.current.clear();
        editedTechnologies.current = false;
        setNewTechnology('');
        setCopyStatus('idle');
      }
      const edits = new Set(editedFields.current);
      setCandidate((current) => sameJob ? preserveDraftEdits(current, detected, edits) : detected);
      if (!sameJob || !editedTechnologies.current) setTechnologies(detected.stack ?? []);
      lastDetected.current = detected;
      setMetadata(extraction.result.metadata);
      const detailsDetected = Boolean(
        extraction.result.candidate.company || extraction.result.candidate.position,
      );
      setMessage(
        extraction.result.metadata.structured
          ? 'Job details detected from structured metadata.'
          : detailsDetected
            ? 'Job details detected from page content.'
            : 'No job listing detected. You can enter the details manually.',
      );
      setStatusKind(detailsDetected ? 'success' : 'neutral');
      setHistoryLookupKey((current) => current + 1);
    } else {
      setCandidate(EMPTY_CANDIDATE);
      setTechnologies([]);
      lastDetected.current = EMPTY_CANDIDATE;
      editedFields.current.clear();
      editedTechnologies.current = false;
      setCopyStatus('idle');
      setMetadata(undefined);
      setMessage(extraction.message);
      setStatusKind(extraction.status === 'error' ? 'error' : 'neutral');
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    const handleSettingsChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes[APPLY_FLOW_SETTINGS_STORAGE_KEY]) return;
      void getApplyFlowSettings().then((next) => {
        if (!cancelled) setSettings(next);
      });
    };

    void getApplyFlowSettings().then((initial) => {
      if (!cancelled) setSettings(initial);
    });
    browser.storage.onChanged.addListener(handleSettingsChange);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    const enabled = settings.enabled;
    let cancelled = false;
    let inspectionTimer: ReturnType<typeof setTimeout> | undefined;

    async function inspectActiveTab() {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (cancelled) return;
        if (tab?.url && new URL(tab.url).hostname === 'chatgpt.com') {
          detectionRequest.current += 1;
          setLoading(false);
          setCopyStatus('idle');
          setView('chatgpt');
          return;
        }
        setView('application');
        if (enabled) {
          await detect();
        } else {
          detectionRequest.current += 1;
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        setView('application');
        if (enabled) await detect();
      }
    }

    if (surface !== 'sidepanel') {
      void inspectActiveTab();
      return () => {
        cancelled = true;
        detectionRequest.current += 1;
      };
    }

    function scheduleInspection() {
      if (inspectionTimer) clearTimeout(inspectionTimer);
      detectionRequest.current += 1;
      setLoading(true);
      setStatusKind('loading');
      setMessage('Waiting for the current page to finish loading...');
      inspectionTimer = setTimeout(() => void inspectActiveTab(), 900);
    }

    scheduleInspection();
    const handleActivated = scheduleInspection;
    const handleUpdated = (
      _tabId: number,
      changeInfo: Browser.tabs.OnUpdatedInfo,
      tab: Browser.tabs.Tab,
    ) => {
      if (
        tab.active &&
        (changeInfo.url || changeInfo.title || changeInfo.status === 'complete')
      ) scheduleInspection();
    };
    browser.tabs.onActivated.addListener(handleActivated);
    browser.tabs.onUpdated.addListener(handleUpdated);
    return () => {
      cancelled = true;
      if (inspectionTimer) clearTimeout(inspectionTimer);
      detectionRequest.current += 1;
      browser.tabs.onActivated.removeListener(handleActivated);
      browser.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, [settings?.enabled, surface]);

  async function updateSettings(update: Partial<ApplyFlowSettings>) {
    if (!settings) return;
    const next = { ...settings, ...update };
    setSettings(next);
    await saveApplyFlowSettings(next);
  }

  if (!settings) {
    return <main><p className="status loading">Loading Apply Flow settings...</p></main>;
  }

  const settingsControls = (
    <details className="extension-settings" open>
      <summary>Apply Flow settings</summary>
      <label className="settings-toggle">
        <span>
          <strong>Apply Flow enabled</strong>
          <small>{settings.enabled ? 'On · detection and tracking active' : 'Paused · no pages are inspected'}</small>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => void updateSettings({ enabled: event.target.checked })}
        />
      </label>
      <label className="settings-toggle">
        <span>
          <strong>Use side panel</strong>
          <small>
            {settings.sidePanelEnabled
              ? 'Available on LinkedIn and ChatGPT'
              : 'Extension icon opens the popup'}
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.sidePanelEnabled}
          onChange={(event) => void updateSettings({ sidePanelEnabled: event.target.checked })}
        />
      </label>
      <label className="settings-toggle">
        <span>
          <strong>Open on all websites</strong>
          <small>
            {settings.sidePanelAllSites
              ? 'Panel stays available while browsing other sites'
              : 'Off · limited to LinkedIn and ChatGPT'}
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.sidePanelAllSites}
          disabled={!settings.sidePanelEnabled}
          onChange={(event) => void updateSettings({ sidePanelAllSites: event.target.checked })}
        />
      </label>
    </details>
  );

  if (!settings.enabled) {
    return (
      <main>
        <header className="header">
          <div>
            <p className="eyebrow">Apply Flow</p>
            <h1>Paused</h1>
          </div>
        </header>
        {settingsControls}
        <p className="paused-message">
          Page inspection, application-history checks, ChatGPT capture, and synchronization are paused. Existing data is unchanged.
        </p>
      </main>
    );
  }

  if (view === 'chatgpt') {
    return (
      <main>
        <header className="header">
          <div>
            <p className="eyebrow">Apply Flow</p>
            <h1>ChatGPT Job Inbox</h1>
          </div>
        </header>
        {settingsControls}
        <ChatGptJobs />
      </main>
    );
  }

  if (view === 'loading') {
    return <main><p className="status loading">Inspecting the current tab...</p></main>;
  }

  function updateField(field: 'company' | 'position' | 'url', value: string) {
    editedFields.current.add(field);
    setCopyStatus('idle');
    setCandidate((current) => ({ ...current, [field]: value }));
  }

  function updateOptionalField(
    field: 'location' | 'workMode',
    value: string,
  ) {
    editedFields.current.add(field);
    setCopyStatus('idle');
    setCandidate((current) => ({ ...current, [field]: value || undefined }));
  }

  function addTechnology(event: React.FormEvent) {
    event.preventDefault();
    const technology = newTechnology.trim();
    if (!technology) return;
    editedTechnologies.current = true;
    setCopyStatus('idle');
    setTechnologies((current) =>
      current.some((item) => item.toLocaleLowerCase() === technology.toLocaleLowerCase())
        ? current
        : [...current, technology],
    );
    setNewTechnology('');
  }

  function removeTechnology(technology: string) {
    editedTechnologies.current = true;
    setCopyStatus('idle');
    setTechnologies((current) => current.filter((item) => item !== technology));
  }

  async function copyApplicationRow() {
    try {
      await navigator.clipboard.writeText(
        buildApplicationClipboardRow(candidate, technologies),
      );
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  const technologyGroups = groupTechnologies(technologies);

  return (
    <main>
      <header className="header">
        <div>
          <p className="eyebrow">Apply Flow</p>
          <h1>Job Application</h1>
        </div>
        <button className="refresh-button" type="button" onClick={() => void detect()} disabled={loading}>
          {loading ? 'Detecting…' : 'Refresh'}
        </button>
      </header>

      <p className={`status ${statusKind}`} aria-live="polite">
        {message}
      </p>

      <ApplicationHistory candidate={candidate} autoLookupKey={historyLookupKey} />

      <div className="fields">
        <div className="two-column">
          <label>
            Company
            <input
              value={candidate.company}
              onChange={(event) => updateField('company', event.target.value)}
              placeholder="Company name"
            />
          </label>
          <label>
            Position
            <input
              value={candidate.position}
              onChange={(event) => updateField('position', event.target.value)}
              placeholder="Job title"
            />
          </label>
        </div>
        <div className="two-column">
          <label>
            Location
            <input
              value={candidate.location ?? ''}
              onChange={(event) => updateOptionalField('location', event.target.value)}
              placeholder="City, region, or country"
            />
          </label>
          <label>
            Work arrangement
            <select
              value={candidate.workMode ?? ''}
              onChange={(event) => updateOptionalField('workMode', event.target.value)}
            >
              <option value="">Not specified</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="On-site">On-site</option>
            </select>
          </label>
        </div>
        <label>
          Job URL
          <textarea
            value={candidate.url}
            onChange={(event) => updateField('url', event.target.value)}
            placeholder="https://…"
            rows={2}
          />
        </label>
      </div>

      {candidate.workMode === 'Remote' && (
        <p className="remote-eligibility">
          <strong>Remote location restrictions:</strong>{' '}
          {candidate.remoteEligibility ?? 'Not specified in the listing.'}
        </p>
      )}

      <section className="technologies" aria-labelledby="technologies-heading">
        <div className="section-heading">
          <h2 id="technologies-heading">Technologies mentioned</h2>
          <span>{technologies.length} selected</span>
        </div>
        {technologyGroups.length > 0 ? (
          <div className="technology-groups">
            {technologyGroups.map((group) => (
              <div className="technology-group" key={group.category}>
                <h3>{group.category}</h3>
                <div className="chips">
                  {group.technologies.map((technology) => (
                    <button
                      className="chip"
                      type="button"
                      key={technology}
                      onClick={() => removeTechnology(technology)}
                      aria-label={`Remove ${technology}`}
                      title="Remove"
                    >
                      {technology}<span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-technologies">No known technologies detected.</p>
        )}
        <form className="add-technology" onSubmit={addTechnology}>
          <input
            value={newTechnology}
            onChange={(event) => setNewTechnology(event.target.value)}
            placeholder="Add a technology"
            aria-label="Technology name"
          />
          <button className="add-button" type="submit">Add</button>
        </form>
      </section>

      <div className="copy-row-action">
        <button
          type="button"
          onClick={() => void copyApplicationRow()}
          disabled={loading || (!candidate.company && !candidate.position)}
        >
          {copyStatus === 'copied' ? 'Row copied' : 'Copy row for Sheets'}
        </button>
        <span aria-live="polite">
          {copyStatus === 'error'
            ? 'Could not access the clipboard.'
            : 'Paste into column A of an empty Applications row.'}
        </span>
      </div>

      {metadata && (
        <details className="extraction-details" open>
          <summary>Extraction details</summary>
          <p>
            {metadata.sourceHost ?? 'Unknown source'} · {metadata.sources.join(' + ')} ·{' '}
            {metadata.confidence} confidence
          </p>
        </details>
      )}
      {settingsControls}
    </main>
  );
}

export default App;
