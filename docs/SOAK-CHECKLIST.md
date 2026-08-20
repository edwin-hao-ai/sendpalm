# SendPalm Soak Checklist

> **Status:** v3 pre-release manual test plan
> **Goal:** A user can install SendPalm, connect at least one real account, and use it as their primary mail client for one week without hitting a crash, data loss, or blocking UX issue.

The codebase has 263 vitest + 132 cargo test + 60 Playwright e2e. Those cover the deterministic paths. This checklist is for the **non-deterministic** paths that only show up under real use over real days: weird MIME, slow IMAP, dropped wifi, three accounts at once, the iPhone going to sleep mid-sync.

Run it on a real Mac with a real IMAP account (the Feishu account in `app/.env.example` works). Tick each box. Anything you cannot tick is a blocker for distribution.

---

## A. Account setup (15 min)

- [ ] Add a Gmail account with an app password. Account appears in Settings within 5 s.
- [ ] First sync backfills historical mail. 1,000 messages takes < 60 s. 5,000 messages takes < 5 min.
- [ ] Add a second account (Outlook). Both accounts show on the topbar sync badge.
- [ ] Delete an account. Password is removed from the OS Keychain (verify in `Keychain Access.app`).
- [ ] Wrong password is rejected with a clear toast (not a hung spinner).
- [ ] App restart remembers the accounts.

## B. Inbox triage (30 min, real unread)

- [ ] Open Imbox. `New for you` and `Previously seen` are distinct tabs.
- [ ] Sender with 3+ unread shows as a bundle; click expands the bundle.
- [ ] `J` / `K` move the cursor. `Enter` opens the message.
- [ ] Per-message: `L` Reply Later, `A` Set Aside, `Z` Bubble Up. Piles update instantly.
- [ ] Drag a message to the DropBar. 5 bucket + 3 workflow targets are present.
- [ ] Drop on `Pending`. Message appears in the Pending pile.
- [ ] Drop on `Trash`. Toast shows with Undo. Click Undo within 5 s; message is back in Imbox.
- [ ] `R` opens Compose with the sender pre-filled. `Re:` subject. Body has the quoted reply.

## C. Gate (15 min, first-time senders)

- [ ] Open Gate. First-time senders (where `screened = 0`) appear in the screener list.
- [ ] `Y` approves. Message moves to Imbox. `N` blocks. History view records both.
- [ ] Imbox inline approve pill works for single new senders in the list (no need to go to Gate).
- [ ] Restart app. Screener history persists.

## D. Compose and send (20 min)

- [ ] `⌘N` opens Compose. Empty draft.
- [ ] Type recipient + subject + body. Footer shows "Saving…" then "Draft saved".
- [ ] Switch tabs, come back. Draft is restored.
- [ ] Attach a file from disk. Attachment card appears.
- [ ] Send. Toast says "Sent". Message appears in Sent folder within 60 s.
- [ ] Send to a non-existent address. Bounce message arrives within 5 min.
- [ ] Schedule a send for 5 min from now. Toast confirms. Message actually sends at the scheduled time.
- [ ] Save as draft. Draft appears in Drafts view.

## E. Receive and sync (60 min, on a real account with traffic)

- [ ] Send yourself a mail from another account. It appears in Imbox within 60 s.
- [ ] Send yourself a mail with an HTML body, multiple recipients, CC, BCC. Renders correctly.
- [ ] Send yourself a mail with a 10 MB PDF attachment. Attachment card appears. Click to preview. Click "Save to…" picks a folder. File is correct on disk.
- [ ] Send yourself a calendar invite (`.ics`). MessagePanel shows the invite card. Click "Add to calendar". Event appears in Calendar view.
- [ ] RSVP to the invite from the MessagePanel. Reply email is sent. Organiser's RSVP list updates.
- [ ] Send yourself a mail from a new sender. They appear in Gate.
- [ ] Block a sender. Their future messages go to Spam, not Imbox.
- [ ] Sync badge on the topbar shows the right state (busy / idle / last_uid / last_synced_at).

## F. Calendar (20 min)

- [ ] Open Calendar. Day / Week / Year views all render.
- [ ] Create a new event. Modal opens. Save. Event appears in the grid.
- [ ] Create a recurring event (RRULE). Recurring occurrences tile in the day / week view.
- [ ] Edit an event. Changes persist across restart.
- [ ] Delete an event. Confirmation. Event is gone.
- [ ] iCal event with VTIMEZONE renders at the right local time.

## G. Mobile (iPhone 17 simulator, 30 min)

- [ ] App boots. Splash fades. No white screen.
- [ ] Add an account from Settings. Account is created locally; sync starts within 60 s.
- [ ] Mobile Imbox renders. Same sender bundles. J/K not present on mobile (touch instead).
- [ ] Open a message. Body renders. HTML body is sanitized (no script execution).
- [ ] Reply via Compose. Full-screen modal. Send lands in the desktop app's Sent within 60 s.
- [ ] Receive a calendar invite. RSVP from the phone. The desktop calendar reflects the response.

## H. iPad (iPad Pro 11" landscape, 15 min)

- [ ] App boots. Sidebar + main + detail layout renders.
- [ ] Rotate to portrait. Sidebar collapses to icon-only. Detail becomes overlay.
- [ ] Drag-and-drop a message between buckets works on touch (or long-press → bucket menu).

## I. Stability (overnight, 8 h)

- [ ] Leave the app open for 8 hours. Topbar pulse animation continues. No crash. No memory leak (Activity Monitor shows stable RSS).
- [ ] IMAP sync runs on schedule. Check `last_synced_at` on the topbar.
- [ ] CPU stays low. Open Activity Monitor: SendPalm process < 5% CPU when idle.

## J. Edge cases (30 min)

- [ ] Wifi drops mid-sync. The sync errors are caught; the next 60s tick reconnects.
- [ ] App is force-quit during a sync. Reopen. Sync resumes from the last successful chunk, not from the start.
- [ ] SQLite DB is deleted while app is closed. App reopens with empty state, no crash. Re-add account.
- [ ] Two accounts at once: a 50-message Gmail sync and a 5,000-message Outlook sync. The Gmail sync is not blocked by the Outlook backfill.
- [ ] A 20 MB HTML email renders within 1 s. (DOMPurify sanitize is deferred.)
- [ ] A 100-message bundle fan-out. Scrolling is 60 fps.

## K. Polish (15 min)

- [ ] No console errors on app boot (`Console.app` → filter on `SendPalm`).
- [ ] No console errors during a normal 1-hour session.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` 263/263.
- [ ] `pnpm typecheck` clean.
- [ ] `cargo test` 132/132.
- [ ] `pnpm e2e` 60/60.
- [ ] All seven Settings tabs save to the store and persist across restart.

---

## What to do when a check fails

1. Open `docs/lessons.md` — many past bugs are already documented.
2. Reproduce the failure with a minimal seed. Log the SQL state with `sqlite3 sendpalm.db`.
3. If the failure is a regression on `main`, file an issue with the commit that introduced it.
4. If the failure is a pre-existing bug, file an issue with the test case.
5. Do not block release on any single item without sign-off from the user.

## Done criteria

Every box is ticked, OR every unticked box has a documented decision to defer with an owner.
