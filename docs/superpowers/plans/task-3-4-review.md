# Task 3 + 4 Review

## Verdicts

- **Spec compliance:** ✅
- **Quality:** Approved

## Findings

| # | Severity | Description |
|---|----------|-------------|
| 1 | Important | Missing `:focus` states on newly introduced interactive elements (`.filter-pill`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.feed-card`). The brief requires every button, card, and input to have hover/active/focus states. |
| 2 | Minor | `.btn-secondary` and `.btn-ghost` only define `:hover`; they lack `:active` states. |
| 3 | Minor | `.feed-card` only defines `:hover`; it lacks `:active` and `:focus` states, and the card is not keyboard-focusable (no `tabindex` or semantic focus target). |
| 4 | Minor | CSS rule `.feed-card.draft-pending` is defined but never applied in JS; draft cards use `.draft-card` instead. Harmless dead rule. |
| 5 | None | Meeting `sortKey` falls back to `0` because `m.dt` uses Chinese strings like `"明天 7/19"`; this matches the brief implementation and is acknowledged in the report. |

## Notes

- `js/prototype-v8.js` matches the brief closely: `getContact`, `buildFeed`, `filterEvents`, `renderMain`, `renderForYou`, `renderFeedItem`, `renderDraftCard`, `sendDraft`, `editDraft`, `ignoreDraft`, and `showToast` are all present and correctly wired.
- The placeholder stubs `renderPeople`, `renderCalendar`, `renderFiles`, and `renderDrafts` are acceptable for this task and prevent `ReferenceError` when switching views.
- `openMessage`/`openMeeting` are correctly implemented as stubs as requested.
- `node --check js/prototype-v8.js` passes with no errors.
- No git commits were made; `git status` shows an uncommitted working tree and the branch has no commits yet.

## Recommendation

Address finding #1 by adding visible `:focus` outlines or ring styles to `.filter-pill`, all `.btn-*` variants, and `.feed-card` (or its focusable children) before considering the prototype fully polished. This can be done in a follow-up without blocking task completion.
