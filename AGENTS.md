# Repository Guide

## Commands

- Use Bun; `bun install` also runs `wxt prepare`, which generates the `.wxt/tsconfig.json` extended by the root TypeScript config.
- Chromium development/build: `bun run dev` / `bun run build`; Firefox equivalents are `bun run dev:firefox` / `bun run build:firefox`.
- Run all tests with `bun run test`. Focus a file with `bun run test -- lib/parsers/registry.test.ts` and a case with `bun run test -- <file> -t "<test name>"`.
- Before finishing code changes, run `bun run typecheck`, `bun run test`, and `bun run build`. There is no configured lint or formatter command.
- Load unpacked development and production Chromium builds from `.output/chrome-mv3-dev` and `.output/chrome-mv3`, respectively. Never edit `.wxt/` or `.output/`; both are generated and ignored.

## Architecture

- `entrypoints/popup/App.tsx` is shared by the popup and side-panel UI entrypoints. Keep parsing, normalization, Sheets mapping, and other testable logic under `lib/`, not in React components.
- The popup calls `browser.scripting.executeScript` from `lib/extraction/inspect-active-tab.ts`; `inspectPage` runs in the active tab and therefore must remain self-contained rather than closing over module imports or outer variables. Keep its returned payload bounded and synchronized with `JobPageContextSchema`.
- Extraction flows through `enrichEmbeddedJob` and then `parseJobPage`. `parserRegistry` order is precedence: embedded board, Schema.org `JobPosting`, then generic metadata; the first defined value for each candidate field wins. Add or reorder parsers only with registry tests covering layered results.
- Generic extraction deliberately scopes technology detection to a job section/description before falling back to broader page text. Do not replace this with whole-page scanning, which captures sidebar, company, and similar-job noise.
- Technology names, aliases, output order, and popup categories all come from `lib/extraction/technology-keywords.ts`; update its tests when changing the catalog.

## Browser And Sheets Constraints

- Preserve the narrow Manifest V3 model in `wxt.config.ts`: normal sites use temporary `activeTab`/`scripting` inspection, LinkedIn host access supports side-panel refreshes across navigation, `tabs` is used only to gate side-panel availability by URL, and the only persistent content script is scoped to `https://chatgpt.com/*`. API host access remains limited to Sheets and Greenhouse unless a feature demonstrably requires more.
- Application history is read-only and comes from `Applications!A:C`, `H:H`, and `L:O`; row parsing depends on those ranges staying aligned and skips row 1. Discovery writes are isolated to `Job Inbox!A:S`; map its columns by normalized header name and preserve the canonical human-readable header contract in `lib/job-inbox/sheet.ts`.
- Clipboard output in `lib/google-sheets/clipboard-row.ts` is a fixed 16-column A:P TSV with `Applied` in column L. Preserve empty placeholders when changing it and update clipboard-row tests.
- OAuth is build-time configuration with the Sheets read/write scope: `WXT_GOOGLE_OAUTH_CLIENT_ID` supplies Chrome's manifest OAuth client, while `WXT_GOOGLE_WEB_OAUTH_CLIENT_ID` enables Brave's `launchWebAuthFlow` fallback. `.env.local` is ignored by Git; never commit credentials, spreadsheet IDs, tokens, or tracker data.
- Chrome tokens stay in the identity cache, Brave tokens in `browser.storage.session`, and only the spreadsheet ID is persisted in `browser.storage.local`.
- ChatGPT capture is on by default. When capture or Apply Flow is disabled, keep its observer disconnected and do not inspect message DOM; while enabled, keep scanning defensive and debounced, never infer unrendered messages, never substitute `firstSeenAt` for a missing source timestamp, and keep Sheets writes user-triggered and batched.
- Route job-inbox mutations through `entrypoints/background.ts`; direct popup/content-script read-modify-write cycles can lose jobs when multiple ChatGPT tabs scan concurrently.
