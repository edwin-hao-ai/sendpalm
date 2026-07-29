# SendPalm Prototype-v11 Responsive Mobile / iPad Redesign

> Goal: make prototype-v11 feel native and complete on desktop, iPhone, and iPad, while staying faithful to HEY's interaction patterns.  
> Constraint: this prototype will become a real app, so every responsive decision must be replicable in native iOS / iPadOS / desktop code.

---

## 1. Context

- Current prototype (`prototype-v11.html` + `css/prototype-v11.css` + `js/prototype-v11.js`) is already polished on desktop.
- It has only **one** responsive breakpoint at `max-width: 768px`, which converts the left sidebar into a bottom tab bar and makes the detail panel a full-screen overlay.
- The mobile pass is incomplete: several views (Contacts, Calendar, Files, Settings, Compose, Agent panel) still borrow desktop layouts, touch targets are not consistent, and there is no iPad-specific treatment.
- HEY's mobile app is the reference: full-screen reading, bottom action bars, swipe-heavy Screener, and a minimal top/bottom chrome.

---

## 2. Design Decisions

### 2.1 Breakpoints

| Name | Width | Targets |
|------|-------|---------|
| Mobile | `< 768px` | iPhone SE / mini / Pro / Pro Max |
| Tablet | `768px – 1023px` | iPad mini, iPad Air portrait, iPad 10.9" portrait |
| Desktop | `>= 1024px` | iPad landscape, Mac, external monitors |

- Use **CSS pixels**, not physical pixels. The existing `meta viewport` is already correct.
- iPad in landscape falls into Desktop; iPad in portrait falls into Tablet. Orientation change must be handled without a full reload.

### 2.2 Layout per Form Factor

**Desktop (`>= 1024px`)**
- Keep the current grid: `64px sidebar | topbar | main`, with optional detail drawer.
- Detail panel: slide-in drawer from the right, `minmax(360px, 28%)`.
- No changes to the desktop experience except bug fixes.

**Tablet (`768px – 1023px`)**
- Keep the **left sidebar** (icon-only rail) because the user explicitly wants iPad to feel like the desktop layout.
- Reduce content padding from `32px 40px` to `20px 24px`.
- Reduce type scale slightly (e.g. view title from `28px` to `24px`).
- Detail panel remains a slide-out drawer, but max-width capped at `50%` to avoid an overly wide sheet.
- Topbar stays, but the centered search/logo area is allowed to collapse to a title when space is tight.

**Mobile (`< 768px`)**
- Convert layout to a native-app shell:
  - `topbar` (52px + safe-area-inset-top)
  - `main` (scrollable content)
  - `sidebar` becomes a bottom tab bar (64px + safe-area-inset-bottom)
- Hide the desktop sidebar compose button; expose a floating compose action in the topbar (already partially implemented as `.topbar-compose-mobile`).
- All overlay panels (detail, compose, agent, notifications, command palette) become full-screen or bottom-sheet.
- Use `100dvh` for the app height to handle Safari's dynamic toolbars.

### 2.3 Navigation

**Mobile bottom tab bar**
- 5 slots: Gate, Inbox, Stream, Records, More.
- Gate shows a badge count of unscreened senders.
- Inbox shows a badge count of unread "New for You" emails.
- More opens a menu or switches to a tools view containing Contacts, Calendar, Files, Settings, Trash, Spam.
- Active item uses a pill background (`accent-soft`) and accent icon color, same as desktop.
- Remove the left-edge active indicator (`::before`) on mobile.
- Tap feedback: `scale(0.94)` + background tint.

**Tablet/Desktop sidebar**
- Keep existing 64px rail.
- On tablet, optionally collapse section labels (`Tools`, `Trash`) to save vertical space when the rail height is limited.

### 2.4 Detail / Reading View (HEY-style)

**Mobile**
- Full-screen overlay (`position: fixed; inset: 0; z-index: 50`).
- Header: back arrow + sender name + actions (⋮).
- Content scrolls under a translucent blurred header.
- Fixed bottom action bar with primary actions:
  - Reply
  - Pending
  - Saved
  - Remind
  - More (context menu)
- Bottom action bar provides the primary actions; optional swipe gestures mirror the feed-list convention.
- Long-press on the header row opens the context menu.

**Tablet**
- Slide-in drawer from the right, 380px–50% width.
- Bottom action bar is optional; can keep inline action buttons if the panel is wide enough.

**Desktop**
- Current drawer behavior unchanged.

### 2.5 Screener (Gate)

**Mobile**
- Card-stack layout: one card at a time, centered, with generous vertical padding.
- Swipe right = allow → reveal bucket buttons (Inbox / Stream / Records) inline below the card.
- Swipe left = block → card flies off left, next card animates in.
- Buttons at the bottom remain for accessibility: "Allow" and "Block".
- Use the existing `wrapSwipeActions` helper, but tune thresholds for one-hand use (threshold 60px, max drag 120px).

