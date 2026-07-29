# HEY-Inspired Desktop Client UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Relay v9 from a web-like prototype into a polished, native-feeling desktop email client by adopting HEY's decision flows, bottom action bars, and restrained animations, adapted to a desktop shell.

**Architecture:** Keep the existing single-page HTML/JS prototype structure (`prototype-v9.html`, `js/prototype-v9.js`, `css/prototype-v9.css`, `prototype-data.js`). Introduce a right-hand detail panel, a fixed bottom action bar inside that panel, single-card Gate triage, and keyboard shortcuts. All state remains in the existing `state` object; no new build tools or frameworks.

**Tech Stack:** Vanilla HTML5, CSS3, ES6 (IIFE), Phosphor Icons, no build step.

## Global Constraints
- QA command must pass after every task: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
- Keep all strings in Chinese (UI labels) as already established in v9.
- Use `-apple-system` / `SF Pro` system fonts; accent color stays `#007aff`.
- Every interactive element must have a visible hover/focus/active state.
- Animations must be 150–250 ms and use `var(--ease-out)` or `var(--spring)`.
- Do not introduce external dependencies not already in `prototype-v9.html`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prototype-v9.html` | App shell: titlebar, topbar, sidebar, main, detail panel, modals. |
| `css/prototype-v9.css` | All visual styles, animations, layout grid, component styles. |
| `js/prototype-v9.js` | All rendering, state, event handling, keyboard shortcuts. |
| `prototype-data.js` | Demo data: contacts, messages, files, meetings, settings. |
| `qa-tmp/render-v9.test.js` | Existing QA test: renders each view without errors. |

---

### Task 1: Layout Shell — Right Detail Panel

**Files:**
- Modify: `prototype-v9.html`
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: existing `#app` grid.
- Produces: `#app.detail-open` class toggled by JS; `#detail-panel` visible/hidden.

- [ ] **Step 1: Add detail panel to HTML**

In `prototype-v9.html`, change `<aside id="detail-panel" class="hidden"></aside>` to a richer panel with a close button and content area:

```html
<aside id="detail-panel" class="hidden">
  <div class="detail-panel-header">
    <button id="detail-close" class="icon-btn" title="Close"><i class="ph ph-x"></i></button>
  </div>
  <div id="detail-content"></div>
  <div id="detail-actions"></div>
</aside>
```

- [ ] **Step 2: Add CSS for detail-open layout**

In `css/prototype-v9.css`, update the `#app.detail-open` grid:

```css
#app.detail-open {
  grid-template-columns: 64px minmax(360px, 28%) 1fr;
  grid-template-areas:
    "titlebar titlebar titlebar"
    "topbar topbar topbar"
    "sidebar main detail";
}

#detail-panel {
  grid-area: detail;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-left: 1px solid var(--border);
  overflow: hidden;
  transform: translateX(20px);
  opacity: 0;
  transition: transform 0.2s var(--ease-out), opacity 0.2s var(--ease-out);
}

#detail-panel:not(.hidden) {
  transform: translateX(0);
  opacity: 1;
}

.detail-panel-header {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

#detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

#detail-actions {
  border-top: 1px solid var(--border);
  padding: 12px 16px;
  background: var(--surface-2);
}
```

- [ ] **Step 3: Wire close button and Escape**

In `js/prototype-v9.js`, add a helper function and event listener:

```javascript
function closeDetailPanel() {
  state.selectedMessageId = null;
  state.selectedContactId = null;
  state.selectedFileId = null;
  state.selectedMeetingId = null;
  document.getElementById('app').classList.remove('detail-open');
  document.getElementById('detail-panel').classList.add('hidden');
}

document.getElementById('detail-close').addEventListener('click', closeDetailPanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetailPanel();
});
```

- [ ] **Step 4: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 2: Gate — Single-Card Decision Flow

**Files:**
- Modify: `js/prototype-v9.js` (`renderGate`)
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: `D.contacts` filtered by `firstSeen && !screened && !blocked`.
- Produces: `screenSender(pid, bucket)`, `blockSender(pid)` already exist; add animation classes.

- [ ] **Step 1: Rewrite `renderGate` for single-card focus**

Replace the current list rendering with a single active card:

