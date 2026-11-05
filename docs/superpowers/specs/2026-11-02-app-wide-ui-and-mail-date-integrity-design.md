# SendPalm UI Consistency and Mail Date Integrity

## Intent

Make SendPalm feel like one dependable desktop/mobile product while preserving the distinct jobs of Mail, Calendar, Contacts, Tasks, Library, Agent, and Settings. Make email timestamps understandable and trustworthy: Inbox should reflect when a message actually arrived, while message details can distinguish that from the sender's declared date.

This is an audit-led improvement to the current SolidJS/Tauri app, not a framework migration or a visual restart.

## Findings from the Current App

- `app/src/styles/tokens.css` already defines a warm brand palette, H1–H4 scale, body sizes, spacing, radii, and semantic surface tokens. Many pages bypass those conventions with page-specific inline styles.
- Top-level views vary between left- and center-aligned titles, use inconsistent semantic heading levels, and give some pages a smaller title than their neighboring pages. Several important timestamps/counts use the 11px micro token.
- There is no shared top-level page-header primitive. Panels, nested settings pages, and workspace views each make local choices for heading, padding, and action placement.
- Inbox already removes an opened unread message from “新邮件” and adds it to “已读”; the detail remains open. Its contact bundle drawer has no internal date sections and presents raw `tm` strings.
- Rust parses the sender's RFC 5322 `Date` header into UTC. If it is absent or invalid, the parser substitutes the current time. The IMAP fetch requests `FLAGS UID ENVELOPE BODY.PEEK[]`, not `INTERNALDATE`.
- `sync_loop.rs` persists `st` as the RFC date and `tm` as a UTC-formatted string. Multiple views render `tm` directly, while date buckets parse `st` in the device's local timezone. The saved `profile.timezone` setting is currently not used by shared date formatting.
- The latest Tauri startup log showed no password available from the OS keychain and no test-account fallback environment variable. Therefore that run did not successfully connect to IMAP; the displayed mailbox was local cached data, not proof of current server freshness.

## Goals

1. Provide one clear page-title hierarchy and shared layout primitives across all main views, child views, panels, Settings, Agent, and Compose.
2. Keep the existing SendPalm visual identity and each module's purpose-specific layout; remove accidental differences, not meaningful differences.
3. Display email dates and message-timeline boundaries using the user's configured profile timezone rather than silently relying on the host OS timezone.
4. Preserve both the email's declared send date and the mail server's actual receive date. Use receive date for Inbox ordering and date grouping, with an honest fallback for legacy data.
5. Make sync freshness and credential failures visible so an old local mailbox is not mistaken for a freshly synced mailbox.
6. Add readable date organization inside expanded sender bundles and preserve a stable reading position as messages move from New to Read.

## Non-Goals

- No framework, styling-library, router, or state-library migration.
- No change to internal `imbox` route/bucket identifiers.
- No redesign of email HTML/Markdown rendering or sanitization.
- No automatic marking of mail read beyond the current open-and-mark-read behavior.
- No fabricated arrival dates. Legacy timestamps that cannot be recovered remain explicitly a fallback until metadata is fetched.
- No message-body download during timestamp backfill; the backfill uses IMAP metadata only.
- No prototype edits or dependency additions.

## Approaches Considered

### A. Local formatting-only patch

Keep the current message timestamp model and format `st` in the configured timezone. This fixes timezone display drift with low risk, but it still treats the sender-controlled `Date` header as the receive time and cannot detect a mailbox that has not synced recently.

### B. Shared UI primitives plus separate sent/received timestamps — selected

Normalize reusable visual patterns without flattening page layouts. Add nullable sent/received timestamp fields, read IMAP `INTERNALDATE`, use receive time for Inbox order/grouping, format all user-facing dates in the configured timezone, and perform a bounded metadata-only repair pass for existing IMAP messages. This directly resolves both the visual inconsistency and the misleading date semantics while preserving existing message content and workflow state.

### C. Rebuild every module independently

Redesign each view from scratch. Rejected because it is high risk, duplicates design decisions, and is more likely to create the same cross-view inconsistency again.

The user has delegated implementation choices to the agent. Approach B is selected as the sensible default for a real email client.

## Product Behavior

### Dates and sync freshness

