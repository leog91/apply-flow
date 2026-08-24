# Apply Flow

Apply Flow is a personal browser extension for inspecting job listings and checking them against a Google Sheets-based application tracker. The existing Applications, Dashboard, and Lists sheets remain the source of truth.

## Current Milestone

The extension inspects the active job-listing page, extracts Company, Position, Location, Work Arrangement, Job URL, and explicitly mentioned technologies, and presents them as editable popup fields. Technology extraction uses a deterministic keyword catalog rather than AI. A direct, read-only Google Sheets integration can identify an exact job, a probable duplicate position, or previous applications at the company. A copy action produces a tab-separated `Applications` row for manual paste; the extension never submits or changes sheet data.

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

The extension uses Manifest V3 `activeTab` and `scripting` permissions for page inspection, `identity` for Google OAuth, `storage` for the locally configured spreadsheet ID and short-lived Brave token, and `clipboardWrite` for the user-triggered copy action. Opening the popup grants temporary access to the selected tab, and WXT injects a small function that returns the title, heading, canonical/OpenGraph metadata, and JSON-LD blocks. This avoids broad website permissions and an always-running content script. The only persistent host permission is `https://sheets.googleapis.com/*`. Restricted pages such as `chrome://` cannot be inspected and are reported in the popup.

## Copying an Application Row

After reviewing the extracted fields and technologies, click **Copy row for Sheets** and paste into column A of an empty `Applications` row. The copied TSV contains all A:P placeholders, today's local date, and an `Applied` stage, so populated columns remain aligned without any direct sheet write.

## Google Sheets Setup

The integration reads from a sheet named `Applications`. It requests only the Google Sheets `spreadsheets.readonly` OAuth scope and fetches these ranges:

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

1. Pending/Inbox Google Sheet
2. Lists sheet integration
3. Expand the technology catalog and extraction context
4. Broader standards-based extraction where generic metadata is insufficient
5. Approve Pending → Applications workflow
6. Optionally show application status directly on job pages
