# ChatGPT Job Inbox

## Purpose

The Job Inbox stores opportunities discovered in ChatGPT independently from actual applications. Seeing or syncing a job leaves it in `new`; it becomes an application only through the existing Applications workflow. The domain model uses generic source-message metadata so another discovery source can feed the same inbox later.

## Domain Model

`DiscoveredJob` is the review unit. It contains a deterministic ID, identity kind, available company/position/location fields, canonical job URL, lifecycle status, discovery timestamps, and one primary `SourceMessage` reference. `SourceMessage` contains the source, conversation and message identifiers when exposed, source name, conversation URL, source timestamp precision, and first-seen timestamp.

The local state also stores message-to-job ID lists. This supports per-message progress such as 5/8 reviewed without requiring a separate Google Sheet tab. When the same canonical job appears in several messages, there is one job record and several local message references. The synchronized row currently retains the first discovery's source metadata; preserving all occurrences remotely is a future extension point.

`Job Inbox!A:S` keeps reviewable fields first and machine identifiers later:

```text
Date Discovered, Company, Position, Location, Status, Job URL, Source Name, ChatGPT Sent Date, Timestamp Precision, Source, Conversation URL, Message ID, First Seen At, Synced At, Application Ref, ID, Conversation ID, ChatGPT Sent At, Notes
```

Statuses are `new`, `reviewed`, `shortlisted`, `skipped`, and `applied`. The first version ingests and synchronizes `new` jobs and marks jobs already present in Applications as `applied`; interactive review actions are intentionally deferred.

## Data Flow

The WXT content script is restricted to `https://chatgpt.com/*`, and capture is enabled by default. **Capture rendered jobs** starts a debounced `MutationObserver` and displays an on-page Apply Flow indicator. Disabling capture or pausing Apply Flow disconnects the observer, removes the indicator, and stops reading message DOM without deleting previously captured jobs. While active, the observer scans assistant messages as ChatGPT renders them during scrolling. The DOM adapter extracts bounded semantic blocks, links, emphasized labels, stable IDs, and visible timestamp metadata. A pure parser then identifies likely job links from URL and surrounding role context.

Parsed jobs merge into `browser.storage.local` by deterministic ID. All mutations are serialized through the extension background worker so simultaneous ChatGPT tabs and an extension-UI sync cannot overwrite one another. Later streaming observations can fill missing fields or upgrade a timestamp from `unknown` to `day`/`exact` without changing `first_seen_at`. No Google request occurs while scrolling. Opening Apply Flow on ChatGPT requests a fresh rendered-DOM scan and shows conversation counts plus the global pending queue. **Sync pending jobs** performs:

1. One `values:batchGet` for the three Applications ranges and `Job Inbox!A:S`.
2. Local reconciliation by job ID/canonical URL and exact Applications URL.
3. One `values.append` request containing all genuinely new rows with `valueInputOption=RAW`.
4. Local acknowledgement only after Google confirms the complete row count.

If the tab is absent, first sync creates it and the header with `spreadsheets.batchUpdate`, then retries the initial read. Headers are matched by normalized name, so title case, snake case, and reordered recognized columns remain readable. Existing rows using the original ID-first A:R schema are rewritten once into the review-first A:S layout before new rows are appended. Reconciliation refreshes matching rows from the latest rendered-message parse and removes obsolete citation-only `new` rows proven stale by the same source message; rows whose status was manually changed are retained. Missing or duplicate required headers stop synchronization with a specific error.

## Deduplication

HTTP(S) job URLs are canonicalized by removing fragments, trailing slashes, known tracking parameters, stable redirect wrappers, and query-order differences. LinkedIn job URLs reduce to their numeric job identity. Unknown query parameters and path casing remain because they may identify a role.

The primary ID is `url:` plus SHA-256 of the canonical URL. A URL-less record uses `metadata:` plus SHA-256 of normalized company, position, and location; `identityKind=metadata` makes the higher collision risk explicit. Company plus title is not used when a URL is available.

## Timestamp Semantics

- `chatgpt_sent_at` is populated only from a reliable exact DOM value such as an ISO datetime or epoch timestamp.
- `chatgpt_sent_date` is populated when only a reliable calendar date is exposed.
- `timestamp_precision` is `exact`, `day`, or `unknown` and records which value is trustworthy.
- `first_seen_at` is set once when Apply Flow first parses the job locally.
- `synced_at` is set on the row submitted in a successfully confirmed batch. It is not a substitute for the ChatGPT timestamp.

The inspected ChatGPT DOM exposed stable message IDs but no timestamps, so those messages correctly use `unknown` rather than their scan time.

## Limits And Failures

ChatGPT virtualizes and dynamically renders conversations. Apply Flow knows only about assistant messages that have appeared in the DOM; it never reports a full-conversation sync. Users must scroll to expose older results and reopen the extension UI for updated counts.

DOM changes can cause a message to yield no jobs, but cannot delete or corrupt previously captured records. Network, authorization, quota, malformed-response, and edit-permission failures leave jobs pending locally. If Google commits an append but its response is lost, the next initial read reconciles the deterministic IDs before another append.

The parser intentionally rejects generic company, careers-home, ChatGPT, and OpenAI links. Missing company or location remains blank rather than guessed. The content script does not call undocumented ChatGPT APIs.
