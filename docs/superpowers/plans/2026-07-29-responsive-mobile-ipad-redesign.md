# SendPalm Prototype-v11 Responsive Mobile / iPad Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prototype-v11` feel native on desktop, iPhone, and iPad by adding a three-tier responsive system, HEY-style mobile interactions, and iPad-specific spacing.

**Architecture:** Keep the existing HTML skeleton and JS state machine. Extend `css/prototype-v11.css` with explicit mobile (`<768px`) and tablet (`768px–1023px`) media-query sections. Add small viewport helpers in `js/prototype-v11.js` so modal/panel open logic can branch by form factor. Verify every task with Kimi WebBridge screenshots on iPhone/iPad viewports.

**Tech Stack:** Plain HTML/CSS/JS, Phosphor Icons, Kimi WebBridge for visual verification.

## Global Constraints

- Mobile breakpoint: `< 768px` CSS pixels.
- Tablet breakpoint: `768px – 1023px` CSS pixels.
- Desktop breakpoint: `>= 1024px` CSS pixels.
- Minimum tap target on mobile: `44×44` CSS pixels.
- iPad portrait uses the tablet layout (left sidebar + tighter spacing); iPad landscape uses the desktop layout.
- No prototype-only hacks that would prevent native iOS/iPadOS replication.
- All hover-only affordances must have a tap/long-press equivalent on mobile.
- Use `100dvh` for the app height on mobile/tablet to handle Safari dynamic toolbars.

---

## File Structure

- `prototype-v11.html` — no structural changes; verify viewport meta tags.
- `css/prototype-v11.css` — add three-tier responsive sections; keep desktop styles as default.
- `js/prototype-v11.js` — add viewport helpers (`isMobile`, `isTablet`, `isDesktop`); branch panel/modal rendering for mobile; extend swipe helpers.
- `docs/superpowers/specs/2026-07-29-responsive-mobile-ipad-redesign.md` — reference spec.
- `docs/superpowers/plans/2026-07-29-responsive-mobile-ipad-redesign.md` — this plan.

---

### Task 1: Add viewport helpers and three-tier CSS scaffolding

**Files:**
- Modify: `js/prototype-v11.js` (near the top, after state declaration)
- Modify: `css/prototype-v11.css` (after the existing `@media (max-width: 768px)` block)

**Interfaces:**
- Produces: `window.isMobile()`, `window.isTablet()`, `window.isDesktop()`

- [ ] **Step 1: Add viewport helpers to JS**

Open `js/prototype-v11.js` and add the following immediately after the `state` object (around line 49):

```javascript
  function isMobile() { return window.innerWidth < 768; }
  function isTablet() { return window.innerWidth >= 768 && window.innerWidth < 1024; }
  function isDesktop() { return window.innerWidth >= 1024; }
  window.isMobile = isMobile;
  window.isTablet = isTablet;
  window.isDesktop = isDesktop;
```

- [ ] **Step 2: Add tablet media-query scaffolding to CSS**

Open `css/prototype-v11.css` and add an empty tablet section right before the existing mobile section (around line 6902):

```css
/* Tablet / iPad portrait */
@media (min-width: 768px) and (max-width: 1023px) {
  /* Task 8 will populate this section. */
}
```

- [ ] **Step 3: Verify helpers in browser console**

Run via WebBridge on the prototype page:

```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"file:///Users/edwinhao/sendpalm/prototype-v11.html","newTab":true,"group_title":"SendPalm responsive verify"},"session":"sendpalm-responsive"}'
```

Then evaluate:

```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"evaluate","args":{"code":"({m:isMobile(),t:isTablet(),d:isDesktop(),w:window.innerWidth})"},"session":"sendpalm-responsive"}'
```

Expected: helpers exist and return booleans matching the current viewport width.

