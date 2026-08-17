# Handoff: Imbox performance fixes landed; ready for next task

## Branch / Worktree
- Branch: `main` at `8107163`
- Worktree: `~/sendpalm` (main working tree)
- No unmerged branches, no stashes, no remaining worktrees

## Status
- Started: 2026-08-17
- Last update: 2026-08-17
- Completion: 100%
- Committed: yes

## Done
- [x] Side panels changed from `grid-template-columns` transition to fixed overlays (no main-column reflow).
- [x] `Main.tsx` wrapped views in `KeepAlive` so tab switching no longer unmounts Imbox.
- [x] Added lightweight `listPileMessages()` query and moved Imbox piles off full `listMessages()`.
- [x] Split global refresh into `refreshTick` (hard) and `softRefreshTick` (soft); sync events use soft.
- [x] `useRefreshEffect` skips initial mount to avoid double-fetch.
- [x] Fixed rustls 0.23 startup panic by installing the `ring` CryptoProvider in `lib.rs::run()`.
- [x] Merged all work to `main`, removed the `feat/imbox-refresh-resize` worktree.
- [x] Updated `docs/PROGRESS.md` and `AGENTS.md` §11.2 with lessons.
- [x] Verification: typecheck ✅, vitest 160/160 ✅, e2e imbox 9/9 ✅, cargo test 77/77 ✅.

## Decisions
- Use `display: none` rather than SolidJS `<Show>` / `<Match>` for view preservation across tabs.
- UI piles get their own narrow DB query instead of reusing the full message list.
- Two refresh signals are preferable to one because sync events and user-initiated refresh have different costs.
- Rust TLS dependencies must have a CryptoProvider installed explicitly; relying on feature flags alone is not enough.

## Open Issues / Watch Items
- `cargo clippy` has 2 pre-existing warnings in `app/src-tauri/src/services/image_proxy.rs` (byte-char-slices and `&PathBuf` vs `&Path`). They are unrelated to the work above.
- The dev server (`pnpm tauri dev`) is **not** currently running; the last instance was cleaned up after verification. Start with `pnpm --dir app tauri dev` when needed.
- A real-mail account is configured and background sync is enabled; any backend changes will hit real IMAP/SMTP on `tauri dev` startup.

## Next Step Recommendation
1. Read this file, then `rm HANDOFF.md`.
2. Run `git status --short` and confirm the working tree is clean except for normal environment noise (`AGENTS.md`, `.gitignore`, `.claude/`, `.kimi/`, `.opencode/`, `qa-tmp/.DS_Store`).
3. Decide the next task and create a new worktree per AGENTS.md §13 if it is non-trivial.

## Key Files Touched Recently
- `app/src/components/Main.tsx`
- `app/src/views/Imbox.tsx`
- `app/src/stores/data.ts`
- `app/src/stores/ui.ts`
- `app/src/utils/gestures.ts`
- `app/src/services/sync-events.ts`
- `app/src/services/mock-db.ts`
- `app/src-tauri/src/lib.rs`
- `docs/PROGRESS.md`
- `AGENTS.md`