```javascript
function renderGate() {
  const container = el('div', 'view gate-view');
  const newSenders = D.contacts.filter(c => c.firstSeen && !c.screened && !c.blocked);

  if (newSenders.length === 0) {
    const empty = renderEmpty('没有新联系人在等待。Gate 很干净。', 'ph-funnel');
    empty.className += ' gate-empty';
    container.appendChild(empty);
    return container;
  }

  const intro = el('div', 'gate-intro');
  intro.appendChild(el('p', 'gate-intro-text', '以下联系人第一次给你发邮件。由你决定是否接收。'));
  container.appendChild(intro);

  const current = newSenders[0];
  const sampleMsg = D._msgs.find(m => m.pid === current.id);

  const cardWrap = el('div', 'gate-card-wrap');
  const card = el('div', 'gate-card');

  const info = el('div', 'gate-info');
  info.appendChild(renderAvatar(current, 'gate-avatar', current.name[0]));
  const text = el('div', 'gate-text');
  const nameRow = el('div', 'gate-name-row');
  nameRow.appendChild(el('span', 'gate-name', current.name));
  nameRow.appendChild(el('span', 'gate-email', '<' + current.em + '>'));
  text.appendChild(nameRow);
  if (current.co) text.appendChild(el('div', 'gate-co', current.co));
  if (sampleMsg) {
    text.appendChild(el('div', 'gate-subject', sampleMsg.subj));
    text.appendChild(el('div', 'gate-preview', sampleMsg.prev));
  }
  info.appendChild(text);
  card.appendChild(info);

  const actions = el('div', 'gate-actions');
  const yesBtn = el('button', 'gate-btn gate-yes');
  yesBtn.innerHTML = '<i class="ph ph-thumbs-up"></i><span>允许</span>';
  const noBtn = el('button', 'gate-btn gate-no');
  noBtn.innerHTML = '<i class="ph ph-thumbs-down"></i><span>屏蔽</span>';

  const bucketBar = el('div', 'gate-bucket-bar hidden');
  ['imbox', 'feed', 'paperTrail'].forEach(bucket => {
    const b = el('button', 'gate-bucket-btn');
    b.innerHTML = '<i class="ph ph-' + (bucket === 'imbox' ? 'tray' : bucket === 'feed' ? 'newspaper' : 'receipt') + '"></i><span>' + bucketLabel(bucket) + '</span>';
    b.addEventListener('click', () => {
      card.classList.add('gate-out-yes');
      setTimeout(() => { screenSender(current.id, bucket); }, 220);
    });
    bucketBar.appendChild(b);
  });

  yesBtn.addEventListener('click', () => {
    actions.classList.add('hidden');
    bucketBar.classList.remove('hidden');
  });

  noBtn.addEventListener('click', () => {
    card.classList.add('gate-out-no');
    setTimeout(() => { blockSender(current.id); }, 220);
  });

  actions.appendChild(yesBtn);
  actions.appendChild(noBtn);
  card.appendChild(actions);
  card.appendChild(bucketBar);

  cardWrap.appendChild(card);
  container.appendChild(cardWrap);

  const historyLink = el('button', 'gate-history-link', '查看 Gate 历史');
  historyLink.addEventListener('click', () => setView('screenerHistory'));
  container.appendChild(historyLink);

  return container;
}
```

Add helper `bucketLabel` if not present.

- [ ] **Step 2: Add Gate CSS**

