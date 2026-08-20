# SendPalm — Positioning

> **Status:** v3 (2026-08-20)
> **One-liner:** *The email client you wish Spark / Apple Mail / Gmail web already were — HEY-style workflow, local-first, your inbox, your machine.*

---

## 1. What SendPalm is, in one sentence

SendPalm is a **desktop + iPhone + iPad email client** that connects to **any IMAP/SMTP email service** (Gmail, Outlook, iCloud, 飞书, QQ, 网易, Yahoo, Fastmail, generic IMAP) and gives you the **HEY-style "boxes, piles, screener" workflow** that almost no other client has — while keeping your mail **on your device** in a local SQLite store.

## 2. What SendPalm is **not**

| Not this | Why people confuse it |
|---|---|
| ❌ A **HEY replacement** | HEY is a full email service (their own servers, their own domain, $99/yr). SendPalm doesn't run mail servers — it talks IMAP/SMTP to the service you already use. |
| ❌ A **Gmail / Outlook replacement** | Those are services. SendPalm is the client you open instead of the web UI. |
| ❌ A **Superhuman clone** | Superhuman's whole pitch is keyboard speed + AI triage. SendPalm's pitch is **workflow shape** (Gate / Reply Later / Set Aside / Sticky / Clips / Follow-up), not latency. |
| ❌ A **privacy promise** | SendPalm is local-first by *architecture* (SQLite on disk, OS Keychain for passwords, no SendPalm cloud), but the email service you connect to still does whatever it does. We are not ProtonMail. |
| ❌ **Multi-device sync** | Each device is its own SQLite. Mail is consistent because IMAP is the source of truth. Notes / labels / piles are device-local. (v4 roadmap.) |

## 3. Where SendPalm sits in the market

```
              ┌──────────────────────────────────────────────┐
   HEY-like   │  ★ SendPalm                                  │
   workflow   │     (HEY workflow + client to any service)   │
              ├────────────────────┬─────────────────────────┤
   Clients    │  Spark / Newton    │  Apple Mail / Thunderbird│
   (any svc)  │  (Spark died;      │  (no HEY workflow)       │
              │   Newton dying)    │                          │
              └────────────────────┴─────────────────────────┘
                  │                       │
                  │                       │
   Services   ────┘                       │
   (own mail) ────────────────────────────┘
   (HEY, Gmail, Outlook, Fastmail, ProtonMail…)
```

**The white space:** *a client for any email service* **×** *HEY-style boxes / piles / screener workflow*. Spark had one half (any service) without the other (no HEY workflow). HEY has the other half (HEY workflow) but only on its own service. **Nobody owns the intersection as a real product in 2026.**

## 4. Reference products we learn from

| Product | Era | What they got right | Why they didn't dominate |
|---|---|---|---|
| **Spark** (Readdle) | 2015–2024 | Smart inbox, snooze, send-later, multi-platform | Killed the desktop app 2024; pivoted to AI; "smart" inbox trained users to ignore folders; no Gate / no screener |
| **Newton Mail** | 2014–2020 | Triage (Inbox / Later / Done), read receipts, beautiful on mobile | Subscription-only ($50/yr) couldn't sustain; shut down 2020 |
| **Airmail** | 2013–now | Multi-account, productivity integrations, Mac-native | Subscription-fatigue; "everything" UI felt cluttered |
| **MailMate** | 2010–now | Keyboard-first IMAP client for power users | No HEY workflow, no Gate, no piles; pure geek tool |
| **HEY** | 2020–now | **The HEY workflow** (boxes, screener, reply later, set aside, paper trail, the feed) | Their own mail service; you can't use HEY workflow with your existing Gmail |
| **Apple Mail** | always | Bundled, fast, on every device | No HEY workflow; one flat inbox |

**SendPalm's bet:** *HEY proved the workflow is loved. Spark / Newton proved the client space is viable. The intersection is empty.*

## 5. The HEY workflow we ship, on top of *any* IMAP account

| HEY concept | SendPalm mapping | Backend |
|---|---|---|
| The Imbox (split new-for-you / previously-seen) | Imbox view with `New for you` / `Previously seen` tabs, bundles (≥3 from same sender collapse) | `usePaginatedMessages` × 2 (unread/read) |
| The Screener (Gate) | Gate view + inline approve/block pill in Imbox; Tinder-style yes/no; screener history | `countGateCandidates` + `listGateQueue` |
| Reply Later (L) / Set Aside (A) / Bubble Up (Z) | Per-message shortcuts + drag to DropBar; inline Pending / Saved / Remind piles | `message.reply_later / set_aside / bubble_up_at` |
| Sticky Notes | Per-message yellow stickies; surface in global search | `stickies` table |
| Clips (saved snippets from messages) | Sidebar Clips view; Today / Earlier; per-message Clip action | `clips` table |
| Follow-ups | Sidebar Follow-ups view; per-message Follow-up picker; 4 sections (Overdue / Today / This week / Later) | `follow_ups` table |
| The Feed (newsletters) | Stream view (no read/unread, scannable) | `messages.bucket = 'feed'` |
| Paper Trail (receipts) | Records view | `messages.bucket = 'paperTrail'` |
| Reply Later pile / Set Aside pile / Remind pile | Inline fans at the bottom of Imbox + dedicated PileBoard views | `usePileMessages` + `PileBoard` |
| Snippets | Compose toolbar + Settings → Manage snippets | `snippets` table |
| Calendar | HEY doesn't have one; we add it (day/week/year + RRULE + iCal RSVP) | `events` table + `services/ical.rs` |

