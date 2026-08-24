# Apply Flow

Apply Flow is a personal browser extension for capturing job listing information before adding applications to a Google Sheets-based tracker. The existing Applications, Dashboard, and Lists sheets remain the intended source of truth.

## Current Milestone

Milestone 1 inspects the active job-listing page, extracts Company, Position, Location, Work Arrangement, Job URL, and explicitly mentioned technologies, and presents them as editable popup fields. Technology extraction uses a deterministic keyword catalog rather than AI. It does not connect to Google Sheets or submit application data.

## Stack

- WXT
- React
- TypeScript
- Zod
- Bun

## Development

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run build
```

`bun run dev` opens WXT's Chromium development workflow. Load the generated extension from `.output/chrome-mv3-dev` manually if browser auto-launch is unavailable.

## Architecture

```text
active web page
→ active-tab page inspection
→ layered extraction/parser registry
→ Zod-validated ApplicationCandidate
→ editable React popup
```

Pure extraction code lives under `lib/`, independently of React. The parser registry runs Schema.org `JobPosting` extraction first and generic page metadata second to fill missing values. It has no provider-specific rules: LinkedIn, job platforms, and company careers sites all use the same standards-based path. The normalized job URL is retained as the source identifier, and its hostname is shown as secondary source metadata.

The extension requests only Manifest V3 `activeTab` and `scripting` permissions. Opening the popup grants temporary access to the selected tab, and WXT injects a small function that returns the title, heading, canonical/OpenGraph metadata, and JSON-LD blocks. This avoids broad host permissions and an always-running content script. Restricted pages such as `chrome://` cannot be inspected and are reported in the popup.

## Future Milestones

1. Pending/Inbox Google Sheet
2. Google Apps Script API
3. Duplicate detection
4. Company application history
5. Lists sheet integration
6. Expand the technology catalog and extraction context
7. Broader standards-based extraction where generic metadata is insufficient
8. Approve Pending → Applications workflow
9. Optionally show application status directly on job pages