```css
.gate-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 48px;
}

.gate-intro {
  text-align: center;
  max-width: 520px;
  margin-bottom: 32px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.55;
}

.gate-card-wrap {
  width: 100%;
  max-width: 560px;
  perspective: 1000px;
}

.gate-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 32px;
  box-shadow: var(--shadow-md);
  transition: transform 0.22s var(--ease-out), opacity 0.22s var(--ease-out);
}

.gate-card.gate-out-yes {
  transform: translateX(120%) rotate(4deg);
  opacity: 0;
}

.gate-card.gate-out-no {
  transform: translateX(-120%) rotate(-4deg);
  opacity: 0;
}

.gate-info {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.gate-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}

.gate-name { font-size: 20px; font-weight: 700; }
.gate-email { font-size: 13px; color: var(--text-secondary); }
.gate-co { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; }
.gate-subject { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
.gate-preview { font-size: 14px; color: var(--text-secondary); line-height: 1.5; }

.gate-actions {
  display: flex;
  gap: 12px;
}

.gate-actions.hidden,
.gate-bucket-bar.hidden { display: none; }

.gate-bucket-bar {
  display: flex;
  gap: 10px;
  animation: gate-bar-in 0.2s var(--ease-out);
}

@keyframes gate-bar-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.gate-btn, .gate-bucket-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s, background 0.15s, border-color 0.15s;
}

.gate-btn:hover, .gate-bucket-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.gate-btn:active, .gate-bucket-btn:active { transform: scale(0.97); }

.gate-yes { color: var(--accent); }
.gate-yes:hover { background: var(--accent-soft); border-color: var(--accent); }

.gate-no { color: var(--text-muted); }

.gate-bucket-btn { color: var(--text-primary); }

.gate-history-link {
  margin-top: 24px;
  font-size: 13px;
  color: var(--accent);
  background: transparent;
  border: none;
  cursor: pointer;
}

.gate-history-link:hover { text-decoration: underline; }

.gate-empty {
  margin-top: 80px;
}
```

- [ ] **Step 3: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 3: Inbox — New For You / Previously Seen

**Files:**
- Modify: `js/prototype-v9.js` (`renderImbox` or current bucket rendering)
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: `getCurrentViewEvents()` already splits new/seen.
- Produces: `renderImbox()` returns a view with two sections.

- [ ] **Step 1: Create `renderImbox` function**

Add a dedicated Inbox renderer (currently Inbox uses `renderBucket`). Replace the `renderMain` branch for `imbox` to call `renderImbox()`.

```javascript
function renderImbox() {
  const container = el('div', 'view imbox-view');
  const allEvents = filterFeedEvents(buildFeed()).filter(e => isInBucketView(e, 'imbox'));
  const newForYou = allEvents.filter(e => e.type === 'message' && !e.data.seen).sort((a, b) => priorityScore(b) - priorityScore(a));
  const previouslySeen = allEvents.filter(e => e.type === 'message' && e.data.seen).sort((a, b) => b.sortKey - a.sortKey);

  const list = el('div', 'feed-list');

  if (newForYou.length === 0 && previouslySeen.length === 0) {
    list.appendChild(renderEmpty('你的 Inbox 是空的。', 'ph-tray'));
  }

  if (newForYou.length > 0) {
    const header = el('div', 'feed-section-header');
    header.innerHTML = '<span class="feed-section-title">New for you</span>';
    const powerBtn = el('button', 'feed-section-action', '批量处理');
    powerBtn.addEventListener('click', () => {
      state.focusReplyOpen = true;
      state.focusReplyIndex = 0;
      renderMain();
    });
    header.appendChild(powerBtn);
    list.appendChild(header);
    newForYou.forEach((ev, idx) => list.appendChild(renderFeedItem(ev, 'imbox', idx)));
  }

  if (previouslySeen.length > 0) {
    const header = el('div', 'feed-section-header previously-seen');
    header.innerHTML = '<span class="feed-section-title">Previously seen</span>';
    list.appendChild(header);
    previouslySeen.forEach((ev, idx) => list.appendChild(renderFeedItem(ev, 'imbox', idx + newForYou.length)));
  }

  container.appendChild(list);
  return container;
}
```

Update `renderMain`:

```javascript
if (state.view === 'imbox') {
  viewEl = renderImbox();
}
```

- [ ] **Step 2: Polish Inbox row CSS**

Make `.feed-card` more compact and desktop-like. Add hover quick actions.

```css
.feed-list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feed-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  position: relative;
}

.feed-card:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

.feed-card.cursor {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.feed-card.unread::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.feed-card.unread { padding-left: 20px; }

.feed-card-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.feed-card-body { flex: 1; min-width: 0; }
.feed-card-name { font-size: 14px; font-weight: 700; }
.feed-card-email { font-size: 12px; color: var(--text-secondary); margin-left: 6px; }
.feed-card-subject { font-size: 13px; font-weight: 600; margin-top: 2px; }
.feed-card-preview {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.feed-card-time {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.feed-card-actions {
  display: none;
  gap: 4px;
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.feed-card:hover .feed-card-actions { display: flex; }
.feed-card:hover .feed-card-time { opacity: 0; }
```