## 6. The "client for any service" stack we ship

| Layer | Implementation |
|---|---|
| IMAP receive | `async-imap` (tokio-native, RFC 3501 UID-correct fetch — `session.uid_fetch`, not `session.fetch`) |
| SMTP send | `lettre` (async, rustls, app-password / authorization-code / OAuth) |
| MIME parse | `mailparse` (RFC 3501 / 2045 / 5322) |
| Provider registry | `services/providers.rs` — 10 presets: Gmail, Outlook, iCloud, Yahoo, Fastmail, Feishu, QQ, 网易 163, 网易 126, generic IMAP |
| Auth modes per provider | `app-password` (Gmail, Outlook, iCloud, Yahoo, Fastmail, Feishu) / `password-with-auth-code` (QQ, 163, 126) |
| Credentials vault | OS Keychain via `keyring` crate; per-account id, never in DB |
| Multi-account loop | 60s poll per account; UID-walk chunking (200 UIDs/tick, UIDNEXT-terminated); 8-connection SQLite pool so sync doesn't freeze reads |
| Sent-folder sync | Subscribed by default; messages tagged `direction='out'` so they never enter Imbox / Gate / unread count |
| Calendar invites (iCal) | In-tree parser; UID-dedup; REPLY/CANCEL handling; iTip RSVP send via SMTP |
| Attachments | MIME parts parsed; bytes on disk; per-message attachment cards (UI shipped, "save to disk" still a Tier 2 polish) |

## 7. The local-first architecture we ship

| Layer | Implementation |
|---|---|
| Local DB | SQLite via `rusqlite` + `tauri-plugin-sql` for the JS bridge; WAL journal; 8-connection pool |
| Migrations | 20 numbered SQL migrations (`migrations/0001_init.sql` → `migrations/0020_calendar_recurrence.sql`) — every schema change recorded |
| Search | FTS5 with CJK-friendly tokenizer (migration 0012) — `messages`, `contacts`, `files`, `events` indexed |
| State | SolidJS signals + stores; single-page shell with view-state routing (no router lib) |
| Persistence | Only `onboarding_completed` + `image_sender_policy` in `tauri-plugin-store`; everything else derived from SQL |
| iCloud-style "delete everywhere" | **Not shipped.** Trash is local 30-day. (v4.) |

## 8. Commercial model — what we are testing

We are explicitly **not** building:
- A mail server
- A sync service
- A web app
- A multi-device account system

We are testing three commercial paths, in order:

1. **Tier-1 / Showcase** — *A free download, polished Tauri build, demo account.* The artefact itself is the marketing. (Today.)
2. **Tier-2 / Daily driver** — *A paid desktop app, $30–60 one-time or $5–8/mo, Mac / Windows / Linux.* For the "I want to replace Apple Mail with something I actually love" person. (~2 weeks of remaining P0/P1 work.)
3. **Tier-3 / Ship-ready** — *A downloadable .dmg / Setapp / Mac App Store listing, with crash reporting, an onboarding that demos the value, a marketing site, a privacy policy.* (~1–2 months of remaining work.)

We are **not** building B2B SSO, audit logs, or SOC 2. SendPalm is a person, not a company.

## 9. What "complete" means in this positioning

A SendPalm v3 user can:

| Capability | How it works today |
|---|---|
| Open the app on a fresh Mac | Boots, renders Imbox, no white screen, no console errors |
| Connect a real Gmail / Outlook / iCloud / 飞书 / 网易 account | Settings → Accounts → Add → pick provider → enter app password → 60s later, mail is in |
| Triage a day's mail | Read-together loop (J / K) + drag-to-DropBar (5 buckets + 3 workflow piles) + per-message shortcuts (L / A / Z) |
| Reply | Compose (⌘N) → pre-fills quote + recipient → SMTP-sent via real backend |
| Snooze / remind | Z picker → bubble up at chosen time → resurfaces in Imbox (60s tick) |
| File an attachment | Open message → see attachment card → click to preview (PDF/image/markdown extract) → "save to disk" (Tier 2 polish) |
| Find an old mail | ⌘K (fuzzy) / `/` (live search) / Search page (FTS5 with CJK) — all three converge |
| Use it for a week | 8-connection pool; deferred DOMPurify; soft refresh; scoped MessagePanel queries — no freezes, no data loss |
| Mobile | iPhone + iPad, bottom-tab bar on mobile, full-screen modals, swipe gestures, pull-to-refresh |
| Privacy | Local SQLite; OS Keychain credentials; no SendPalm cloud; spy-pixel shield per message |

## 10. Honest scope non-goals

- ❌ We are not building a backend. Each device is its own SQLite. Cross-device note-sync is v4.
- ❌ We are not building a web app. Tauri desktop + iOS only.
- ❌ We are not building Microsoft Graph / Slack / WeChat integrations.
- ❌ We are not building end-to-end encryption. The mail is plain to/from the IMAP server.
- ❌ We are not building "send large files" or "encrypted attachments" or "secure shredder".
- ❌ We are not building a team / shared-mailbox product.

If you need any of those, use HEY, ProtonMail, or Front. SendPalm is for the person who said *"I just want a better client for the email address I already have."*