- [ ] **Step 4: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat: add viewport helpers and tablet breakpoint scaffolding"
```

---

### Task 2: Refactor app grid and navigation for three breakpoints

**Files:**
- Modify: `css/prototype-v11.css` (`#app`, `#sidebar`, `#topbar`, `.nav-item`, `.topbar-compose-mobile`, `.sidebar-compose-btn`)

**Interfaces:**
- Consumes: existing grid areas (`sidebar`, `topbar`, `main`, `detail`)
- Produces: updated grid definitions for desktop, tablet, and mobile

- [ ] **Step 1: Update desktop grid**

Ensure the default `#app` (outside any media query) is:

```css
#app {
  display: grid;
  grid-template-columns: 64px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar topbar"
    "sidebar main";
  height: 100dvh;
}

#app.detail-open {
  grid-template-columns: 64px minmax(360px, 28%) 1fr;
  grid-template-areas:
    "sidebar topbar topbar"
    "sidebar main detail";
}
```

- [ ] **Step 2: Add tablet grid rules inside the tablet media query**

```css
@media (min-width: 768px) and (max-width: 1023px) {
  html, body, #app { height: 100dvh; }

  #app {
    grid-template-columns: 56px 1fr;
    grid-template-rows: 52px 1fr;
    grid-template-areas:
      "sidebar topbar"
      "sidebar main";
  }

  #app.detail-open {
    grid-template-columns: 56px 1fr 380px;
    grid-template-areas:
      "sidebar topbar topbar"
      "sidebar main detail";
  }

  #sidebar { width: 56px; padding: 10px 0; }
  .nav-item { width: 44px; height: 42px; }
  .nav-item i { font-size: 18px; }
  .nav-label { display: none; }
  .nav-section-label { display: none; }

  #topbar { height: 52px; padding: 0 18px; }
  .view { padding: 20px 24px; }
  .view-title { font-size: 24px; }
}
```

- [ ] **Step 3: Update existing mobile grid rules**

Find the existing `@media (max-width: 768px)` block. Change the `#app` block to:

```css
@media (max-width: 767px) {
  html, body, #app { height: 100dvh; }

  #app {
    grid-template-columns: 1fr;
    grid-template-rows: 52px 1fr 64px;
    grid-template-areas:
      "topbar"
      "main"
      "sidebar";
  }

  #app.detail-open {
    grid-template-columns: 1fr;
    grid-template-rows: 52px 1fr 64px;
    grid-template-areas:
      "topbar"
      "main"
      "sidebar";
  }
}
```

(The rest of the mobile rules can remain inside `max-width: 767px` or be moved; keep them for now.)

- [ ] **Step 4: Verify navigation renders correctly on each form factor**

Use WebBridge CDP to emulate viewports and screenshot:

```bash
# iPhone SE
# iPhone 15 Pro Max
# iPad mini portrait
# iPad Pro 12.9" landscape
```

For each, navigate to the prototype and take a screenshot. Expected: sidebar is bottom tab on iPhone, left rail on iPad, left rail on desktop.

- [ ] **Step 5: Commit**

```bash
git add css/prototype-v11.css
git commit -m "feat: three-tier app grid and navigation"
```

---

### Task 3: Mobile detail panel full-screen + bottom action bar

**Files:**
- Modify: `css/prototype-v11.css` (`#detail-panel`, `.panel-header`, `.panel-content`, `.panel-actions`)
- Modify: `js/prototype-v11.js` (`openMessage`, detail rendering)

**Interfaces:**
- Consumes: `isMobile()`
- Produces: full-screen detail panel on mobile; bottom action bar markup class `.panel-bottom-actions`

- [ ] **Step 1: Add mobile detail panel styles**

Inside `@media (max-width: 767px)`, ensure `#detail-panel` rules are:

```css
@media (max-width: 767px) {
  #detail-panel {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    width: 100%;
    height: 100dvh;
    z-index: 50;
    border-left: none;
    transform: translateX(100%);
    transition: transform 0.3s var(--spring);
  }

  #detail-panel.open { transform: translateX(0); }

  .panel-header {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 12px 14px;
    background: rgba(249,247,245,0.92);
    backdrop-filter: blur(20px) saturate(180%);
  }

  .panel-content {
    padding: 14px 16px calc(14px + 72px + env(safe-area-inset-bottom));
    height: 100%;
    overflow-y: auto;
  }

  .panel-bottom-actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-around;
    gap: 4px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: rgba(255,255,255,0.96);
    border-top: 1px solid var(--border);
    backdrop-filter: blur(20px) saturate(180%);
    z-index: 3;
  }

  .panel-bottom-actions .icon-btn {
    flex: 1;
    height: 44px;
    max-width: 72px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: var(--text-secondary);
  }

  .panel-bottom-actions .icon-btn i { font-size: 20px; }
}
```

- [ ] **Step 2: Render bottom action bar only on mobile**

Locate the function that renders the detail panel (likely `renderMessagePanel` or similar in `js/prototype-v11.js`). After the existing `.panel-actions` block, append a mobile-only bottom action bar if `isMobile()` is true:

```javascript
  if (isMobile()) {
    const c = getContact(m.pid);
    const bottomActions = el('div', 'panel-bottom-actions');
    const actions = [
      {
        icon: 'ph-arrow-u-up-left',
        label: 'Reply',
        action: () => {
          const subject = baseSubject(m.subj);
          const quoteHeader = 'On ' + m.tm + ', ' + (c ? c.name : m.fm) + ' <' + (c ? c.em : '') + '> wrote:';
          openComposeWithContext(c ? c.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader);
        }
      },
      { icon: 'ph-clock', label: 'Pending', action: () => { replyLaterMessage(m); closePanel(); } },
      { icon: 'ph-push-pin', label: 'Saved', action: () => { setAsideMessage(m); closePanel(); } },
      {
        icon: 'ph-arrow-fat-line-up',
        label: 'Remind',
        action: () => {
          const bubbleUpBtn = bottomActions.lastChild.previousSibling;
          const choices = [
            { label: 'Now', sub: '马上提醒', action: () => bubbleUpMessage(m, 'now') },
            { label: 'Tomorrow', sub: '明天 8:00', action: () => bubbleUpMessage(m, 'tomorrow') },
            { label: 'Next week', sub: '下周一 8:00', action: () => bubbleUpMessage(m, 'week') },
          ];
          openContextMenuFromElement(bubbleUpBtn, choices);
        }
      },
      { icon: 'ph-dots-three', label: 'More', action: (e) => showContextMenuForMessage(e, m) },
    ];
    actions.forEach(a => {
      const btn = el('button', 'icon-btn');
      btn.appendChild(icon(a.icon));
      btn.appendChild(el('span', '', a.label));
      btn.addEventListener('click', (e) => { e.stopPropagation(); a.action(e); });
      bottomActions.appendChild(btn);
    });
    panel.appendChild(bottomActions);
  }
```

Match the exact function names used in `js/prototype-v11.js` (`baseSubject`, `openComposeWithContext`, `openContextMenuFromElement`, `showContextMenuForMessage`, etc.).

- [ ] **Step 3: Verify on iPhone viewport**

Open a message in the prototype on an iPhone-sized WebBridge viewport and screenshot. Expected: detail panel fills the screen, header has a back button, bottom action bar is visible with 5 icons.

- [ ] **Step 4: Commit**

```bash
git add css/prototype-v11.css js/prototype-v11.js
git commit -m "feat: full-screen detail panel with bottom action bar on mobile"
```

---

### Task 4: Mobile compose full-screen

**Files:**
- Modify: `css/prototype-v11.css` (`#compose-modal`, `.compose-window`)
- Modify: `js/prototype-v11.js` (`openCompose`)

**Interfaces:**
- Consumes: `isMobile()`
- Produces: full-screen compose on mobile

- [ ] **Step 1: Add mobile compose styles**

Inside `@media (max-width: 767px)`:

```css
  #compose-modal {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100dvh;
    z-index: 60;
    display: flex;
    align-items: flex-end;
    background: rgba(35,28,51,0.28);
  }

  .compose-window {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    display: flex;
    flex-direction: column;
  }

  .compose-header {
    padding: 12px 14px;
    min-height: 52px;
  }

  .compose-body textarea {
    font-size: 16px; /* prevents iOS zoom on focus */
  }
```

- [ ] **Step 2: Ensure compose opens full-screen on mobile**

In `openCompose`, the modal is already shown/hidden via CSS classes. No JS change is required unless the current code opens compose as a centered modal regardless of viewport. If the existing CSS already has mobile overrides, verify they are correct.

- [ ] **Step 3: Verify on iPhone viewport**

Tap the compose button, screenshot. Expected: compose fills the screen, keyboard focus does not break layout.

- [ ] **Step 4: Commit**

```bash
git add css/prototype-v11.css
git commit -m "feat: full-screen compose on mobile"
```

---

### Task 5: Screener mobile card-stack + swipe

**Files:**
- Modify: `css/prototype-v11.css` (`.gate-view`, `.gate-card`, `.gate-actions`, mobile gate styles)
- Modify: `js/prototype-v11.js` (`renderGate`)

**Interfaces:**
- Consumes: `wrapSwipeActions`, `isMobile()`
- Produces: swipeable gate cards on mobile

- [ ] **Step 1: Add mobile gate styles**

Inside `@media (max-width: 767px)`:

```css
  .gate-view {
    padding-top: 16px;
    padding-bottom: 16px;
    justify-content: flex-start;
  }

  .gate-card-wrap {
    max-width: 100%;
    padding: 0 16px;
  }

  .gate-card {
    padding: 24px;
    border-radius: var(--radius-xl);
  }

  .gate-info {
    gap: 12px;
    margin-bottom: 20px;
  }

  .gate-avatar {
    width: 48px;
    height: 48px;
    font-size: 16px;
  }

  .gate-name { font-size: 18px; }
  .gate-subject { font-size: 15px; }
  .gate-preview { font-size: 14px; }

  .gate-actions {
    flex-direction: column;
    gap: 10px;
  }

  .gate-btn {
    padding: 14px;
    font-size: 15px;
  }
```



- [ ] **Step 2: Wrap gate card with swipe helper on mobile**

In `renderGate`, after building the `.gate-card` element, conditionally wrap it on mobile. The gate card already contains a hidden `.gate-bucket-bar` and visible `.gate-actions` (Allow / Block). For swipe, expose the bucket bar on swipe-right and block on swipe-left:

```javascript
  if (isMobile()) {
    const swipeWrap = wrapSwipeActions(card,
      () => blockSender(current.id), // swiped left
      () => {
        // swiped right: reveal bucket chooser inline
        const actions = card.querySelector('.gate-actions');
        const bucketBar = card.querySelector('.gate-bucket-bar');
        if (actions && bucketBar) {
          actions.classList.add('hidden');
          bucketBar.classList.remove('hidden');
        }
      },
      {
        leftLabel: 'Block',
        leftIcon: 'ph-prohibit',
        leftColor: 'red',
        rightLabel: 'Allow',
        rightIcon: 'ph-check',
        rightColor: 'green',
      }
    );
    cardWrap.appendChild(swipeWrap);
  } else {
    cardWrap.appendChild(card);
  }
```

- [ ] **Step 3: Verify swipe on iPhone viewport**

Open the Gate view on iPhone, swipe a card left and right, screenshot the before/after. Expected: card animates off-screen and the next card appears.

- [ ] **Step 4: Commit**

```bash
git add css/prototype-v11.css js/prototype-v11.js
git commit -m "feat: mobile gate card stack with swipe actions"
```

---

### Task 6: Feed card swipe + long-press context menu on mobile

**Files:**
- Modify: `js/prototype-v11.js` (feed card rendering functions)
- Modify: `css/prototype-v11.css` (`.feed-card-swipe-wrap`, `.swipe-bg`)