- [ ] **Step 3: Update `renderFeedItem` to support hover actions**

Modify `renderFeedItem` to add the action row with Reply Later / Set Aside / Bubble Up / Archive, and add unread class.

- [ ] **Step 4: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 4: Reading Email — Detail Panel with Bottom Action Bar

**Files:**
- Modify: `js/prototype-v9.js`
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: `openMessage(message)`.
- Produces: detail panel populated with header, body, attachments, bottom actions.

- [ ] **Step 1: Implement `openMessage` and `renderMessageDetail`**

```javascript
function openMessage(m) {
  state.selectedMessageId = m.id;
  document.getElementById('app').classList.add('detail-open');
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  renderMessageDetail(m);
}

function renderMessageDetail(m) {
  const content = document.getElementById('detail-content');
  const actions = document.getElementById('detail-actions');
  content.innerHTML = '';
  actions.innerHTML = '';

  const contact = getContact(m.pid);

  const header = el('div', 'detail-message-header');
  header.appendChild(renderAvatar(contact, 'detail-message-avatar', contact ? contact.name[0] : '?'));
  const meta = el('div', 'detail-message-meta');
  meta.appendChild(el('div', 'detail-message-name', contact ? contact.name : m.fm));
  meta.appendChild(el('div', 'detail-message-email', contact ? contact.em : m.fm));
  header.appendChild(meta);
  header.appendChild(el('div', 'detail-message-time', m.tm));
  content.appendChild(header);

  content.appendChild(el('h1', 'detail-message-subject', m.subj));

  const body = el('div', 'detail-message-body');
  formatMessageBody(m).split(/\n\s*\n/).forEach(p => {
    const trimmed = p.trim();
    if (!trimmed) return;
    body.appendChild(el('p', '', trimmed));
  });
  content.appendChild(body);

  if (m.at && m.at.length) {
    const attachWrap = el('div', 'detail-message-attachments');
    m.at.forEach(name => {
      const a = el('button', 'detail-attachment');
      a.innerHTML = '<i class="ph ph-paperclip"></i><span>' + name + '</span>';
      a.addEventListener('click', () => showToast('Opened ' + name));
      attachWrap.appendChild(a);
    });
    content.appendChild(attachWrap);
  }

  actions.appendChild(createDetailAction('ph-arrow-u-up-left', 'Reply', () => {
    const subject = baseSubject(m.subj);
    const quoteHeader = 'On ' + m.tm + ', ' + (contact ? contact.name : m.fm) + ' wrote:';
    openComposeWithContext(contact ? contact.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader);
  }));
  actions.appendChild(createDetailAction('ph-clock', 'Pending', () => replyLaterMessage(m)));
  actions.appendChild(createDetailAction('ph-push-pin', 'Saved', () => setAsideMessage(m)));
  actions.appendChild(createDetailAction('ph-arrow-fat-line-up', 'Remind', (btn) => openBubbleUpPopover(btn, m)));
  actions.appendChild(createDetailAction('ph-dots-three', 'More', (btn) => openMessageMorePopover(btn, m)));
}

function createDetailAction(iconName, label, onClick) {
  const btn = el('button', 'detail-action-btn');
  btn.innerHTML = '<i class="ph ' + iconName + '"></i><span>' + label + '</span>';
  btn.addEventListener('click', (e) => onClick(btn));
  return btn;
}
```

- [ ] **Step 2: Add CSS for detail message and action bar**

```css
.detail-message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.detail-message-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.detail-message-meta { flex: 1; }
.detail-message-name { font-size: 15px; font-weight: 700; }
.detail-message-email { font-size: 12px; color: var(--text-secondary); }
.detail-message-time { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

.detail-message-subject {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 20px;
  line-height: 1.2;
}

.detail-message-body {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
}

.detail-message-body p { margin-bottom: 14px; }

.detail-message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

.detail-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 12px;
  cursor: pointer;
}

.detail-attachment:hover { background: var(--bg-hover); }

#detail-actions {
  display: flex;
  gap: 8px;
}

.detail-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.12s;
}

.detail-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.detail-action-btn:active { transform: scale(0.97); }

.detail-action-btn i { font-size: 15px; }
```

