# P1 核心编辑闭环 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SendPalm prototype-v11 补齐联系人、会议、任务、草稿、账户/个人资料的创建与编辑表单，使核心实体可维护。

**Architecture:** 在现有原生 DOM + `renderMain()` 架构上增加可复用的表单工具函数与 HEY 风格卡片 modal；所有状态仍保存在内存 `D.*` / `state.*` 中，无 API 层。

**Tech Stack:** Vanilla JS, CSS (prototype-v11.css), HTML modal containers, in-memory data.

## Global Constraints

- 继续用 `el()` 辅助函数创建 DOM，不用框架。
- 所有 modal 支持 `Esc`、点击遮罩、`×` 关闭。
- 移动端 modal 全屏，底部固定操作栏。
- 表单风格：大疏单栏、label 在上、iOS toggle、主按钮右下、危险操作左下。
- 删除操作必须二次确认。
- 每完成一个任务需通过 WebBridge 截图 + 运行时错误检查验证。

---

## Task 0: 共享表单基础设施

**Files:**
- Modify: `js/prototype-v11.js`（顶部工具函数区）
- Modify: `css/prototype-v11.css`
- Test: WebBridge screenshot of a dummy modal

**Interfaces:**
- Consumes: existing `el()`, `icon()`, `renderMain()`, `showToast()`
- Produces: `openModalCard(opts)`, `renderFormGroup(label, input, hint)`, `renderToggle(label, checked, onChange)`, `renderPillInput(value, options, onChange)`, `confirmDestructive(message, onConfirm)`

- [ ] **Step 1: Add shared modal/form helpers to `js/prototype-v11.js`**

Insert near the top with other helpers (after `el()` / `icon()` definitions):

```js
function elAttr(tag, className, attrs, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function openModalCard(opts) {
  const modal = document.getElementById('compose-modal');
  modal.innerHTML = '';
  modal.classList.remove('hidden', 'minimized');
  const overlay = el('div', 'modal-card-overlay');
  overlay.addEventListener('click', () => closeCompose());
  const card = el('div', 'modal-card' + (window.innerWidth < 640 ? ' modal-card-fullscreen' : ''));
  const header = el('div', 'modal-card-header');
  header.appendChild(el('h2', 'modal-card-title', opts.title || ''));
  const closeBtn = el('button', 'modal-card-close', '×');
  closeBtn.addEventListener('click', () => closeCompose());
  header.appendChild(closeBtn);
  card.appendChild(header);
  const body = el('div', 'modal-card-body');
  if (opts.renderBody) opts.renderBody(body);
  card.appendChild(body);
  if (opts.renderActions) {
    const actions = el('div', 'modal-card-actions');
    opts.renderActions(actions);
    card.appendChild(actions);
  }
  modal.appendChild(overlay);
  modal.appendChild(card);
  requestAnimationFrame(() => modal.classList.add('open'));
}

function renderFormGroup(label, input, hint) {
  const group = el('div', 'form-group');
  group.appendChild(el('label', 'form-label', label));
  group.appendChild(input);
  if (hint) group.appendChild(el('div', 'form-hint', hint));
  return group;
}

function renderToggle(label, checked, onChange) {
  const row = el('label', 'form-toggle-row');
  const text = el('span', 'form-toggle-label', label);
  const track = el('span', 'form-toggle' + (checked ? ' on' : ''));
  const thumb = el('span', 'form-toggle-thumb');
  track.appendChild(thumb);
  row.appendChild(text);
  row.appendChild(track);
  row.addEventListener('click', () => {
    const next = !track.classList.contains('on');
    track.classList.toggle('on', next);
    onChange(next);
  });
  return row;
}

function renderPillInput(values, options, onChange) {
  const wrap = el('div', 'pill-input');
  const selected = new Set(values || []);
  const list = el('div', 'pill-input-list');
  function refresh() {
    list.innerHTML = '';
    options.forEach(opt => {
      const pill = el('button', 'pill' + (selected.has(opt.id) ? ' active' : ''), opt.name);
      pill.type = 'button';
      pill.addEventListener('click', () => {
        if (selected.has(opt.id)) selected.delete(opt.id);
        else selected.add(opt.id);
        refresh();
        onChange(Array.from(selected));
      });
      list.appendChild(pill);
    });
  }
  refresh();
  wrap.appendChild(list);
  return wrap;
}

function confirmDestructive(message, onConfirm) {
  openModalCard({
    title: 'Are you sure?',
    renderBody: (body) => body.appendChild(el('p', '', message)),
    renderActions: (actions) => {
      const cancel = el('button', 'btn-secondary', 'Cancel');
      cancel.addEventListener('click', () => closeCompose());
      const del = el('button', 'btn-danger', 'Delete');
      del.addEventListener('click', () => { closeCompose(); onConfirm(); });
      actions.appendChild(cancel);
      actions.appendChild(del);
    }
  });
}
```