**Interfaces:**
- Consumes: `wrapSwipeActions`, `addLongPressListener`
- Produces: every feed card is swipeable and long-pressable on mobile

- [ ] **Step 1: Ensure feed cards are wrapped on mobile**

Find the function that creates feed cards (likely `renderFeedCard` or similar). The existing code may already call `wrapSwipeActions`. If not, wrap the card only when `isMobile()`:

```javascript
  // Existing code already wraps feed cards; only verify/tune the mapping:
  // swipe left  -> setAsideMessage (Saved)
  // swipe right -> replyLaterMessage (Pending)
  if (isMobile()) {
    // Optionally lower the swipe threshold for one-hand use.
    // The existing wrapSwipeActions uses 80px; on mobile 60px feels better.
    // If tuning, modify wrapSwipeActions to accept an options.threshold.
  }
```

- [ ] **Step 2: Verify long-press context menu on mobile**

The feed card code already calls `addLongPressListener(card, ...)`. Confirm the handler positions the menu within the viewport on small screens. If the context menu is clipped, update `showContextMenuForMessage` or `openContextMenu` to keep `left + width <= window.innerWidth` and `top + height <= window.innerHeight`.

- [ ] **Step 3: Verify swipe and long-press on iPhone**

Screenshot the Inbox/Stream on iPhone. Swipe a card and long-press a card. Expected: swipe reveals background actions; long-press opens the context menu.

- [ ] **Step 4: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat: mobile feed card swipe and long-press actions"
```

---

### Task 7: Mobile views — Contacts, Calendar, Files, Settings

**Files:**
- Modify: `css/prototype-v11.css` (`.people-grid`, `.calendar-*`, `.files-*`, `.settings-*` under mobile media query)

**Interfaces:**
- Consumes: existing view CSS
- Produces: mobile-optimized layouts for secondary views

- [ ] **Step 1: Contacts mobile layout**

Inside `@media (max-width: 767px)`:

```css
  .people-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    max-width: none;
  }

  .person-card { padding: 12px 16px; }
```

- [ ] **Step 2: Calendar mobile layout**

Inside `@media (max-width: 767px)`:

```css
  .calendar-view { padding: 14px 16px; }

  .calendar-day-grid,
  .calendar-week-grid,
  .calendar-year-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .calendar-day-column,
  .calendar-week-column,
  .calendar-year-month {
    width: 100%;
    min-width: auto;
  }
```

Adjust class names to match the actual calendar CSS classes in the file.

- [ ] **Step 3: Files mobile layout**

Inside `@media (max-width: 767px)`:

```css
  .files-view { padding: 14px 16px; }

  .files-table-wrap { overflow-x: auto; }

  .files-table th,
  .files-table td {
    padding: 10px 12px;
    font-size: 12px;
    white-space: nowrap;
  }
```

If the table is unusably narrow, add a card-list variant in JS as a follow-up; for this task, horizontal scroll is acceptable.

- [ ] **Step 4: Settings mobile layout**

Inside `@media (max-width: 767px)`:

```css
  .settings-view {
    max-width: none;
    padding: 0;
  }

  .settings-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: 16px;
    padding: 0 16px;
  }

  .settings-row {
    padding: 14px 0;
  }
```

- [ ] **Step 5: Verify each view on iPhone**

Navigate to Contacts, Calendar, Files, Settings in WebBridge and screenshot. Expected: no horizontal overflow, readable text, reachable tap targets.

- [ ] **Step 6: Commit**

```bash
git add css/prototype-v11.css
git commit -m "feat: mobile layouts for contacts, calendar, files, settings"
```

---

### Task 8: iPad/tablet layout polish

**Files:**
- Modify: `css/prototype-v11.css` (tablet media query)

**Interfaces:**
- Consumes: desktop styles
- Produces: tighter spacing and adjusted type for tablet

- [ ] **Step 1: Populate the tablet media query**

Inside `@media (min-width: 768px) and (max-width: 1023px)` add:

```css
  .view {
    padding: 20px 24px;
  }

  .view-title { font-size: 24px; }
  .view-subtitle { font-size: 12px; }

  .feed-list {
    max-width: none;
    gap: 16px;
  }

  .feed-card { padding: 14px 18px; }

  .people-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .stream-list {
    max-width: none;
    gap: 18px;
  }

  .stream-card { padding: 22px; }

  .settings-view {
    max-width: 560px;
    margin: 0 auto;
  }