- [ ] **Step 3: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 5: Popovers — Bubble Up & More

**Files:**
- Modify: `js/prototype-v9.js`
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: existing `openContextMenu`.
- Produces: `openBubbleUpPopover(btn, message)` and `openMessageMorePopover(btn, message)`.

- [ ] **Step 1: Implement Bubble Up popover**

```javascript
function openBubbleUpPopover(anchor, m) {
  const rect = anchor.getBoundingClientRect();
  const items = [
    { label: 'Now', sub: '马上', action: () => bubbleUpMessage(m, 'now') },
    { label: 'Later today', sub: '今天晚些', action: () => bubbleUpMessage(m, 'later') },
    { label: 'Tomorrow', sub: '明天 8am', action: () => bubbleUpMessage(m, 'tomorrow') },
    { label: 'Next week', sub: '下周一 8am', action: () => bubbleUpMessage(m, 'week') },
    { label: 'Pick a date…', sub: '', action: () => showToast('Date picker') },
  ];
  openPopover(rect.left + rect.width / 2, rect.top, items, 'bubble-up-popover');
}

function openMessageMorePopover(anchor, m) {
  const rect = anchor.getBoundingClientRect();
  const items = [
    { label: 'Forward', icon: 'ph-arrow-u-right-up', action: () => showToast('Forward') },
    { label: 'Label…', icon: 'ph-tag', action: () => showToast('Label') },
    { type: 'divider' },
    { label: 'Move to Inbox', icon: 'ph-tray', action: () => moveMessageToBucket(m, 'imbox') },
    { label: 'Move to Stream', icon: 'ph-newspaper', action: () => moveMessageToBucket(m, 'feed') },
    { label: 'Move to Records', icon: 'ph-receipt', action: () => moveMessageToBucket(m, 'paperTrail') },
    { type: 'divider' },
    { label: 'Trash', icon: 'ph-trash', action: () => { m.archived = true; showToast('Moved to trash'); renderMain(); } },
    { label: 'Mark unseen', icon: 'ph-eye-slash', action: () => { m.seen = false; showToast('Marked unseen'); renderMain(); } },
  ];
  openContextMenu(rect.left, rect.top, items);
}
```

- [ ] **Step 2: Add popover CSS**

Style context menus to feel like HEY's blue popovers but match Relay's palette:

```css
#context-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  min-width: 180px;
  z-index: 100;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

#context-menu:not(.hidden) {
  opacity: 1;
  transform: translateY(0);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.context-item:hover { background: var(--bg-hover); }
.context-divider { height: 1px; background: var(--border); margin: 6px 0; }
```

- [ ] **Step 3: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 6: Keyboard Shortcuts

**Files:**
- Modify: `js/prototype-v9.js`
- Test: manual + `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: `setView`, `openCompose`, `archiveMessage`, etc.
- Produces: global `keydown` handler.

- [ ] **Step 1: Add global keyboard handler**

```javascript
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  const key = e.key.toLowerCase();
  const ctrlOrMeta = e.ctrlKey || e.metaKey;

  if (ctrlOrMeta) {
    if (key === '1') { e.preventDefault(); setView('imbox'); }
    if (key === '2') { e.preventDefault(); setView('feed'); }
    if (key === '3') { e.preventDefault(); setView('paperTrail'); }
    if (key === '4') { e.preventDefault(); setView('screener'); }
    if (key === '5') { e.preventDefault(); setView('replyLater'); }
    if (key === '6') { e.preventDefault(); setView('setAside'); }
    if (key === '7') { e.preventDefault(); setView('contacts'); }
    if (key === 'k') { e.preventDefault(); toggleCommandPalette(); }
    if (key === 'n') { e.preventDefault(); openCompose(); }
  } else {
    if (key === 'e') {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') archiveMessage(ev.data);
    }
    if (key === 'r') {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') openMessage(ev.data);
    }
    if (key === 'l') {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') replyLaterMessage(ev.data);
    }
    if (key === 's') {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') setAsideMessage(ev.data);
    }
    if (key === 'b') {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') bubbleUpMessage(ev.data, 'tomorrow');
    }
    if (key === 'arrowdown') {
      e.preventDefault();
      const events = getCurrentViewEvents();
      state.cursorIndex = Math.min(state.cursorIndex + 1, events.length - 1);
      renderMain();
      scrollCursorIntoView();
    }
    if (key === 'arrowup') {
      e.preventDefault();
      state.cursorIndex = Math.max(state.cursorIndex - 1, 0);
      renderMain();
      scrollCursorIntoView();
    }
    if (key === 'enter' && state.cursorIndex >= 0) {
      const ev = getCurrentViewEvents()[state.cursorIndex];
      if (ev && ev.type === 'message') openMessage(ev.data);
    }
  }
});
```

- [ ] **Step 2: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 7: Contacts Detail Mission Control

**Files:**
- Modify: `js/prototype-v9.js` (`renderPeopleDetail` or existing contact detail)
- Modify: `css/prototype-v9.css`
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- Consumes: `openContactDetail(contact)`.
- Produces: detail panel with contact action bar + timeline.

- [ ] **Step 1: Implement contact detail in right panel**

When a contact is selected, open the detail panel and render:
- Header: large avatar, name, company/title, email.
- Action bar: Notify / Deliver to / Autofile / Add note.
- Tabs: Timeline / Emails / Files / Meetings.
- Timeline: chronological mixed events.

- [ ] **Step 2: Add contact detail CSS**

```css
.detail-contact-header {
  text-align: center;
  padding: 24px 0;
  border-bottom: 1px solid var(--border);
}