- [ ] **Step 2: Add CSS classes to `css/prototype-v11.css`**

Append to file:

```css
/* HEY-style modal card */
.modal-card-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 1000;
}
.modal-card {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -48%);
  width: 540px; max-width: calc(100vw - 32px); max-height: 86vh;
  background: #fff; border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,0.18);
  display: flex; flex-direction: column; z-index: 1001;
  opacity: 0; transition: opacity 180ms ease, transform 180ms ease;
}
.modal-card.visible { opacity: 1; transform: translate(-50%, -50%); }
.modal-card-fullscreen { width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; border-radius: 0; top: 0; left: 0; transform: none; }
.modal-card-fullscreen.visible { transform: none; }
.modal-card-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-card-title { font-size: 22px; font-weight: 700; margin: 0; }
.modal-card-close { background: none; border: none; font-size: 26px; color: #6b7280; cursor: pointer; }
.modal-card-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
.modal-card-actions { display: flex; justify-content: space-between; gap: 12px; padding: 16px 24px 20px; border-top: 1px solid #e5e7eb; }

/* Form stack */
.form-stack { display: flex; flex-direction: column; gap: 18px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 13px; font-weight: 600; color: #374151; text-transform: none; }
.form-group input[type="text"], .form-group input[type="email"], .form-group input[type="tel"], .form-group input[type="url"], .form-group input[type="date"], .form-group input[type="time"], .form-group select, .form-group textarea {
  height: 44px; padding: 0 14px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 16px; background: #fff; width: 100%; box-sizing: border-box;
}
.form-group textarea { height: auto; min-height: 100px; padding: 12px 14px; resize: vertical; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #3B8058; box-shadow: 0 0 0 3px rgba(59,128,88,0.12); }
.form-hint { font-size: 12px; color: #6b7280; }

/* Toggle */
.form-toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
.form-toggle-label { font-size: 15px; color: #111827; }
.form-toggle { width: 44px; height: 26px; border-radius: 13px; background: #d1d5db; position: relative; transition: background 160ms ease; }
.form-toggle.on { background: #3B8058; }
.form-toggle-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; position: absolute; top: 2px; left: 2px; transition: transform 160ms ease; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.form-toggle.on .form-toggle-thumb { transform: translateX(18px); }

/* Pills */
.pill-input-list { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { padding: 6px 12px; border-radius: 999px; border: 1px solid #d1d5db; background: #fff; font-size: 13px; color: #374151; cursor: pointer; }
.pill.active { background: #3B8058; color: #fff; border-color: #3B8058; }

/* Buttons */
.btn-primary { padding: 10px 18px; border-radius: 10px; border: none; background: #3B8058; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-secondary { padding: 10px 18px; border-radius: 10px; border: 1px solid #d1d5db; background: #fff; color: #374151; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-danger { padding: 10px 18px; border-radius: 10px; border: none; background: #DC2626; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-text { background: none; border: none; color: #3B8058; font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; }
.btn-icon { background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.dynamic-list { display: flex; flex-direction: column; gap: 4px; }
.dynamic-field-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.dynamic-field-row input { flex: 1; }
.dynamic-field-row select { width: 100px; }
```

- [ ] **Step 3: Verify modal opens without runtime errors**

Open browser at `http://localhost:8765/prototype-v11.html?v=11.25` and run in console:

```js
openModalCard({ title: 'Test', renderBody: b => b.appendChild(el('p', '', 'Hello')) });
```

Expected: centered modal card appears, no console errors.