```

- [ ] **Step 2: Verify on iPad mini portrait and iPad Pro landscape**

Use WebBridge CDP to set viewport to `768×1024` and `1024×1366`. Screenshot the Inbox. Expected: portrait shows 56px sidebar + tighter content; landscape shows full desktop layout.

- [ ] **Step 3: Commit**

```bash
git add css/prototype-v11.css
git commit -m "feat: iPad tablet layout polish"
```

---

### Task 9: WebBridge verification across devices

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: prototype-v11.html, Kimi WebBridge

- [ ] **Step 1: Capture reference screenshots on iPhone SE**

```bash
# already opened in session; use CDP to set viewport
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"cdp","args":{"method":"Emulation.setDeviceMetricsOverride","params":{"width":375,"height":667,"deviceScaleFactor":2,"mobile":true}}},"session":"sendpalm-responsive"}'
```

Refresh, then screenshot each view: Inbox, Stream, Records, Gate, Contacts, Calendar, Files, Settings, Detail, Compose.

- [ ] **Step 2: Capture screenshots on iPhone 15 Pro Max**

```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"cdp","args":{"method":"Emulation.setDeviceMetricsOverride","params":{"width":430,"height":932,"deviceScaleFactor":3,"mobile":true}}},"session":"sendpalm-responsive"}'
```

Repeat screenshots for key views.

- [ ] **Step 3: Capture screenshots on iPad mini portrait**

```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"cdp","args":{"method":"Emulation.setDeviceMetricsOverride","params":{"width":768,"height":1024,"deviceScaleFactor":2,"mobile":false}}},"session":"sendpalm-responsive"}'
```

Screenshot Inbox, Detail, Settings.

- [ ] **Step 4: Capture screenshots on iPad Pro 12.9" landscape**

```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"cdp","args":{"method":"Emulation.setDeviceMetricsOverride","params":{"width":1366,"height":1024,"deviceScaleFactor":2,"mobile":false}}},"session":"sendpalm-responsive"}'
```

Screenshot Inbox with detail panel open.

- [ ] **Step 5: Document results**

Create a short verification note in the plan or a separate `qa-tmp/responsive-verification.md` listing which views passed and which need follow-up. If all acceptance criteria from the spec are met, mark the task complete.

- [ ] **Step 6: Commit verification note**

```bash
git add qa-tmp/responsive-verification.md
git commit -m "docs: responsive verification screenshots and notes"
```

---

## Self-Review

1. **Spec coverage:**
   - Three breakpoints → Task 1 + Task 2.
   - Mobile bottom tab bar → Task 2.
   - Full-screen detail + bottom action bar → Task 3.
   - Full-screen compose → Task 4.
   - Screener swipe → Task 5.
   - Feed card swipe/long-press → Task 6 (already implemented; Task 6 verifies/tunes it).
   - Contacts/Calendar/Files/Settings mobile → Task 7.
   - iPad tablet layout → Task 8.
   - WebBridge verification → Task 9.
   - Native-app replicability constraint → addressed by using standard CSS grid/flex and semantic DOM; no prototype-only hacks are introduced.

2. **Placeholder scan:** No TBD/TODO/"implement later" found.

3. **Type consistency:** All function names reference existing helpers (`wrapSwipeActions`, `addLongPressListener`, `replyLaterMessage`, `setAsideMessage`, etc.) which must be matched to the actual names in `js/prototype-v11.js` during implementation.