.detail-contact-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  margin: 0 auto 12px;
}

.detail-contact-name { font-size: 20px; font-weight: 700; }
.detail-contact-co { font-size: 13px; color: var(--text-secondary); }
.detail-contact-email { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.detail-contact-actions {
  display: flex;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.detail-contact-action {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.detail-contact-action:hover { background: var(--bg-hover); color: var(--text-primary); }
.detail-contact-action i { font-size: 18px; }
```

- [ ] **Step 3: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 8: Visual Polish & Empty States

**Files:**
- Modify: `css/prototype-v9.css`
- Modify: `js/prototype-v9.js` (empty states)
- Test: `qa-tmp/render-v9.test.js`

**Interfaces:**
- All views.

- [ ] **Step 1: Unify empty states**

Make `renderEmpty` produce a centered card with icon, headline, and optional action.

- [ ] **Step 2: Audit and replace text-only buttons with icon+label**

Search for buttons without icons in main actions; add Phosphor icons.

- [ ] **Step 3: Tighten spacing, shadows, radius**

Audit CSS for inconsistent shadows/radius; converge to design tokens.

- [ ] **Step 4: Run QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

### Task 9: Final Integration & Manual Smoke Test

**Files:**
- All of the above.

- [ ] **Step 1: Open `prototype-v9.html` in browser**

Use `python3 -m http.server 8000` or `npx serve` and open `http://localhost:8000/prototype-v9.html`.

- [ ] **Step 2: Smoke test checklist**
- [ ] Gate shows one card; Yes reveals bucket choices; No blocks and animates out.
- [ ] Inbox shows New for you and Previously seen sections.
- [ ] Clicking a message opens detail panel from right with bottom action bar.
- [ ] Reply, Pending, Saved, Remind, More all work.
- [ ] Bubble Up popover appears and selecting a time updates the message.
- [ ] Escape closes detail panel.
- [ ] Keyboard shortcuts switch views.
- [ ] Contacts open in detail panel with action bar.
- [ ] Empty states look polished.

- [ ] **Step 3: Final QA**

Run: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`
Expected: PASS

---

## Spec Coverage

| Spec Section | Task |
|--------------|------|
| Layout shell | Task 1 |
| Gate single-card flow | Task 2 |
| Inbox New/Previously seen | Task 3 |
| Reading email + bottom action bar | Task 4 |
| Bubble Up & More popovers | Task 5 |
| Keyboard shortcuts | Task 6 |
| Contacts Mission Control | Task 7 |
| Visual polish / empty states | Task 8 |
| Integration test | Task 9 |

## Placeholder Scan

- No "TBD", "TODO", or "implement later".
- No vague "add validation" steps.
- All file paths are exact.
- All functions referenced are defined within the plan or existing codebase.