- [ ] **Step 4: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(forms): shared modal card, form group, toggle, pill input helpers"
```

---

## Task 1: 编辑联系人表单

**Files:**
- Modify: `js/prototype-v11.js` — add `openContactModal(contactId)`
- Modify: `js/prototype-v11.js` — add context menu item and detail panel button
- Modify: `prototype-data.js` — ensure `D.labels` exists and contacts have needed fields
- Test: WebBridge screenshot of contact create/edit/delete

**Interfaces:**
- Consumes: `openModalCard`, `renderFormGroup`, `renderPillInput`, `confirmDestructive`
- Produces: `openContactModal(contactId)` (contactId null for create)

- [ ] **Step 1: Add `openContactModal` implementation**

Insert in `js/prototype-v11.js` near other modal openers:

```js
function openContactModal(contactId) {
  const isNew = !contactId;
  const contact = isNew ? {
    id: 'c' + Date.now(), firstName: '', lastName: '', nickname: '',
    company: '', title: '', emails: [], phones: [], stage: 'explore',
    labels: [], topics: [], notes: '', avatar: '', health: 50
  } : D.contacts.find(c => c.id === contactId);
  if (!contact) return;

  let emails = (contact.emails || []).map(e => ({ ...e }));
  let phones = (contact.phones || []).map(p => ({ ...p }));
  let labels = new Set(contact.labels || []);
  let stage = contact.stage || 'explore';

  function renderEmailRow(e, idx, list, container) {
    const row = el('div', 'dynamic-field-row');
    const val = elAttr('input', '', { type: 'email', value: e.value, placeholder: 'email@example.com' });
    val.addEventListener('input', () => { e.value = val.value; });
    const tag = el('select', '');
    ['work', 'personal', 'other'].forEach(t => {
      const opt = document.createElement('option'); opt.value = t; opt.text = t; if (e.label === t) opt.selected = true; tag.appendChild(opt);
    });
    tag.addEventListener('change', () => { e.label = tag.value; });
    const remove = el('button', 'btn-icon', '×');
    remove.addEventListener('click', () => { list.splice(idx, 1); renderBody(); });
    row.appendChild(val); row.appendChild(tag); row.appendChild(remove);
    container.appendChild(row);
  }

  // Rebuild body on dynamic list change
  function renderBody() {
    body.innerHTML = '';
    const stack = el('div', 'form-stack');
    const nameRow = el('div', 'form-row');
    const first = elAttr('input', '', { type: 'text', value: contact.firstName || '', placeholder: 'First name' });
    first.addEventListener('input', () => contact.firstName = first.value);
    const last = elAttr('input', '', { type: 'text', value: contact.lastName || '', placeholder: 'Last name' });
    last.addEventListener('input', () => contact.lastName = last.value);
    nameRow.appendChild(renderFormGroup('First name', first));
    nameRow.appendChild(renderFormGroup('Last name', last));
    stack.appendChild(nameRow);

    const nick = elAttr('input', '', { type: 'text', value: contact.nickname || '' });
    nick.addEventListener('input', () => contact.nickname = nick.value);
    stack.appendChild(renderFormGroup('Nickname', nick));

    const comp = elAttr('input', '', { type: 'text', value: contact.company || '', list: 'company-list' });
    comp.addEventListener('input', () => contact.company = comp.value);
    stack.appendChild(renderFormGroup('Company', comp));

    const title = elAttr('input', '', { type: 'text', value: contact.title || '' });
    title.addEventListener('input', () => contact.title = title.value);
    stack.appendChild(renderFormGroup('Title', title));

    const emailsGroup = el('div', 'form-group');
    emailsGroup.appendChild(el('label', 'form-label', 'Emails'));
    const emailsList = el('div', 'dynamic-list');
    emails.forEach((e, i) => renderEmailRow(e, i, emails, emailsList));
    const addEmail = el('button', 'btn-text', '+ Add email');
    addEmail.addEventListener('click', () => { emails.push({ value: '', label: 'work' }); renderBody(); });
    emailsGroup.appendChild(emailsList); emailsGroup.appendChild(addEmail);
    stack.appendChild(emailsGroup);

    const stageSelect = el('select', '');
    const stages = [
      { id: 'explore', name: '探索' }, { id: 'build', name: '建立' },
      { id: 'active', name: '活跃' }, { id: 'maintain', name: '维护' },
      { id: 'cold', name: '冷淡' }, { id: 'rekindle', name: '重新激活' }
    ];
    stages.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.text = s.name; if (s.id === stage) opt.selected = true; stageSelect.appendChild(opt); });
    stageSelect.addEventListener('change', () => stage = stageSelect.value);
    stack.appendChild(renderFormGroup('Relationship stage', stageSelect));

    const labelPills = renderPillInput(Array.from(labels), D.labels || [], (vals) => { labels = new Set(vals); });
    stack.appendChild(renderFormGroup('Labels', labelPills));

    const topics = elAttr('input', '', { type: 'text', value: (contact.topics || []).join(', ') });
    topics.addEventListener('input', () => contact.topics = topics.value.split(',').map(t => t.trim()).filter(Boolean));
    stack.appendChild(renderFormGroup('Topics', topics, 'Comma separated'));

    const notes = el('textarea', ''); notes.value = contact.notes || '';
    notes.addEventListener('input', () => contact.notes = notes.value);
    stack.appendChild(renderFormGroup('Notes', notes));

    body.appendChild(stack);
  }

  let body;
  openModalCard({
    title: isNew ? 'New contact' : 'Edit contact',
    renderBody: (b) => { body = b; renderBody(); },
    renderActions: (actions) => {
      if (!isNew) {
        const del = el('button', 'btn-danger', 'Delete');
        del.addEventListener('click', () => confirmDestructive(`Delete ${contact.firstName} ${contact.lastName}? This cannot be undone.`, () => {
          D.contacts = D.contacts.filter(c => c.id !== contact.id);
          D.tasks = D.tasks.filter(t => t.linkedContact !== contact.id);
          if (state.selectedContactId === contact.id) state.selectedContactId = null;
          renderMain(); showToast('Contact deleted');
        }));
        actions.appendChild(del);
      } else {
        actions.appendChild(el('span', ''));
      }
      const cancel = el('button', 'btn-secondary', 'Cancel');
      cancel.addEventListener('click', () => closeCompose());
      const save = el('button', 'btn-primary', 'Save');
      save.addEventListener('click', () => {
        contact.emails = emails.filter(e => e.value.trim());
        contact.phones = phones.filter(p => p.value.trim());
        contact.labels = Array.from(labels);
        contact.stage = stage;
        contact.name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.nickname || 'Unnamed';
        if (isNew) D.contacts.unshift(contact);
        closeCompose(); renderMain(); showToast(isNew ? 'Contact created' : 'Contact saved');
      });
      actions.appendChild(cancel);
      actions.appendChild(save);
    }
  });
}
```

- [ ] **Step 2: Wire entry points**

1. In contact context menu (search for contact context menu code), add item `Edit` that calls `openContactModal(contactId)`.
2. In `renderContactPanel`, add an "Edit" button in the header that calls `openContactModal(state.selectedContactId)`.
3. In `renderPeople`, add a "New contact" button in the view header.

- [ ] **Step 3: Ensure data shape**

In `prototype-data.js`, make sure each contact has:
- `firstName`, `lastName`, `nickname`, `company`, `title`
- `emails: [{ value, label }]`
- `phones: [{ value, label }]`
- `stage: 'active'` etc.
- `labels: ['label-id']`
- `topics: ['Q4 contract']`

Add `D.labels = [...]` with at least 6 labels and colors.

- [ ] **Step 4: Test via WebBridge**

Navigate to Contacts, click New contact, fill and save, verify contact appears. Then edit a contact and delete one. Check `window.__errors` empty.

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(contacts): create, edit, delete contact modal"
```

