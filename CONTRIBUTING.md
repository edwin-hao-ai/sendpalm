# Contributing to SendPalm

Thanks for the interest. SendPalm is an indie project, not a company. The maintainer's time is limited. Read this before opening an issue or a pull request.

## What is in scope for contribution

- **Bug reports** with a clear reproduction. See the [soak checklist](docs/SOAK-CHECKLIST.md) for the kind of bugs we care about.
- **i18n strings.** SendPalm ships in Simplified Chinese. Adding English, Japanese, or other locales is welcome.
- **New IMAP / SMTP provider presets.** If you use a provider that is not in [the registry](app/src-tauri/src/services/providers.rs), open a PR adding it. The `auth_mode` field must be honest.
- **Documentation fixes** in `docs/`, `README.md`, or in-app help copy.
- **Test coverage** for paths that are currently uncovered. The message-source parser, the iCal parser, the IMAP UID walk, and the SQLite migration chain are good targets.

## What is out of scope

- **OAuth for Gmail, Outlook, etc.** v3 ships IMAP + app-password only. See [docs/OAUTH-DECISION.md](docs/OAUTH-DECISION.md) for the reasoning. PRs adding OAuth will be deferred to v4.
- **Cross-device sync.** Each device is its own SQLite. v4.
- **A web version.** Tauri desktop + iOS only.
- **Microsoft Graph, Slack, WeChat, Matrix integrations.** Not in scope.
- **End-to-end encryption.** Not in scope.
- **Cloud-side anything.** SendPalm is local-first. If your PR requires a server, it is the wrong PR.

## Pull request process

1. **One logical change per commit.** Use the conventional commit prefix: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.
2. **No drive-by whitespace, formatting, or lint fixes** mixed with real changes. They make `git bisect` painful. Put them in a separate `chore: lint cleanup` PR.
3. **Add a test for any new logic.** UI renderers are exempt; pure logic, reducers, sort, filter, and any IPC crossing require a test.
4. **Run the full verification matrix** before opening the PR:
   - `pnpm typecheck`
   - `pnpm test` (must be 263/263 or higher)
   - `pnpm lint` (must be clean)
   - `pnpm e2e` (must be 60/60 or higher; only skip if your change is in Rust or SQL)
   - `cd src-tauri && cargo test` (must be 132/132 or higher)
5. **Update the relevant `docs/PROGRESS.md` section** if your change is a milestone-level improvement.
6. **Reference the issue number** in the PR body. If there is no issue, the PR body should explain the user-facing problem you are solving.

## Development setup

```bash
git clone <repo>
cd sendpalm
pnpm install
pnpm tauri dev     # boots the desktop app in dev mode
pnpm test          # runs vitest
pnpm e2e           # runs Playwright (boots its own Vite dev server on :5180)
```

For Rust changes:

```bash
cd src-tauri
cargo test
cargo build
```

For iOS:

```bash
pnpm tauri ios build     # builds an .app bundle into Xcode DerivedData
./scripts/verify-ios.sh  # installs into the simulator and captures a screenshot
```

## Code style

The codebase uses TypeScript strict mode and `rustfmt`. Run `pnpm lint` and `pnpm format:check` before pushing. ESLint is configured with `--max-warnings=0`.

There is no formal style guide beyond what the linter enforces. Look at neighbouring files for naming and structural conventions. The agent rules in [AGENTS.md](AGENTS.md) document the architectural rules the maintainer follows.

## Commit messages

The maintainer uses [conventional commits](https://www.conventionalcommits.org/). The first line is the prefix + scope + a verb in the imperative mood:

```
feat(imap): add Feishu provider preset
fix(contact): prevent duplicate upsert on screen 0
docs(positioning): reframe v3 around the client-for-any-service pitch
```

The body explains **why**, not what. The diff already shows what.

## Issue triage

- **P0 / blocker:** the app does not work for a primary use case. The maintainer will fix or close in 1-3 days.
- **P1 / important:** the app works around the bug or has a workaround. Fix in the next milestone.
- **P2 / nice-to-have:** open issue, no SLA.
- **P3 / wontfix:** the maintainer disagrees. Closed with reasoning.

## What the maintainer will not do

- Merge a PR that requires a server to function. SendPalm is local-first.
- Add a dependency that has not been web-searched for current best practice. See [AGENTS.md](AGENTS.md) §3.1.
- Add a feature the PRD explicitly defers. Read [docs/PRD-v1.md](docs/PRD-v1.md) §12 first.
- Accept a PR that breaks the design system. The design language is in `app/src/styles/tokens.css`; new components use it, not override it.
- Add a feature without a test. The [soak checklist](docs/SOAK-CHECKLIST.md) lists the manual test cases a new feature must pass.

## Security

If you find a security issue, do not open a public issue. Email the maintainer directly (address in the repo's GitHub profile). The maintainer will respond within 72 hours.
