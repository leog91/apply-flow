# Apply Flow

Apply Flow is a personal browser extension for inspecting job listings, capturing jobs discovered in ChatGPT, and checking them against a Google Sheets-based application tracker. The spreadsheet remains the source of truth for synchronized records.

## Current Milestone

The extension inspects the active job-listing page, extracts Company, Position, Location, Work Arrangement, Job URL, and explicitly mentioned technologies, and presents them as editable side-panel or popup fields. Technology extraction uses a deterministic keyword catalog rather than AI. Google Sheets integration identifies duplicate applications and synchronizes a separate `Job Inbox` for discovered jobs. Applications are still added manually with the fixed TSV copy action; discovery never creates an application.

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
→ editable React side panel or popup
```

Pure extraction code lives under `lib/`, independently of React. The parser registry prefers structured job data, then Schema.org `JobPosting`, and finally generic page metadata to fill missing values. Most job platforms and company careers sites use the same standards-based path. Cross-origin embedded Greenhouse boards use their public read API because browser isolation prevents direct iframe inspection. The normalized job URL is retained as the source identifier, and its hostname is shown as secondary source metadata.

The extension uses Manifest V3 `activeTab` and `scripting` permissions for normal page inspection, `tabs` to limit side-panel availability by the active tab URL, `identity` for Google OAuth, `storage` for local discovery state, and `clipboardWrite` for the user-triggered copy action. The toolbar opens a persistent browser side panel on LinkedIn and ChatGPT by default; **Open on all websites** makes it available elsewhere, while disabling **Use side panel** restores the popup. LinkedIn host access lets the open panel refresh after LinkedIn navigations without another toolbar click. Other normal job pages are inspected through temporary `activeTab` access, so no all-sites content script or broad host access is added. A content script is limited to `https://chatgpt.com/*` because the extension UI cannot observe newly rendered messages while the user scrolls. ChatGPT capture is on by default, and an on-page indicator remains visible while the observer is active. Its separate toggle or the master **Apply Flow enabled** toggle disconnects the observer and stops reading message DOM without deleting captured jobs. It parses rendered DOM only and never calls ChatGPT APIs. Persistent API host access is limited to Google Sheets and Greenhouse's public board API. Restricted pages such as `chrome://` cannot be inspected and are reported in the extension UI.

## Copying an Application Row

After reviewing the extracted fields and technologies, click **Copy row for Sheets** and paste into column A of an empty `Applications` row. The copied TSV contains all A:P placeholders, today's local date, and an `Applied` stage, so populated columns remain aligned without any direct sheet write.

## Google Sheets Setup

The integration reads application history from a sheet named `Applications` and writes discovered jobs only to `Job Inbox`. It requests the Google Sheets `spreadsheets` scope; no Drive scope is used. Application-history reads use these ranges:

- `Applications!A:C`: Date Applied, Company, Position
- `Applications!H:H`: Job Post URL
- `Applications!L:O`: Stage, Outcome, Next Action, Next Action Date

To configure it:

1. Create or select a project in Google Cloud Console and enable the Google Sheets API.
2. Configure the OAuth consent screen. Add your Google account as a test user if the app remains in testing mode.
3. Run `bun run build`, load `.output/chrome-mv3` as an unpacked extension, and copy its extension ID from `chrome://extensions`.
4. Create an OAuth client with application type **Chrome Extension**, using that extension ID.
5. Rebuild with the public client ID: `WXT_GOOGLE_OAUTH_CLIENT_ID="CLIENT_ID.apps.googleusercontent.com" bun run build`.
6. Reload the unpacked extension, open a job page, expand **Sheet connection**, and enter the tracker URL or spreadsheet ID.

The first ChatGPT inbox sync creates the `Job Inbox` tab and its review-first A:S header if it does not exist. Human-readable, snake-case, and reordered recognized headers are mapped by name; existing ID-first inbox rows are migrated automatically on the next sync. Open a ChatGPT conversation and scroll through the messages you want ChatGPT to render. Reopen Apply Flow and choose **Sync pending jobs**. Jobs are deduplicated and queued in extension storage first, then appended in one request. Existing OAuth grants created by older read-only builds may require consent again.

Only rendered assistant messages can be captured. Apply Flow does not claim that an entire conversation has been scanned, and it does not invent message timestamps when ChatGPT exposes none. See `docs/chatgpt-job-inbox.md` for the data model and synchronization rules.

The OAuth client ID is build configuration, not a secret. The spreadsheet ID is stored only in `browser.storage.local`; access tokens remain in Chrome's identity token cache. Do not add credentials or tracker data to the repository.

### Brave

Brave does not provide Chrome's Google profile-token flow. Apply Flow therefore uses `identity.launchWebAuthFlow` in Brave and keeps its short-lived token in `browser.storage.session`.

1. Copy Apply Flow's ID from `brave://extensions`.
2. In Google Auth Platform, create another OAuth client with application type **Web application**.
3. Add `https://EXTENSION_ID.chromiumapp.org/` under **Authorized redirect URIs**, replacing `EXTENSION_ID` with the ID from step 1. The trailing slash must be present.
4. Copy the Web application client ID.
5. Build with both client IDs:

```bash
WXT_GOOGLE_OAUTH_CLIENT_ID="CHROME_CLIENT_ID.apps.googleusercontent.com" \
WXT_GOOGLE_WEB_OAUTH_CLIENT_ID="WEB_CLIENT_ID.apps.googleusercontent.com" \
bun run build
```

6. Reload Apply Flow from `brave://extensions` and connect again.

The web fallback validates OAuth state and the returned scope before accepting a token. The Chrome Extension client remains necessary for Google Chrome; the Web application client is used only by Brave.

## Future Milestones

1. Job Inbox review and shortlist actions
2. Lists sheet integration
3. Expand the technology catalog and extraction context
4. Broader standards-based extraction where generic metadata is insufficient
5. Approve Job Inbox → Applications workflow
6. Optionally show application status directly on job pages