---

## Task 2: 编辑会议/事件表单

**Files:**
- Modify: `js/prototype-v11.js` — update `openEventModal` to support editing
- Modify: `js/prototype-v11.js` — add Edit button in `renderMeetingPanel`
- Test: WebBridge screenshot of create/edit event

**Interfaces:**
- Consumes: `openModalCard`, `renderFormGroup`, `renderPillInput`, `renderToggle`
- Produces: `openEventModal({ eventId, slot })` (eventId null for create)

- [ ] **Step 1: Refactor `openEventModal` to accept options**

Change signature from `openSometimeModal(slot)` / `openEventModal(slot)` to `openEventModal({ eventId, slot })`.
If `eventId` provided, load event from `D.events`. Otherwise create new with defaults from `slot`.

- [ ] **Step 2: Add all spec fields to event modal body**

Use `renderFormGroup` for:
- Title (text)
- Location (text)
- Video link (text)
- All day (toggle)
- Date (date input)
- Start / End (time inputs, hidden when all-day)
- People (multi-select contact pills via `renderPillInput`)
- Color dots (6 color buttons)
- Reminder (select)
- Description (textarea)
- Linked task (select with option to create new)

- [ ] **Step 3: Save / delete logic**

On save: assign generated id if new, push or replace in `D.events`, close modal, `renderMain()`, toast.
On delete (only edit mode): confirmDestructive, remove from `D.events`, clean `D.tasks` linkedEvent, renderMain.

- [ ] **Step 4: Wire entry points**

Add "Edit" button in `renderMeetingPanel` header calling `openEventModal({ eventId: meeting.id })`.
Ensure Calendar click still creates new event.

- [ ] **Step 5: Test and commit**

```bash
git add js/prototype-v11.js
git commit -m "feat(calendar): edit and delete event modal"
```