**Tablet/Desktop**
- Keep the existing centered card with explicit buttons.

### 2.6 Compose

**Mobile**
- Full-screen modal with a navigation-style header:
  - Cancel / Title (New message) / Send
  - To / Subject fields stacked vertically
  - Body fills remaining space
  - Keyboard-aware: when the on-screen keyboard appears, the body area must shrink; avoid content being hidden behind the keyboard.

**Tablet**
- Centered modal, 90% width / 90% height, max-width 640px.

**Desktop**
- Current centered modal unchanged.

### 2.7 Touch Targets & Gestures

- Minimum tap target: **44×44 CSS px** everywhere.
- Feed cards must support:
  - Tap to open detail.
  - Swipe right → Saved.
  - Swipe left → Pending.
  - Long press → context menu.
- Avoid hover-only affordances on mobile. Every hover-revealed action must also be reachable via tap/long-press.
- Prevent swipe collisions with horizontal scroll inside feed cards (e.g. inline action chips).

### 2.8 Agent Panel & Notifications

**Mobile**
- Agent FAB moves up to avoid the bottom tab bar (bottom: 80px + safe-area).
- Agent panel becomes a bottom sheet that fills 80–90% of the screen.
- Notification panel becomes a dropdown anchored to the topbar, full width on small screens.

**Tablet**
- Agent panel stays as a fixed right-side card but is narrower (300px).
- Notifications stay as a topbar dropdown.

### 2.9 Calendar, Files, Contacts, Settings

**Mobile**
- Calendar: switch day/week/year views to a vertical stack; hide complex grid when width is insufficient; use full-screen event sheet.
- Files: convert table to a card list (one file per row/card); tap opens detail sheet.
- Contacts: single-column people grid; tap opens detail sheet.
- Settings: single-column, full-width rows, grouped cards stacked vertically.

**Tablet**
- Calendar: keep grid but reduce column padding.
- Files: keep table but allow horizontal scroll if needed.
- Contacts: 2-column grid.
- Settings: unchanged single-column centered layout.

---

## 3. Implementation Strategy

1. **Adopt a three-tier media-query architecture.**
   - `@media (max-width: 767px)` for mobile.
   - `@media (min-width: 768px) and (max-width: 1023px)` for tablet.
   - Default styles remain desktop.
2. **Keep the existing HTML skeleton.** The `#app` grid will be redefined per breakpoint using CSS only.
3. **Extend JavaScript helpers rather than rewrite.**
   - Reuse `wrapSwipeActions` for feed cards and Screener.
   - Add a `isMobile()` / `isTablet()` utility for logic that needs to differ (e.g. full-screen compose vs. centered modal).
4. **Avoid prototype-only shortcuts that break native replication.**
   - No viewport-unit tricks that depend on desktop browser chrome.
   - No CSS-only content that would need to be rebuilt differently in SwiftUI/UIKit.
   - Use standard flex/grid layouts and semantic DOM so the same structure maps to native stacks.
5. **Test with Kimi WebBridge.**
   - Open `prototype-v11.html` in a real browser.
   - Use CDP to emulate iPhone SE, iPhone 15 Pro Max, iPad mini, iPad Pro dimensions.
   - Screenshot each view and compare against HEY patterns.
   - Verify rotation and safe-area behavior.

---

## 4. Files to Change

- `css/prototype-v11.css` — add three-tier responsive sections and fix existing mobile overrides.
- `js/prototype-v11.js` — add viewport helpers, adjust compose/detail/agent open logic for mobile, extend swipe helpers.
- `prototype-v11.html` — no structural changes expected; verify viewport meta tags.
- `docs/superpowers/specs/2026-07-29-responsive-mobile-ipad-redesign.md` — this document.

---

## 5. Acceptance Criteria

- [ ] Mobile bottom tab bar renders correctly and all tabs navigate.
- [ ] Detail panel is full-screen on mobile and slide-out on tablet/desktop.
- [ ] Compose is full-screen on mobile, centered modal on tablet/desktop.
- [ ] Screener supports swipe left/right on mobile.
- [ ] Feed cards support swipe actions and long-press context menu on mobile.
- [ ] Calendar, Files, Contacts, Settings are usable on mobile without horizontal scrolling.
- [ ] iPad portrait uses tablet layout (sidebar + tighter spacing).
- [ ] iPad landscape uses desktop layout.
- [ ] All tap targets are at least 44×44 CSS px on mobile.
- [ ] WebBridge screenshots confirm the design on iPhone and iPad viewports.
- [ ] No prototype-only hacks that would prevent native app replication.

---

## 6. Open Questions / Notes

- Target native stack is not yet specified. The spec assumes iOS/iPadOS native widgets can replicate the same flex/grid structure and gesture handlers.
- Dark mode on mobile is out of scope for this pass; the existing light palette remains.
- Offline/PWA behavior is out of scope; only layout and interaction are covered.