- Store the sender-declared date (`sent_at`, nullable) and IMAP server arrival date (`received_at`, nullable) independently. Keep existing `st` and `tm` fields for compatibility during migration; stop treating `tm` as a user-facing source of truth.
- The parser must not silently turn a missing or invalid sender `Date` header into a plausible “sent now” value. `sent_at` is absent in that case; `received_at` remains the reliable timeline value.
- New IMAP fetches request `INTERNALDATE` alongside UID/envelope/body. A restartable, bounded backfill requests only `UID`, `ENVELOPE`, and `INTERNALDATE` for already-local messages missing timestamps; it never fetches message bodies or changes UIDs, read state, buckets, or sync cursors.
- Inbox sort order and date buckets use `received_at`; for legacy rows without a server date, use existing ISO `st` as the fallback and label it neutrally as the message date. Never use `tm` as the fallback because it is a preformatted UTC display string. The message detail labels send and receive times separately when both are known; if only one is known, its label must not claim the other meaning.
- Email display formatting and mail-specific local-day/week boundaries use `profile.timezone` (IANA zone). Invalid or absent zone settings fall back safely to the operating-system zone. Calendar event semantics are not changed by this mail-date workstream.
- Surface the last successful sync time and a concise actionable sync error (for example, missing account password) in the existing sync/account UI. Do not imply “up to date” just because a local account row exists.
- Do not log credentials, message bodies, or provider response content.

### Inbox sender bundles and read-follow behavior

- Keep the top-level New/Read tabs as separate paginated sources.
- In an expanded sender bundle, group the most recent seven local calendar days individually and older messages by Monday–Sunday calendar week, in the configured timezone. Show an explicit unread marker and date for each item; counts describe only the active tab's messages.
- Opening an unread message continues to move it from New to Read immediately while leaving the detail open. If unread siblings remain, keep the expanded sender group in place and update its count. If the last unread item is opened, remove the group from New without moving unrelated rows; it appears in Read at its chronological position.
- Preserve the user's scroll/focus anchor during that transition. Provide the existing explicit “mark unread” action as the recovery path rather than silently reordering read mail to the bottom.

### Shared visual language

- Add a shared `PageHeader` pattern: one left-aligned H1, optional description, and an actions slot. Keep centered composition for empty-state content, onboarding, and purpose-specific focal flows, not as a second page-title style.
- Define and apply semantic typography classes backed by existing tokens: H1 for page titles, H2/H3 for sections, 18px body / 16px compact body, 13px metadata, and 11px only for decorative micro-badges. Important counts and dates must not rely on micro text alone; use tabular numerals where useful.
- Normalize page content width, title/action spacing, common button/input heights, and card/divider surfaces. Keep semantic color (brand green, Agent accent, status colors) and domain-specific layouts.
- Review all view-level loading, empty, error, selected, hover, focus, and disabled states. Reuse existing `ResourceGate`, `Empty`, `ErrorState`, and component primitives where they fit; do not add decorative animation without state meaning.
- Maintain the current mobile/tablet/desktop breakpoints and tap-target requirements.

## Scope

- Main views and sub-apps: Gate, Inbox/Imbox, Stream, Records, Spam, Trash, Drafts, Tasks, Follow-ups, Contacts, Companies, Calendar, Files, Clips, Insights, Settings, Search, Agent, Focus Reply, Read Together, and Pile Board.
- Shared surfaces: Topbar, Sidebar, DetailPanel, MessagePanel, Contact/Company/Task/Meeting/File/Draft panels, Compose, notifications, empty/loading/error states, dialogs, pickers, and common buttons/inputs.
- Backend/data pipeline: `parser.rs`, IMAP fetch/sync loop, message migrations/store queries, message date types/utilities, and date rendering consumers.

## Reliability and Compatibility

- Database changes are additive and nullable; existing rows and messages remain readable throughout upgrade.
- Existing `st`/`tm` fields and response wire naming remain intact until callers have migrated; Rust response DTOs must continue to match their actual wire casing.
- The backfill is bounded and restartable, covers every IMAP folder already represented in the local database (not locally-created non-IMAP messages), only updates date metadata for rows already present, and is idempotent. It fetches UID, ENVELOPE, and INTERNALDATE only; it never fetches message bodies and does not move folder sync cursors.
- Automatic email sync still requires credentials in the existing OS-keychain flow. With no credentials, the UI explains the stale local state and never invents new data.

## Verification

- Rust parser tests: valid RFC dates with offsets, missing/malformed `Date`, and UTC normalization.
- IMAP tests: `INTERNALDATE` parsing, missing attribute fallback, metadata-only backfill does not request bodies, and UID/sync cursors remain unchanged.
- Migration/store tests: old rows survive with null new fields; sent/received round-trip; backfill is idempotent and bounded.
- TypeScript date tests: configured IANA timezone, UTC-offset boundaries, day/week/month grouping, invalid timezone fallback, and legacy fallback.
- Inbox view tests: day/week grouping, unread markers/counts, open-read transition, expanded bundle retention, last-unread removal, and stable focus/scroll behavior.
- Responsive Playwright pass across the full view list at desktop, iPad, and mobile widths; include empty/loading/error states and both light/dark themes.
- Native Tauri smoke: local SQLite path, migration success, and sync-status explanation. A real mailbox sync is only considered verified when the user has stored valid credentials in the OS keychain; tests must not print them.
- Full Vitest, typecheck, lint, build, `git diff --check`; do not edit the reference prototype.
