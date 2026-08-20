# SendPalm

**The HEY workflow, on the email address you already have.**

SendPalm is a calm, local-first email client for **macOS, iPhone, and iPad**. It connects to **Gmail, Outlook, iCloud, Fastmail, Feishu, QQ, NetEase, Yahoo**, and any custom IMAP server. It runs the boxes-and-piles inbox HEY proved people love, without sending your mail to a new service.

[Read the positioning](docs/POSITIONING.md) · [OAuth decision](docs/OAUTH-DECISION.md) · [Marketing site](marketing/index.html) · [Soak checklist](docs/SOAK-CHECKLIST.md)

---

## Highlights

- **HEY workflow on your existing inbox.** Gate screener, Imbox bundles, Reply Later / Set Aside / Bubble Up piles, sticky notes, follow-ups, snippets. All the ideas that made HEY's UX famous, on the email account you already pay for.
- **10 email services, one app.** Gmail, Outlook, iCloud, Yahoo, Fastmail, Feishu, QQ, NetEase 163 / 126, plus a generic IMAP option for self-hosted servers.
- **Local by architecture.** Your mail lives in a SQLite file on your Mac. Your password lives in the macOS Keychain. There is no SendPalm cloud. We do not have a backend.
- **macOS, iPhone, iPad.** The same warm paper background, the same palm green accent, the same j/k keys. Mobile is full-screen, desktop has the sidebar.
- **Real SMTP send.** Compose goes out through your provider's SMTP, with HTML body, attachments, and CC / BCC. No local-only drafts masquerading as sent.
- **Real IMAP receive.** 60 second polling, UID-walk chunking, multi-account loop, OS Keychain vault. MIME parts parsed, attachments stored locally, iCal invitations detected and one-click added to the calendar.
- **Open source.** MIT licensed. Read it, fork it, ship your own variant.

## How it differs from HEY

HEY is a complete email service. They run the servers, they own the domains, they charge $99 a year. SendPalm is a client. We don't run a server, we don't accept your mail, we don't charge a subscription. The HEY workflow is what you get. The HEY business model is not.

See [docs/POSITIONING.md](docs/POSITIONING.md) for the full pitch and the explicit non-goals (no backend, no cross-device sync, no web app, no B2B SSO).

## How it differs from Spark / Foxmail / Newton

Spark, Foxmail, and Newton were (or are) email clients that work with your existing account. SendPalm is the same shape of product, but with the HEY workflow on top. The gate, the boxes, the piles, the follow-ups, the stickies, the snippets — none of the others have this. See [docs/POSITIONING.md](docs/POSITIONING.md) for the market map.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2.x |
| Frontend | SolidJS + TypeScript (strict) |
| Bundler | Vite |
| Styling | Vanilla CSS + tokens |
| Local DB | SQLite via `rusqlite` + `tauri-plugin-sql` |
| IMAP | `async-imap` |
| SMTP | `lettre` |
| MIME | `mailparse` |
| Calendar | In-tree iCal parser (no `icalendar` crate) |
| LLM | OpenAI-compatible via `reqwest` + `rustls` (optional) |

See [docs/STACK-DECISION.md](docs/STACK-DECISION.md) for the full reasoning.

## Build

```bash
# Install dependencies
pnpm install

# Type-check
pnpm typecheck

# Unit tests (vitest, 263 cases)
pnpm test

# Lint (ESLint, clean)
pnpm lint

# End-to-end tests (Playwright, 60 cases)
pnpm e2e

# Rust unit + integration tests (132 cases)
cd src-tauri
cargo test

# Run the desktop app in dev mode
pnpm tauri dev

# Build the desktop .app bundle
pnpm tauri build
```

## Project layout

```
app/
├── package.json                 # FE deps + scripts
├── vite.config.ts               # Vite + SolidJS
├── tsconfig.json                # Strict TS
├── index.html                   # App shell
├── src/                         # SolidJS frontend
│   ├── views/                   # 22 views (Imbox, Gate, Stream, Contacts, Calendar, ...)
│   ├── panels/                  # 6 right-side detail panels
│   ├── compose/                 # Compose modal + helpers
│   ├── agent/                   # Agent subsystem
│   ├── search/                  # ⌘K palette + live search
│   ├── stores/                  # SolidJS stores
│   ├── ipc/                     # Tauri command bindings
│   ├── types/                   # TypeScript types
│   └── utils/                   # Pure helpers
└── src-tauri/                   # Tauri 2 + Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── migrations/              # 20 numbered SQL migrations
    └── src/
        ├── commands/            # Tauri command handlers
        ├── services/            # IMAP, SMTP, iCal, LLM, vault
        └── ...
docs/                            # Architecture + decision docs
marketing/                       # Static landing site
```

## Documentation

- [docs/POSITIONING.md](docs/POSITIONING.md) — what SendPalm is, what it is not
- [docs/OAUTH-DECISION.md](docs/OAUTH-DECISION.md) — why v3 ships without OAuth
- [docs/STACK-DECISION.md](docs/STACK-DECISION.md) — web search record for stack choices
- [docs/PRD-v1.md](docs/PRD-v1.md) — feature inventory
- [docs/PROGRESS.md](docs/PROGRESS.md) — milestone log
- [docs/SOAK-CHECKLIST.md](docs/SOAK-CHECKLIST.md) — pre-release manual test plan
- [docs/PRIVACY-POLICY.md](docs/PRIVACY-POLICY.md) — what we collect (nothing)
- [docs/lessons.md](docs/lessons.md) — engineering lessons learned
- [AGENTS.md](AGENTS.md) — engineering rules for AI agents

## License

MIT. See [LICENSE](LICENSE).

## Status

SendPalm is feature-complete against prototype-v11.38 and integrates real IMAP / SMTP for the 10 supported providers. We are in the "ship-it" phase — fixing the remaining polish items, running a one-week soak, and packaging for distribution. See [docs/SOAK-CHECKLIST.md](docs/SOAK-CHECKLIST.md) for what's left.