---

## Task 3: 新建/编辑任务与跟进表单

**Files:**
- Modify: `js/prototype-v11.js` — add `openTaskModal(taskId, defaults)`
- Modify: `js/prototype-v11.js` — replace `prompt()` calls in Bubble Up / Sometime / time tracking
- Modify: `js/prototype-v11.js` — add "Add follow-up" buttons in contact/meeting panels and agent right panel
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `openModalCard`, `renderFormGroup`, `renderPillInput`
- Produces: `openTaskModal(taskId, defaults)`

- [ ] **Step 1: Add `openTaskModal`**

Fields: title, related to (select), related entity (dependent select), due date, due time, priority, status, recurrence, description.

```js
function openTaskModal(taskId, defaults = {}) {
  const isNew = !taskId;
  const task = isNew ? {
    id: 't' + Date.now(), title: '', relatedType: defaults.relatedType || 'none',
    relatedId: defaults.relatedId || null, dueDate: '', dueTime: '',
    priority: 'medium', status: 'todo', recurrence: 'none', description: ''
  } : D.tasks.find(t => t.id === taskId);
  // ... render form ...
}
```

- [ ] **Step 2: Replace `prompt()` calls**

Find `openSometimeModal`, `prompt()` in calendar-related functions. Replace with `openTaskModal(null, { relatedType: 'event', relatedId: ... })`.

- [ ] **Step 3: Add entry points**

- Contact detail: "Add follow-up" → `openTaskModal(null, { relatedType: 'contact', relatedId: contact.id })`
- Meeting detail: "Add follow-up" → `openTaskModal(null, { relatedType: 'event', relatedId: meeting.id })`
- Agent right panel: "New task" → `openTaskModal()`

- [ ] **Step 4: Test and commit**

```bash
git add js/prototype-v11.js
git commit -m "feat(tasks): create and edit task modal, replace prompt"
```

---

## Task 4: 手动草稿表单

**Files:**
- Modify: `js/prototype-v11.js` — add `openDraftModal(draftId)`
- Modify: `js/prototype-v11.js` — add "New draft" buttons in Inbox / Drafts
- Modify: `js/prototype-v11.js` — add "Save as draft" in message detail
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: existing compose rendering logic
- Produces: `openDraftModal(draftId)`

- [ ] **Step 1: Add `openDraftModal`**

Reuse `renderComposeWindow` structure but target `D.drafts` with `source: 'manual'`.
Fields: from, to/cc/bcc, subject, body, attachments, link to session/task.

- [ ] **Step 2: Add entry points**

- Inbox header: "New draft"
- Drafts view header: "New draft"
- Message detail actions: "Save as draft"
- Agent draft card: "Edit manually"

- [ ] **Step 3: Test and commit**

```bash
git add js/prototype-v11.js prototype-data.js
git commit -m "feat(drafts): manual draft create and edit modal"
```

---

## Task 5: 账户与个人资料设置

**Files:**
- Modify: `js/prototype-v11.js` — expand `renderSettings`
- Modify: `prototype-data.js` — add `D.accounts`, `D.user`
- Modify: `css/prototype-v11.css` — settings cards
- Test: WebBridge screenshot of Settings tabs

**Interfaces:**
- Consumes: `renderFormGroup`, `renderToggle`
- Produces: editable settings sections

- [ ] **Step 1: Split Settings into tabs**

In `renderSettings`, add tabs: Profile / Accounts / Preferences / Agent / Labels / Data / Shortcuts.
For P1 only implement Profile, Accounts, Preferences, Agent.

- [ ] **Step 2: Profile section**

Fields: display name, avatar URL, timezone, language, signature. Save to `D.user`.

- [ ] **Step 3: Accounts section**

Render `D.accounts` as cards with status, reconnect/disconnect/sync buttons. Add "Add account" flow with simulated OAuth wizard.

- [ ] **Step 4: Preferences section**

Convert existing static toggles to interactive using `renderToggle`. Add quiet hours selects.

- [ ] **Step 5: Agent behavior section**

Default tone, length, auto-task level selects. Save to `D.agentMemory` or `D.user.agentPrefs`.

- [ ] **Step 6: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(settings): editable profile, accounts, preferences, agent behavior"
```

---

## P1 验收

- [ ] All P1 tasks committed.
- [ ] WebBridge screenshots: Contacts create/edit, Calendar event edit, Task create, Draft create, Settings profile/accounts.
- [ ] Runtime error tracker empty on each view.
- [ ] No tracked source files left uncommitted.
