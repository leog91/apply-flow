import { useEffect, useState } from 'react';
import { extractFromActiveTab } from '@/lib/extraction/inspect-active-tab';
import { groupTechnologies } from '@/lib/extraction/technology-keywords';
import type { ApplicationCandidate } from '@/lib/schemas/application-candidate';
import type { ExtractionMetadata } from '@/lib/parsers/types';
import './App.css';

const EMPTY_CANDIDATE: ApplicationCandidate = {
  company: '',
  position: '',
  url: '',
};

function App() {
  const [candidate, setCandidate] = useState(EMPTY_CANDIDATE);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [newTechnology, setNewTechnology] = useState('');
  const [metadata, setMetadata] = useState<ExtractionMetadata>();
  const [message, setMessage] = useState('Inspecting the current page...');
  const [statusKind, setStatusKind] = useState<'loading' | 'success' | 'neutral' | 'error'>('loading');
  const [loading, setLoading] = useState(true);

  async function detect() {
    setLoading(true);
    setStatusKind('loading');
    setMessage('Inspecting the current page...');
    const extraction = await extractFromActiveTab();

    if (extraction.status === 'success') {
      setCandidate(extraction.result.candidate);
      setTechnologies(extraction.result.candidate.stack ?? []);
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
    } else {
      setMetadata(undefined);
      setMessage(extraction.message);
      setStatusKind(extraction.status === 'error' ? 'error' : 'neutral');
    }
    setLoading(false);
  }

  useEffect(() => {
    void detect();
  }, []);

  function updateField(field: 'company' | 'position' | 'url', value: string) {
    setCandidate((current) => ({ ...current, [field]: value }));
  }

  function addTechnology(event: React.FormEvent) {
    event.preventDefault();
    const technology = newTechnology.trim();
    if (!technology) return;
    setTechnologies((current) =>
      current.some((item) => item.toLocaleLowerCase() === technology.toLocaleLowerCase())
        ? current
        : [...current, technology],
    );
    setNewTechnology('');
  }

  function removeTechnology(technology: string) {
    setTechnologies((current) => current.filter((item) => item !== technology));
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

      <section className="technologies" aria-labelledby="technologies-heading">
        <div className="section-heading">
          <h2 id="technologies-heading">Technologies mentioned</h2>
          <span>{technologies.length} detected</span>
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

      {metadata && (
        <details className="extraction-details" open>
          <summary>Extraction details</summary>
          <p>
            {metadata.sourceHost ?? 'Unknown source'} · {metadata.sources.join(' + ')} ·{' '}
            {metadata.confidence} confidence
          </p>
        </details>
      )}
    </main>
  );
}

export default App;
