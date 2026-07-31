(function() {
  'use strict';

  const state = {
    view: 'imbox',
    peopleFilter: 'all',
    contactTab: 'Timeline',
    selectedContactId: null,
    selectedMessageId: null,
    selectedMeetingId: null,
    agentOpen: false,
    notificationsOpen: false,
    composeOpen: false,
    searchQuery: '',
    searchFilter: 'all',
    selectedSearchResult: null,
    peopleGroupBy: 'all',
    selectedCompanyName: null,
    companyTab: 'People',
    calendarView: 'day',
    calendarSelected: new Date(2026, 6, 20),
    calendarWeekStart: new Date(2026, 6, 13),
    calendarYearAnchor: new Date(2026, 6, 1),
    calendarDayLabels: {},
    calendarDayPhotos: {},
    calendarDayCircled: {},
    calendarDayNotes: {},
    calendarHabits: [],
    calendarSometime: [],
    calendarTimeTracking: [],
    calendarFilter: 'all',
    filesFilter: 'all',
    selectedFileId: null,
    filters: {},
    prepChecked: {},
    settings: D.appSettings,
    settingsTab: 'profile',
    feedOffset: 0,
    feedPageSize: 20,
    messageViewMode: 'rendered',
    expandedThreadMessages: new Set(),
    expandedStreamMessages: new Set(),
    expandedPile: null,
    focusReplyOpen: false,
    focusReplyIndex: 0,
    focusReplyCompletedIds: new Set(),
    readTogetherOpen: false,
    readTogetherIndex: 0,
    cursorIndex: -1,
    selectedIds: new Set(),
    expandedDraftId: null,
    draftingMessageId: null,
    searchOpen: false,
    contactThreadFilter: 'all',
    loading: true,
    agentSessions: JSON.parse(JSON.stringify(D.agentSessions || [])),
    currentAgentSessionId: (D.agentSessions && D.agentSessions[0] && D.agentSessions[0].id) || null,
    agentMemory: D.agentMemory || { global: {}, contacts: {} },
    onboardingStep: localStorage.getItem('sendpalm-onboarding') ? null : 0,
    onboardingCompleted: !!localStorage.getItem('sendpalm-onboarding'),
  };

  let onboardingProgressInterval = null;

  // Task 2 data upgrade: canonical event/task arrays (alias legacy _meetings so existing views keep working).
  D.events = D.events || D._meetings || [];
  D.tasks = D.tasks || [];

  function isMobile() { return window.innerWidth < 768; }
  function isTablet() { return window.innerWidth >= 768 && window.innerWidth < 1024; }
  function isDesktop() { return window.innerWidth >= 1024; }
  window.isMobile = isMobile;
  window.isTablet = isTablet;
  window.isDesktop = isDesktop;
  window.state = state;

  const navSections = [
    {
      label: '',
      items: [
        { id: 'screener', label: 'Gate', icon: 'ph-funnel', hint: '⌘1' },
        { id: 'imbox', label: 'Inbox', icon: 'ph-tray', hint: '⌘2' },
        { id: 'feed', label: 'Stream', icon: 'ph-newspaper', hint: '⌘3' },
        { id: 'paperTrail', label: 'Records', icon: 'ph-receipt', hint: '⌘4' },
      ]
    },
    {
      label: 'Tools',
      items: [
        { id: 'contacts', label: 'Contacts', icon: 'ph-users', hint: '⌘5' },
        { id: 'calendar', label: 'Calendar', icon: 'ph-calendar', hint: '⌘6' },
        { id: 'files', label: 'Files', icon: 'ph-files', hint: '⌘7' },
        { id: 'insights', label: 'Insights', icon: 'ph-chart-bar', hint: '⌘8' },
        { id: 'agent', label: 'Agent', icon: 'ph-sparkle', hint: '⌘9' },
      ]
    },
    {
      label: 'Trash',
      items: [
        { id: 'trash', label: 'Trash', icon: 'ph-trash' },
        { id: 'spam', label: 'Spam', icon: 'ph-warning-circle' },
      ]
    },
  ];

  const allNavItems = navSections.flatMap(s => s.items);

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function icon(name) {
    const i = el('i', 'ph ' + name);
    return i;
  }

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

  function renderToggle(label, checked, onChange, desc) {
    const row = el('label', 'form-toggle-row');
    const textWrap = el('span', 'form-toggle-text-wrap');
    textWrap.appendChild(el('span', 'form-toggle-label', label));
    if (desc) textWrap.appendChild(el('span', 'form-toggle-desc', desc));
    const track = el('span', 'form-toggle' + (checked ? ' on' : ''));
    const thumb = el('span', 'form-toggle-thumb');
    track.appendChild(thumb);
    row.appendChild(textWrap);
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

  // Advanced filters
  function getFilters(viewId) {
    if (!state.filters[viewId]) state.filters[viewId] = {};
    return state.filters[viewId];
  }

  function activeFilterCount(viewId) {
    const f = getFilters(viewId);
    let count = 0;
    if (f.dateFrom) count++;
    if (f.dateTo) count++;
    if (f.channels && f.channels.length) count++;
    if (f.contacts && f.contacts.length) count++;
    if (f.unread) count++;
    if (f.hasAttachment) count++;
    if (f.followedUp) count++;
    if (f.sort && f.sort !== 'newest') count++;
    return count;
  }

  function renderMoreFiltersButton(viewId) {
    const btn = el('button', 'filter-pill filter-more-btn');
    btn.type = 'button';
    btn.appendChild(icon('ph-sliders-horizontal'));
    btn.appendChild(el('span', '', 'More filters'));
    const count = activeFilterCount(viewId);
    if (count > 0) {
      btn.classList.add('active');
      btn.appendChild(el('span', 'filter-count', String(count)));
    }
    btn.addEventListener('click', () => openFilterPanel(viewId));
    return btn;
  }

  function renderMoreFiltersHeaderAction(viewId) {
    const btn = el('button', 'view-header-action');
    btn.type = 'button';
    btn.appendChild(icon('ph-sliders-horizontal'));
    btn.appendChild(el('span', '', 'More filters'));
    const count = activeFilterCount(viewId);
    if (count > 0) btn.appendChild(el('span', 'filter-count', String(count)));
    btn.addEventListener('click', () => openFilterPanel(viewId));
    return btn;
  }

  function openFilterPanel(viewId) {
    const f = JSON.parse(JSON.stringify(getFilters(viewId)));
    f.channels = f.channels || [];
    f.contacts = f.contacts || [];
    f.sort = f.sort || 'newest';

    function update(key, value) {
      f[key] = value;
    }

    openModalCard({
      title: 'More filters',
      renderBody: (body) => renderFilterPanelBody(viewId, f, update, body),
      renderActions: (actions) => {
        const clear = el('button', 'btn btn-text', 'Clear all');
        clear.addEventListener('click', () => {
          state.filters[viewId] = { sort: 'newest' };
          closeCompose();
          renderMain();
        });
        const apply = el('button', 'btn btn-primary', 'Apply');
        apply.addEventListener('click', () => {
          state.filters[viewId] = JSON.parse(JSON.stringify(f));
          closeCompose();
          renderMain();
        });
        actions.appendChild(clear);
        actions.appendChild(apply);
      }
    });
  }

  function renderFilterPanelBody(viewId, f, update, body) {
    // Date range
    const fromInput = elAttr('input', 'form-input', { type: 'date' });
    fromInput.value = f.dateFrom || '';
    fromInput.addEventListener('change', (e) => update('dateFrom', e.target.value));
    body.appendChild(renderFormGroup('From date', fromInput));

    const toInput = elAttr('input', 'form-input', { type: 'date' });
    toInput.value = f.dateTo || '';
    toInput.addEventListener('change', (e) => update('dateTo', e.target.value));
    body.appendChild(renderFormGroup('To date', toInput));

    // Channel (Inbox only)
    if (viewId === 'imbox') {
      const channelOptions = [
        { id: 'email', name: 'Email' },
        { id: 'slack', name: 'Slack' },
        { id: 'wechat', name: 'WeChat' },
        { id: 'calendar', name: 'Calendar' },
      ];
      body.appendChild(renderFormGroup('Channel', renderPillInput(f.channels, channelOptions, (v) => update('channels', v))));
    }

    // Contacts
    const contactOptions = D.contacts
      .filter((c) => c.name)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((c) => ({ id: c.id, name: c.name }));
    body.appendChild(renderFormGroup('Contacts', renderPillInput(f.contacts, contactOptions, (v) => update('contacts', v))));

    // Status toggles
    body.appendChild(el('div', 'form-label', 'Status'));
    body.appendChild(renderToggle('Unread only', !!f.unread, (v) => update('unread', v)));
    body.appendChild(renderToggle('Has attachment', !!f.hasAttachment, (v) => update('hasAttachment', v)));
    body.appendChild(renderToggle('Followed up', !!f.followedUp, (v) => update('followedUp', v)));

    // Sort
    const sortSelect = elAttr('select', 'form-input', {});
    [
      { id: 'newest', label: 'Newest first' },
      { id: 'oldest', label: 'Oldest first' },
      { id: 'most_relevant', label: 'Most relevant' },
    ].forEach((opt) => {
      const option = elAttr('option', '', { value: opt.id }, opt.label);
      if (f.sort === opt.id) option.selected = true;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener('change', (e) => update('sort', e.target.value));
    body.appendChild(renderFormGroup('Sort', sortSelect));
  }

  function applyImboxFilters(events) {
    const f = getFilters('imbox');
    const channelMap = {
      email: ['Gmail'],
      slack: ['Slack'],
      wechat: ['WeChat'],
      calendar: ['Calendar'],
    };
    const selectedChannels = f.channels || [];
    const selectedContacts = new Set(f.contacts || []);
    let fromTime = f.dateFrom ? new Date(f.dateFrom).getTime() : null;
    let toTime = f.dateTo ? new Date(f.dateTo).getTime() : null;
    if (toTime) {
      const end = new Date(toTime);
      end.setHours(23, 59, 59, 999);
      toTime = end.getTime();
    }

    let result = events.filter((e) => {
      if (fromTime && e.sortKey < fromTime) return false;
      if (toTime && e.sortKey > toTime) return false;

      if (selectedContacts.size) {
        const pid = e.type === 'message' ? e.data.pid : (e.data.pids && e.data.pids[0]);
        if (!selectedContacts.has(pid)) return false;
      }

      if (selectedChannels.length) {
        if (e.type === 'meeting') {
          if (!selectedChannels.includes('calendar')) return false;
        } else {
          const ch = e.data.ch;
          const matches = selectedChannels.some((id) => (channelMap[id] || []).includes(ch));
          if (!matches) return false;
        }
      }

      const m = e.data;
      if (f.unread && (e.type !== 'message' || m.seen)) return false;
      if (f.hasAttachment && (e.type !== 'message' || !(m.at && m.at.length))) return false;
      if (f.followedUp && (e.type !== 'message' || m.fl !== 'done')) return false;

      return true;
    });

    const sort = f.sort || 'newest';
    if (sort === 'oldest') {
      result.sort((a, b) => a.sortKey - b.sortKey);
    } else if (sort === 'most_relevant') {
      result.sort((a, b) => priorityScore(b) - priorityScore(a));
    } else {
      result.sort((a, b) => b.sortKey - a.sortKey);
    }
    return result;
  }

  function applyContactsAdvancedFilters(contacts) {
    const f = getFilters('contacts');
    const selectedContacts = new Set(f.contacts || []);
    const from = f.dateFrom ? new Date(f.dateFrom) : null;
    const to = f.dateTo ? new Date(f.dateTo) : null;
    if (to) to.setHours(23, 59, 59, 999);

    let result = contacts.filter((c) => {
      if (selectedContacts.size && !selectedContacts.has(c.id)) return false;

      if (from || to) {
        const d = c.firstContact ? new Date(c.firstContact) : null;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }

      if (f.unread && !D._msgs.some((m) => m.pid === c.id && !m.seen)) return false;
      if (f.hasAttachment &&
        !D._msgs.some((m) => m.pid === c.id && m.at && m.at.length) &&
        !D._files.some((file) => file.pid === c.id)) return false;
      if (f.followedUp && !D._msgs.some((m) => m.pid === c.id && m.fl === 'done')) return false;

      return true;
    });

    const sort = f.sort || 'newest';
    if (sort === 'oldest') {
      result.sort((a, b) => (a.firstContact || '').localeCompare(b.firstContact || ''));
    } else if (sort === 'most_relevant') {
      result.sort((a, b) => (b.sc || 0) - (a.sc || 0));
    } else {
      result.sort((a, b) => (b.firstContact || '').localeCompare(a.firstContact || ''));
    }
    return result;
  }

  function applyFilesAdvancedFilters(files) {
    const f = getFilters('files');
    const selectedContacts = new Set(f.contacts || []);
    const from = f.dateFrom ? new Date(f.dateFrom) : null;
    const to = f.dateTo ? new Date(f.dateTo) : null;
    if (to) to.setHours(23, 59, 59, 999);

    let result = files.filter((fi) => {
      if (selectedContacts.size && !selectedContacts.has(fi.pid)) return false;

      if (from || to) {
        const d = fi.dt ? new Date(fi.dt) : null;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }

      return true;
    });

    const sort = f.sort || 'newest';
    if (sort === 'oldest') {
      result.sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
    } else if (sort === 'most_relevant') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      result.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
    }
    return result;
  }

  function meetingSortKey(m) {
    const d = parseMeetingDate(m.dt);
    if (!d) return 0;
    const t = parseMeetingTime(m);
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (t) date.setHours(Math.floor(t.start / 60), t.start % 60);
    return date.getTime();
  }

  function meetingRelevanceScore(m) {
    let score = 0;
    if (m.post) score += 40;
    if (m.prep && m.prep.length) score += 30;
    if (m.notes) score += 15;
    const pids = m.pids || [];
    if (pids.length > 2) score += 15;
    else if (pids.length > 1) score += 8;
    const title = (m.title || '').toLowerCase();
    const keywords = ['sync', 'review', 'demo', 'client', 'board', 'exec', 'kickoff', 'all-hands', '1:1', 'briefing'];
    if (keywords.some(k => title.includes(k))) score += 12;
    if (m.br) score += 5;
    return score;
  }

  function applyCalendarAdvancedFilters(meetings) {
    const f = getFilters('calendar');
    const selectedContacts = new Set(f.contacts || []);
    const from = f.dateFrom ? new Date(f.dateFrom) : null;
    const to = f.dateTo ? new Date(f.dateTo) : null;
    if (to) to.setHours(23, 59, 59, 999);

    const result = meetings.filter((m) => {
      if (selectedContacts.size && !(m.pids || []).some((id) => selectedContacts.has(id))) return false;

      if (from || to) {
        const d = parseMeetingDate(m.dt);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }

      if (f.followedUp && !m.post) return false;

      return true;
    });

    const sort = f.sort || 'newest';
    if (sort === 'oldest') {
      return [...result].sort((a, b) => meetingSortKey(a) - meetingSortKey(b));
    } else if (sort === 'most_relevant') {
      return [...result].sort((a, b) => meetingRelevanceScore(b) - meetingRelevanceScore(a));
    } else {
      return [...result].sort((a, b) => meetingSortKey(b) - meetingSortKey(a));
    }
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

  function openContactModal(contactId) {
    const isNew = !contactId;
    const contact = isNew ? {
      id: 'c' + Date.now(), firstName: '', lastName: '', nickname: '',
      company: '', title: '', emails: [], phones: [], stage: 'explore',
      labels: [], topics: [], notes: '', avatar: '', health: 50
    } : D.contacts.find(c => c.id === contactId);
    if (!contact) return;

    // Text fields are held in local vars so Cancel does not mutate the contact.
    let firstName = contact.firstName || '';
    let lastName = contact.lastName || '';
    let nickname = contact.nickname || '';
    let company = contact.company || '';
    let title = contact.title || '';
    let topicsStr = (contact.topics || []).join(', ');
    let notesStr = contact.notes || '';
    let avatar = contact.avatar || contact.photo || '';

    let emails = (contact.emails || []).map(e => ({ ...e }));
    let phones = (contact.phones || []).map(p => ({ ...p }));
    let labels = new Set(contact.labels || []);
    let stage = contact.stage || 'explore';

    function renderCompanyDatalist() {
      const list = elAttr('datalist', '', { id: 'company-list' });
      const seen = new Set();
      D.contacts.forEach(c => {
        if (c.company && !seen.has(c.company)) {
          seen.add(c.company);
          list.appendChild(elAttr('option', '', { value: c.company }));
        }
      });
      return list;
    }

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

    function renderPhoneRow(p, idx, list, container) {
      const row = el('div', 'dynamic-field-row');
      const val = elAttr('input', '', { type: 'tel', value: p.value, placeholder: '+1 555 000 0000' });
      val.addEventListener('input', () => { p.value = val.value; });
      const tag = el('select', '');
      ['work', 'mobile', 'home', 'other'].forEach(t => {
        const opt = document.createElement('option'); opt.value = t; opt.text = t; if (p.label === t) opt.selected = true; tag.appendChild(opt);
      });
      tag.addEventListener('change', () => { p.label = tag.value; });
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
      const first = elAttr('input', '', { type: 'text', value: firstName, placeholder: 'First name' });
      first.addEventListener('input', () => firstName = first.value);
      const last = elAttr('input', '', { type: 'text', value: lastName, placeholder: 'Last name' });
      last.addEventListener('input', () => lastName = last.value);
      nameRow.appendChild(renderFormGroup('First name', first));
      nameRow.appendChild(renderFormGroup('Last name', last));
      stack.appendChild(nameRow);

      const nick = elAttr('input', '', { type: 'text', value: nickname });
      nick.addEventListener('input', () => nickname = nick.value);
      stack.appendChild(renderFormGroup('Nickname', nick));

      const previewName = `${firstName} ${lastName}`.trim() || nickname || 'Unnamed';
      const avatarGroup = el('div', 'form-group');
      avatarGroup.appendChild(el('label', 'form-label', 'Avatar'));
      const avatarRow = el('div', 'form-row');
      const previewContact = { photo: avatar, name: previewName };
      let avatarPreview = renderAvatar(previewContact, 'person-avatar', previewName[0]);
      const avatarInput = elAttr('input', '', { type: 'url', value: avatar, placeholder: 'https://example.com/avatar.png' });
      avatarInput.addEventListener('input', () => {
        avatar = avatarInput.value;
        const nextPreview = renderAvatar({ photo: avatar, name: previewName }, 'person-avatar', previewName[0]);
        avatarRow.replaceChild(nextPreview, avatarPreview);
        avatarPreview = nextPreview;
      });
      avatarRow.appendChild(avatarPreview);
      avatarRow.appendChild(renderFormGroup('Avatar URL', avatarInput));
      avatarGroup.appendChild(avatarRow);
      stack.appendChild(avatarGroup);

      const comp = elAttr('input', '', { type: 'text', value: company, list: 'company-list' });
      comp.addEventListener('input', () => company = comp.value);
      stack.appendChild(renderFormGroup('Company', comp));

      const titleInput = elAttr('input', '', { type: 'text', value: title });
      titleInput.addEventListener('input', () => title = titleInput.value);
      stack.appendChild(renderFormGroup('Title', titleInput));

      const emailsGroup = el('div', 'form-group');
      emailsGroup.appendChild(el('label', 'form-label', 'Emails'));
      const emailsList = el('div', 'dynamic-list');
      emails.forEach((e, i) => renderEmailRow(e, i, emails, emailsList));
      const addEmail = el('button', 'btn-text', '+ Add email');
      addEmail.addEventListener('click', () => { emails.push({ value: '', label: 'work' }); renderBody(); });
      emailsGroup.appendChild(emailsList); emailsGroup.appendChild(addEmail);
      stack.appendChild(emailsGroup);

      const phonesGroup = el('div', 'form-group');
      phonesGroup.appendChild(el('label', 'form-label', 'Phones'));
      const phonesList = el('div', 'dynamic-list');
      phones.forEach((p, i) => renderPhoneRow(p, i, phones, phonesList));
      const addPhone = el('button', 'btn-text', '+ Add phone');
      addPhone.addEventListener('click', () => { phones.push({ value: '', label: 'work' }); renderBody(); });
      phonesGroup.appendChild(phonesList); phonesGroup.appendChild(addPhone);
      stack.appendChild(phonesGroup);

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

      const topicsInput = elAttr('input', '', { type: 'text', value: topicsStr });
      topicsInput.addEventListener('input', () => topicsStr = topicsInput.value);
      stack.appendChild(renderFormGroup('Topics', topicsInput, 'Comma separated'));

      const notesInput = el('textarea', ''); notesInput.value = notesStr;
      notesInput.addEventListener('input', () => notesStr = notesInput.value);
      stack.appendChild(renderFormGroup('Notes', notesInput));

      body.appendChild(stack);
      body.appendChild(renderCompanyDatalist());
    }

    let body;
    openModalCard({
      title: isNew ? 'New contact' : 'Edit contact',
      renderBody: (b) => { body = b; renderBody(); },
      renderActions: (actions) => {
        if (!isNew) {
          const del = el('button', 'btn-danger', 'Delete');
          del.addEventListener('click', () => confirmDestructive(`Delete ${firstName} ${lastName}? This cannot be undone.`, () => {
            D.contacts = D.contacts.filter(c => c.id !== contact.id);
            D.tasks = (D.tasks || []).filter(t => !(t.relatedType === 'contact' && t.relatedId === contact.id) && t.linkedContact !== contact.id);
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
          contact.firstName = firstName;
          contact.lastName = lastName;
          contact.nickname = nickname;
          contact.company = company;
          contact.title = title;
          contact.topics = topicsStr.split(',').map(t => t.trim()).filter(Boolean);
          contact.notes = notesStr;
          contact.emails = emails.filter(e => e.value.trim());
          contact.phones = phones.filter(p => p.value.trim());
          contact.labels = Array.from(labels);
          contact.stage = stage;
          contact.name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.nickname || 'Unnamed';
          contact.co = contact.company;
          contact.tl = contact.title;
          contact.em = contact.emails[0] ? contact.emails[0].value : '';
          contact.ph = contact.phones[0] ? contact.phones[0].value : '';
          contact.avatar = avatar;
          contact.photo = contact.avatar;
          if (isNew) D.contacts.unshift(contact);
          closeCompose(); renderMain(); showToast(isNew ? 'Contact created' : 'Contact saved');
        });
        actions.appendChild(cancel);
        actions.appendChild(save);
      }
    });
  }

  // Expose shared helpers for console-based prototyping and later tasks.
  window.el = el;
  window.elAttr = elAttr;
  window.icon = icon;
  window.openModalCard = openModalCard;
  window.renderFormGroup = renderFormGroup;
  window.renderToggle = renderToggle;
  window.renderPillInput = renderPillInput;
  window.confirmDestructive = confirmDestructive;
  window.openContactModal = openContactModal;
  window.openEventModal = openEventModal;
  window.openTaskModal = openTaskModal;
  window.openDraftModal = openDraftModal;
  window.setView = setView;
  window.renderMain = renderMain;
  window.openCompanyView = openCompanyView;
  window.renderCompanyView = renderCompanyView;
  window.renderLabelsSection = renderLabelsSection;
  window.openLabelModal = openLabelModal;

  function addLongPressListener(element, callback, duration = 500) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const maxMove = 10;

    function start(e) {
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        timer = null;
        callback(e);
      }, duration);
    }

    function move(e) {
      if (!timer) return;
      const touch = e.touches ? e.touches[0] : e;
      if (Math.abs(touch.clientX - startX) > maxMove || Math.abs(touch.clientY - startY) > maxMove) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function end() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: true });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
  }

  function wrapSwipeActions(card, leftAction, rightAction, options) {
    options = options || {};
    const wrap = el('div', 'feed-card-swipe-wrap');
    const leftBg = el('div', 'swipe-bg swipe-bg-left swipe-bg-' + (options.leftColor || 'yellow'));
    leftBg.appendChild(icon(options.leftIcon || 'ph-clock'));
    leftBg.appendChild(el('span', '', options.leftLabel || 'Snooze'));
    const rightBg = el('div', 'swipe-bg swipe-bg-right swipe-bg-' + (options.rightColor || 'red'));
    rightBg.appendChild(icon(options.rightIcon || 'ph-archive'));
    rightBg.appendChild(el('span', '', options.rightLabel || 'Archive'));

    wrap.appendChild(leftBg);
    wrap.appendChild(rightBg);
    wrap.appendChild(card);

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let moved = false;
    const threshold = options.threshold || 80;
    const maxDrag = 160;
    const rotateFactor = 0.04;

    function getX(e) {
      return e.touches ? e.touches[0].clientX : e.clientX;
    }

    function start(e) {
      startX = getX(e);
      isDragging = true;
      moved = false;
      card.style.transition = 'none';
    }

    function move(e) {
      if (!isDragging) return;
      currentX = getX(e) - startX;
      if (Math.abs(currentX) > 4) moved = true;
      const clamped = Math.max(-maxDrag, Math.min(maxDrag, currentX));
      const rotate = clamped * rotateFactor;
      const progress = Math.min(Math.abs(clamped) / threshold, 1);
      card.style.transform = 'translateX(' + clamped + 'px) rotate(' + rotate + 'deg)';
      if (clamped > 0) {
        rightBg.style.opacity = progress;
        rightBg.style.transform = 'scale(' + (0.85 + progress * 0.15) + ')';
        leftBg.style.opacity = 0;
        leftBg.style.transform = 'scale(0.85)';
      } else {
        leftBg.style.opacity = progress;
        leftBg.style.transform = 'scale(' + (0.85 + progress * 0.15) + ')';
        rightBg.style.opacity = 0;
        rightBg.style.transform = 'scale(0.85)';
      }
    }

    function end() {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = 'transform 0.28s var(--ease-out), opacity 0.2s var(--ease-out)';
      if (currentX > threshold) {
        card.style.transform = 'translateX(120%) rotate(8deg)';
        card.style.opacity = '0';
        wrap.style.height = wrap.offsetHeight + 'px';
        setTimeout(() => wrap.classList.add('removing'), 10);
        setTimeout(() => { if (rightAction) rightAction(); }, 300);
      } else if (currentX < -threshold) {
        card.style.transform = 'translateX(-120%) rotate(-8deg)';
        card.style.opacity = '0';
        wrap.style.height = wrap.offsetHeight + 'px';
        setTimeout(() => wrap.classList.add('removing'), 10);
        setTimeout(() => { if (leftAction) leftAction(); }, 300);
      } else {
        card.style.transform = 'translateX(0) rotate(0deg)';
        leftBg.style.opacity = 0;
        rightBg.style.opacity = 0;
        leftBg.style.transform = 'scale(0.85)';
        rightBg.style.transform = 'scale(0.85)';
      }
      currentX = 0;
    }

    card.addEventListener('touchstart', start, { passive: true });
    card.addEventListener('touchmove', move, { passive: true });
    card.addEventListener('touchend', end);
    card.addEventListener('touchcancel', end);
    card.addEventListener('mousedown', start);
    card.addEventListener('mousemove', move);
    card.addEventListener('mouseup', end);
    card.addEventListener('mouseleave', end);

    card.addEventListener('click', (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
      }
    });

    return wrap;
  }

  function emptyStateArt(artClass) {
    const svgs = {
      'art-purple': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="gp" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0A8F63" stop-opacity="0.22"/><stop offset="100%" stop-color="#0A8F63" stop-opacity="0.05"/></linearGradient></defs><ellipse cx="100" cy="80" rx="78" ry="60" fill="url(#gp)"/><path d="M60 70 Q100 40 140 70 Q150 95 120 110 Q80 120 60 95 Q52 82 60 70 Z" fill="#0A8F63" fill-opacity="0.14"/><rect x="76" y="82" width="48" height="36" rx="8" fill="white" fill-opacity="0.9" stroke="#0A8F63" stroke-width="2" stroke-opacity="0.35"/><path d="M76 88 L100 106 L124 88" fill="none" stroke="#0A8F63" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.5"/><circle cx="145" cy="58" r="14" fill="#0A8F63" fill-opacity="0.18"/></svg>',
      'art-green': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0CB87D" stop-opacity="0.20"/><stop offset="100%" stop-color="#0CB87D" stop-opacity="0.04"/></linearGradient></defs><ellipse cx="100" cy="80" rx="78" ry="60" fill="url(#gg)"/><rect x="70" y="78" width="60" height="40" rx="9" fill="white" fill-opacity="0.85" stroke="#0CB87D" stroke-width="2" stroke-opacity="0.35"/><rect x="80" y="68" width="60" height="40" rx="9" fill="white" fill-opacity="0.65" stroke="#0CB87D" stroke-width="2" stroke-opacity="0.25"/><rect x="90" y="58" width="60" height="40" rx="9" fill="white" fill-opacity="0.45" stroke="#0CB87D" stroke-width="2" stroke-opacity="0.18"/><line x1="98" y1="68" x2="142" y2="68" stroke="#0CB87D" stroke-width="2" stroke-opacity="0.25"/><line x1="98" y1="80" x2="136" y2="80" stroke="#0CB87D" stroke-width="2" stroke-opacity="0.18"/></svg>',
      'art-orange': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="go" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f5a623" stop-opacity="0.22"/><stop offset="100%" stop-color="#f5a623" stop-opacity="0.05"/></linearGradient></defs><ellipse cx="100" cy="80" rx="78" ry="60" fill="url(#go)"/><path d="M60 72 Q60 62 72 62 L118 62 Q130 62 130 74 L130 108 Q130 118 118 118 L72 118 Q60 118 60 106 L60 92 L82 92 L92 82 L118 82 Q124 82 124 88 L124 102 Q124 108 118 108 L72 108 Q66 108 66 102 L66 78 Q66 72 72 72 L100 72 Z" fill="white" fill-opacity="0.85" stroke="#f5a623" stroke-width="2" stroke-opacity="0.4"/><line x1="78" y1="96" x2="114" y2="96" stroke="#f5a623" stroke-width="2" stroke-opacity="0.35"/><line x1="78" y1="108" x2="106" y2="108" stroke="#f5a623" stroke-width="2" stroke-opacity="0.25"/><circle cx="150" cy="54" r="12" fill="#f5a623" fill-opacity="0.18"/></svg>',
      'art-blue': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="gb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.18"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0.04"/></linearGradient></defs><ellipse cx="100" cy="80" rx="78" ry="60" fill="url(#gb)"/><circle cx="100" cy="78" r="32" fill="white" fill-opacity="0.8" stroke="#3b82f6" stroke-width="2" stroke-opacity="0.3"/><path d="M86 78 Q94 66 108 72 Q118 78 112 90 Q104 100 92 94 Q82 88 86 78 Z" fill="#3b82f6" fill-opacity="0.12"/><circle cx="136" cy="58" r="10" fill="#3b82f6" fill-opacity="0.14"/><circle cx="64" cy="96" r="8" fill="#3b82f6" fill-opacity="0.10"/></svg>',
      'art-red': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="gr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff3b30" stop-opacity="0.16"/><stop offset="100%" stop-color="#ff3b30" stop-opacity="0.04"/></linearGradient></defs><ellipse cx="100" cy="80" rx="78" ry="60" fill="url(#gr)"/><rect x="78" y="72" width="44" height="52" rx="8" fill="white" fill-opacity="0.85" stroke="#ff3b30" stroke-width="2" stroke-opacity="0.3"/><line x1="88" y1="88" x2="112" y2="88" stroke="#ff3b30" stroke-width="2" stroke-opacity="0.35"/><line x1="88" y1="100" x2="106" y2="100" stroke="#ff3b30" stroke-width="2" stroke-opacity="0.25"/><path d="M100 82 L100 62" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-opacity="0.4"/><circle cx="100" cy="56" r="6" fill="#ff3b30" fill-opacity="0.2"/></svg>'
    };
    if (!svgs[artClass]) return null;
    const wrap = el('div', 'empty-state-art');
    wrap.innerHTML = svgs[artClass];
    return wrap;
  }

  function renderEmpty(text, iconName, title, artClass) {
    const wrap = el('div', 'empty-state' + (artClass ? ' ' + artClass : ''));
    const art = emptyStateArt(artClass);
    if (art) wrap.appendChild(art);
    // Only show the icon when there is no illustration art, so they don't overlap.
    if (iconName && !art) {
      const i = el('i', 'ph ' + iconName);
      wrap.appendChild(i);
    }
    if (title) {
      wrap.appendChild(el('strong', '', title));
    }
    wrap.appendChild(el('span', '', text));
    return wrap;
  }

  function renderSkeletonList(count) {
    const list = el('div', 'feed-list skeleton-list');
    for (let i = 0; i < count; i++) {
      const card = el('div', 'skeleton-card');
      const avatar = el('div', 'skeleton-avatar skeleton');
      const lines = el('div', 'skeleton-lines');
      const top = el('div', 'skeleton-line');
      top.style.width = (35 + Math.random() * 25) + '%';
      const bottom = el('div', 'skeleton-line short');
      top.className = 'skeleton-line skeleton';
      bottom.className = 'skeleton-line skeleton';
      lines.appendChild(top);
      lines.appendChild(bottom);
      card.appendChild(avatar);
      card.appendChild(lines);
      list.appendChild(card);
    }
    return list;
  }

  function setView(view) {
    state.view = view;
    state.cursorIndex = -1;
    state.selectedIds.clear();
    state.focusReplyOpen = false;
    state.focusReplyIndex = 0;
    state.focusReplyCompletedIds.clear();
    // Close any open detail panel so the new view isn't shown side-by-side
    // with stale message/contact context.
    closePanel();
    renderNav();
    renderTopBar();
    renderMain();
  }

  function renderNav() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';

    // On mobile the sidebar becomes a bottom tab bar with 5 slots.
    // Keep the most-used buckets pinned: Gate, Inbox, Pending, Saved, plus More.
    if (isMobile()) {
      const primary = [
        { id: 'screener', label: 'Gate', icon: 'ph-funnel' },
        { id: 'imbox', label: 'Inbox', icon: 'ph-tray' },
        { id: 'replyLater', label: 'Pending', icon: 'ph-clock' },
        { id: 'setAside', label: 'Saved', icon: 'ph-push-pin' },
      ];
      const moreItems = [
        { id: 'feed', label: 'Stream', icon: 'ph-newspaper' },
        { id: 'paperTrail', label: 'Records', icon: 'ph-receipt' },
        { type: 'divider' },
        { id: 'contacts', label: 'Contacts', icon: 'ph-users' },
        { id: 'calendar', label: 'Calendar', icon: 'ph-calendar' },
        { id: 'files', label: 'Files', icon: 'ph-files' },
        { id: 'insights', label: 'Insights', icon: 'ph-chart-bar' },
        { id: 'agent', label: 'Agent', icon: 'ph-sparkle' },
        { type: 'divider' },
        { id: 'bubbleUp', label: 'Remind', icon: 'ph-arrow-fat-line-up' },
        { type: 'divider' },
        { id: 'trash', label: 'Trash', icon: 'ph-trash' },
        { id: 'spam', label: 'Spam', icon: 'ph-warning-circle' },
        { type: 'divider' },
        { id: 'settings', label: 'Settings', icon: 'ph-gear' },
      ];

      primary.forEach(item => {
        const btn = el('button', 'nav-item' + (state.view === item.id ? ' active' : ''));
        const iconWrap = el('span', 'nav-icon-wrap');
        iconWrap.appendChild(icon(item.icon));
        const count = navBadgeCount(item.id);
        if (count > 0) {
          const badge = el('span', 'nav-badge nav-badge--mobile', count > 99 ? '99+' : count);
          iconWrap.appendChild(badge);
        }
        btn.appendChild(iconWrap);
        const labelWrap = el('div', 'nav-label-wrap');
        labelWrap.appendChild(el('span', 'nav-label', item.label));
        btn.appendChild(labelWrap);
        btn.addEventListener('click', () => setView(item.id));
        sidebar.appendChild(btn);
      });

      const moreBtn = el('button', 'nav-item' + (moreItems.some(i => i.id === state.view) ? ' active' : ''));
      moreBtn.appendChild(icon('ph-dots-three'));
      const moreLabelWrap = el('div', 'nav-label-wrap');
      moreLabelWrap.appendChild(el('span', 'nav-label', 'More'));
      moreBtn.appendChild(moreLabelWrap);
      moreBtn.addEventListener('click', () => {
        const rect = moreBtn.getBoundingClientRect();
        const menuItems = moreItems.map(i => {
          if (i.type === 'divider') return i;
          return {
            label: i.label,
            icon: i.icon,
            action: () => {
              if (i.id === 'agent') {
                toggleAgent();
              } else {
                setView(i.id);
              }
            }
          };
        });
        openContextMenu(rect.left + rect.width / 2, rect.top, menuItems);
      });
      sidebar.appendChild(moreBtn);
      return;
    }

    const composeBtn = el('button', 'sidebar-compose-btn');
    composeBtn.title = 'New message (⌘N)';
    composeBtn.appendChild(icon('ph-pencil-simple'));
    composeBtn.appendChild(el('span', '', 'New'));
    composeBtn.addEventListener('click', openCompose);
    sidebar.appendChild(composeBtn);

    navSections.forEach(section => {
      const sectionEl = el('div', 'nav-section');
      if (section.label) {
        const sectionLabel = el('div', 'nav-section-label', section.label);
        sectionEl.appendChild(sectionLabel);
      }

      section.items.forEach(item => {
        const btn = el('button', 'nav-item' + (state.view === item.id ? ' active' : ''));
        btn.appendChild(icon(item.icon));
        const labelWrap = el('div', 'nav-label-wrap');
        labelWrap.appendChild(el('span', 'nav-label', item.label));
        const count = navBadgeCount(item.id);
        if (count > 0) {
          const badge = el('span', 'nav-badge', count);
          labelWrap.appendChild(badge);
        }
        btn.appendChild(labelWrap);
        btn.title = item.hint ? item.label + ' (' + item.hint + ')' : item.label;
        btn.addEventListener('click', () => setView(item.id));
        sectionEl.appendChild(btn);
      });

      sidebar.appendChild(sectionEl);
    });
  }

  function navBadgeCount(view) {
    const allEvents = buildFeed();
    if (view === 'screener') {
      return D.contacts.filter(c => c.firstSeen && !c.screened && !c.blocked).length;
    }
    if (view === 'imbox') {
      return allEvents.filter(e => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened && !e.data.seen).length;
    }
    if (view === 'replyLater') {
      return allEvents.filter(e => e.type === 'message' && e.data.replyLater && !e.data.trashed && !e.data.spam).length;
    }
    if (view === 'setAside') {
      return allEvents.filter(e => e.type === 'message' && e.data.setAside && !e.data.trashed && !e.data.spam).length;
    }
    return 0;
  }

  function renderTopBar() {
    const topbar = document.getElementById('topbar');
    topbar.innerHTML = '';

    const left = el('div', 'topbar-left');
    const searchToggle = el('button', 'icon-btn topbar-search-toggle');
    searchToggle.title = state.searchOpen ? 'Close search' : 'Search (/)';
    searchToggle.appendChild(icon(state.searchOpen ? 'ph-x' : 'ph-magnifying-glass'));
    searchToggle.addEventListener('click', () => {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.searchQuery = '';
      renderTopBar();
      renderMain();
      if (state.searchOpen) {
        const input = topbar.querySelector('.topbar-search input');
        if (input) input.focus();
      }
    });
    left.appendChild(searchToggle);

    const center = el('div', 'topbar-center');
    if (state.searchOpen) {
      const searchWrap = el('div', 'topbar-search topbar-search-active');
      const searchInput = el('input', 'search-input');
      searchInput.placeholder = 'Search people, messages, files...';
      searchInput.value = state.searchQuery;
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        renderMain();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          state.searchOpen = false;
          state.searchQuery = '';
          renderTopBar();
          renderMain();
        }
        if (e.key === 'Enter') {
          const value = searchInput.value.trim();
          if (!value) return;
          state.view = 'search';
          state.searchQuery = value;
          state.searchFilter = 'all';
          state.selectedSearchResult = null;
          renderTopBar();
          renderMain();
        }
      });
      searchWrap.appendChild(icon('ph-magnifying-glass'));
      searchWrap.appendChild(searchInput);
      center.appendChild(searchWrap);
    } else {
      const logo = el('a', 'topbar-logo');
      logo.href = '#';
      logo.title = 'SendPalm';
      const mark = el('span', 'topbar-logo-mark');
      mark.appendChild(icon('ph-paper-plane-tilt'));
      mark.appendChild(el('span', 'logo-dot'));
      logo.appendChild(mark);
      logo.appendChild(el('span', '', 'SendPalm'));
      logo.addEventListener('click', (e) => {
        e.preventDefault();
        setView('imbox');
      });
      center.appendChild(logo);
    }

    const right = el('div', 'topbar-right');

    const mobileComposeBtn = el('button', 'icon-btn topbar-compose-mobile');
    mobileComposeBtn.title = 'New message';
    mobileComposeBtn.appendChild(icon('ph-pencil-simple'));
    mobileComposeBtn.addEventListener('click', openCompose);
    right.appendChild(mobileComposeBtn);

    const notifyBtn = el('button', 'icon-btn topbar-notify-btn');
    notifyBtn.title = 'Notifications';
    notifyBtn.appendChild(icon('ph-bell'));
    notifyBtn.addEventListener('click', toggleNotifications);
    if (D.notifications.some(n => !n.read)) notifyBtn.classList.add('has-badge');
    right.appendChild(notifyBtn);

    const avatarBtn = el('button', 'topbar-avatar');
    avatarBtn.title = 'Edwin Hao';
    avatarBtn.style.backgroundImage = 'url(https://picsum.photos/seed/edwinhao/64/64)';
    avatarBtn.addEventListener('click', () => {
      const draftCount = (D.drafts || []).length + (D.agentDrafts || []).length;
      const menuItems = [
        { label: 'Contacts', icon: 'ph-users', action: () => setView('contacts') },
        { label: 'Calendar', icon: 'ph-calendar', action: () => setView('calendar') },
        { label: 'Files', icon: 'ph-files', action: () => setView('files') },
        { label: 'Drafts' + (draftCount ? ' (' + draftCount + ')' : ''), icon: 'ph-pencil-simple', action: () => setView('drafts') },
        { type: 'divider' },
        { label: 'Settings', icon: 'ph-gear', action: () => setView('settings') },
        { type: 'divider' },
        { label: 'Sign out', icon: 'ph-sign-out', action: () => showToast('Signed out') },
      ];
      openContextMenuFromElement(avatarBtn, menuItems);
    });
    right.appendChild(avatarBtn);

    topbar.appendChild(left);
    topbar.appendChild(center);
    topbar.appendChild(right);
  }

  function getCurrentViewEvents() {
    const allEvents = filterFeedEvents(buildFeed());
    if (state.view === 'imbox') {
      const isImboxMsg = (e) => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened;
      const newForYou = allEvents.filter(e => isImboxMsg(e) && !e.data.seen).sort((a, b) => priorityScore(b) - priorityScore(a));
      const previouslySeen = allEvents.filter(e => isImboxMsg(e) && e.data.seen).sort((a, b) => b.sortKey - a.sortKey);
      return newForYou.concat(previouslySeen);
    }
    if (['feed', 'paperTrail', 'replyLater', 'setAside', 'bubbleUp'].includes(state.view)) {
      return allEvents.filter(e => isInBucketView(e, state.view)).sort((a, b) => b.sortKey - a.sortKey);
    }
    if (state.view === 'screener') {
      return allEvents.filter(e => isInBucketView(e, state.view)).sort((a, b) => a.sortKey - b.sortKey);
    }
    return [];
  }

  function scrollCursorIntoView() {
    const cursor = document.querySelector('#main .feed-card.cursor');
    if (cursor) cursor.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  function openBulkActionsMenu() {
    const events = getCurrentViewEvents();
    if (state.cursorIndex >= 0 && events[state.cursorIndex] && state.selectedIds.size === 0) {
      const m = events[state.cursorIndex].data;
      state.selectedIds.add(m.id);
    }
    if (state.selectedIds.size === 0) {
      showToast('Select at least one email');
      return;
    }
    const selectedMessages = events.filter(ev => state.selectedIds.has(ev.data.id)).map(ev => ev.data);
    const rect = { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    const items = [
      { label: 'Move to Inbox', icon: 'ph-tray', action: () => { selectedMessages.forEach(m => moveMessageToBucket(m, 'imbox')); state.selectedIds.clear(); renderMain(); } },
      { label: 'Move to Stream', icon: 'ph-newspaper', action: () => { selectedMessages.forEach(m => moveMessageToBucket(m, 'feed')); state.selectedIds.clear(); renderMain(); } },
      { label: 'Move to Records', icon: 'ph-receipt', action: () => { selectedMessages.forEach(m => moveMessageToBucket(m, 'paperTrail')); state.selectedIds.clear(); renderMain(); } },
      { type: 'divider' },
      { label: 'Mark as Pending', icon: 'ph-clock', action: () => { selectedMessages.forEach(m => replyLaterMessage(m)); state.selectedIds.clear(); renderMain(); } },
      { label: 'Mark as Saved', icon: 'ph-push-pin', action: () => { selectedMessages.forEach(m => setAsideMessage(m)); state.selectedIds.clear(); renderMain(); } },
      { label: 'Remind', icon: 'ph-arrow-fat-line-up', action: () => { selectedMessages.forEach(m => bubbleUpMessage(m, 'tomorrow')); state.selectedIds.clear(); renderMain(); } },
      { type: 'divider' },
      { label: 'Archive', icon: 'ph-archive', action: () => { selectedMessages.forEach(m => { m.archived = true; }); state.selectedIds.clear(); showToast('Archived ' + selectedMessages.length + ' emails'); renderMain(); } },
    ];
    openContextMenu(rect.left, rect.top, items);
  }

  function viewTitle(view) {
    if (view === 'company') return state.selectedCompanyName || 'Account';
    const map = {
      imbox: 'Inbox',
      feed: 'Stream',
      paperTrail: 'Records',
      screener: 'Gate',
      screenerHistory: 'Gate History',
      replyLater: 'Pending',
      setAside: 'Saved',
      bubbleUp: 'Remind',
      contacts: 'Contacts',
      calendar: 'Calendar',
      files: 'Files',
      insights: 'Insights',
      drafts: 'Drafts',
      agent: 'Agent',
      settings: 'Settings',
      search: 'Search',
      trash: 'Trash',
      spam: 'Spam',
    };
    return map[view] || view;
  }

  function getContact(id) { return D.getP(id); }

  function buildFeed() {
    const events = [];

    D._msgs.forEach((m, idx) => {
      events.push({
        type: 'message',
        id: 'msg-' + idx,
        sortKey: new Date(m.st).getTime() || 0,
        data: m,
      });
    });

    D._meetings.forEach((m, idx) => {
      events.push({
        type: 'meeting',
        id: 'mtg-' + idx,
        sortKey: new Date(m.dt).getTime() || 0,
        data: m,
      });
    });

    return events.sort((a, b) => b.sortKey - a.sortKey);
  }

  function priorityScore(ev) {
    const appNow = new Date('2026-07-20T00:00:00').getTime();
    let score = 0;
    if (ev.type === 'meeting') {
      score += 75;
      return score;
    }
    const m = ev.data;
    if (m.fl === 'wait') score += 100;
    else if (m.fl === 'todo') score += 80;
    else if (m.fl === 'done') score += 25;
    const contact = getContact(m.pid);
    if (contact) {
      score += contact.sc * 0.45;
      if (contact.grp === 'risk') score += 25;
      if (contact.grp === 'cold') score -= 35;
    }
    const eventTime = new Date(m.st).getTime() || appNow;
    const ageDays = (appNow - eventTime) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 18 - ageDays * 0.25);
    return score;
  }

  function filterFeedEvents(events) {
    if (!state.searchQuery) return events;
    const q = state.searchQuery.toLowerCase();
    return events.filter(e => {
      if (e.type === 'message') {
        const m = e.data;
        const c = getContact(m.pid);
        return (c && c.name.toLowerCase().includes(q)) ||
          (m.subj && m.subj.toLowerCase().includes(q)) ||
          (m.prev && m.prev.toLowerCase().includes(q));
      }
      if (e.type === 'meeting') {
        const m = e.data;
        return (m.title && m.title.toLowerCase().includes(q)) ||
          (m.ppl && m.ppl.toLowerCase().includes(q));
      }
      return false;
    });
  }

  function archiveMessage(m) {
    const prev = { archived: m.archived, replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil };
    m.archived = true;
    clearWorkflowFlags(m);
    showToast('Archived', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function snoozeMessage(m) {
    const prev = { snoozed: m.snoozed, snoozeUntil: m.snoozeUntil };
    m.snoozed = true;
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(8, 0, 0, 0);
    m.snoozeUntil = until.toISOString();
    showToast('Snoozed until tomorrow', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function trashMessage(m) {
    const prev = { trashed: m.trashed, spam: m.spam, replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    m.trashed = true;
    m.spam = false;
    clearWorkflowFlags(m);
    m.archived = false;
    showToast('Moved to Trash', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function spamMessage(m) {
    const prev = { spam: m.spam, trashed: m.trashed, replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    m.spam = true;
    m.trashed = false;
    clearWorkflowFlags(m);
    m.archived = false;
    showToast('Marked as spam', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function restoreMessageFromTrash(m) {
    const wasTrashed = m.trashed;
    const wasSpam = m.spam;
    m.trashed = false;
    m.spam = false;
    showToast('Restored', { undo: () => { m.trashed = wasTrashed; m.spam = wasSpam; renderMain(); } });
    renderMain();
  }

  function emptyTrash() {
    const trashed = D._msgs.filter(m => m.trashed);
    if (trashed.length === 0) return;
    trashed.forEach(m => { m.permanentlyDeleted = true; });
    showToast('Trash emptied (' + trashed.length + ' emails)');
    renderMain();
  }

  function archiveMeeting(m) {
    showToast('Meeting archived');
    renderMain();
  }

  function snoozeMeeting(m) {
    showToast('Meeting snoozed until tomorrow');
    renderMain();
  }

  function screenSender(pid, bucket) {
    const contact = getContact(pid);
    if (contact) {
      contact.firstSeen = false;
      contact.screened = true;
      contact.defaultBucket = bucket;
    }
    D._msgs.filter(m => m.pid === pid).forEach(m => {
      m.bucket = bucket;
      m.screened = true;
    });
    showToast('Screened to ' + bucket);
    renderMain();
  }

  function blockSender(pid) {
    const contact = getContact(pid);
    if (contact) {
      contact.blocked = true;
      contact.firstSeen = false;
      contact.screened = true;
    }
    showToast('Sender blocked');
    renderMain();
  }

  function moveMessageToBucket(m, bucket) {
    const prev = { bucket: m.bucket, replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    m.bucket = bucket;
    clearWorkflowFlags(m);
    m.archived = false;
    showToast('Moved to ' + viewTitle(bucket), { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function replyLaterMessage(m) {
    const prev = { replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    clearWorkflowFlags(m);
    m.replyLater = true;
    m.archived = false;
    showToast('Added to Pending', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function setAsideMessage(m) {
    const prev = { replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    clearWorkflowFlags(m);
    m.setAside = true;
    m.archived = false;
    showToast('Saved', { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function bubbleUpMessage(m, duration) {
    const prev = { replyLater: m.replyLater, setAside: m.setAside, bubbleUpUntil: m.bubbleUpUntil, archived: m.archived };
    clearWorkflowFlags(m);
    const until = new Date();
    if (duration === 'now') until.setMinutes(until.getMinutes() + 1);
    else if (duration === 'later') until.setHours(until.getHours() + 4);
    else if (duration === 'tomorrow') { until.setDate(until.getDate() + 1); until.setHours(8, 0, 0, 0); }
    else if (duration === 'weekend') {
      while (until.getDay() !== 6) until.setDate(until.getDate() + 1);
      until.setHours(8, 0, 0, 0);
    }
    else if (duration === 'week') { until.setDate(until.getDate() + 7); until.setHours(8, 0, 0, 0); }
    else until.setDate(until.getDate() + 1);
    m.bubbleUpUntil = until.toISOString();
    m.archived = false;
    showToast('Reminded until ' + until.toLocaleDateString(), { undo: () => restoreMessageState(m, prev) });
    renderMain();
  }

  function clearWorkflowFlags(m) {
    m.replyLater = false;
    m.setAside = false;
    m.bubbleUpUntil = null;
  }

  function toggleUnreadMessage(m) {
    m.seen = !m.seen;
    showToast(m.seen ? 'Marked as read' : 'Marked as unread');
    renderMain();
    requestAnimationFrame(() => {
      const cards = document.querySelectorAll('.feed-card');
      cards.forEach(card => {
        const subj = card.querySelector('.feed-subject')?.textContent;
        if (subj === m.subj && !m.seen) {
          card.classList.add('anim-unread');
          setTimeout(() => card.classList.remove('anim-unread'), 500);
        }
      });
    });
  }

  function restoreMessageState(m, prev) {
    Object.keys(prev).forEach(key => {
      if (prev[key] === undefined) delete m[key];
      else m[key] = prev[key];
    });
    renderMain();
  }

  function renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    try {
      return _renderMainImpl(main);
    } catch (e) {
      console.error('[renderMain]', e);
      main.appendChild(renderErrorBoundary(e));
      return;
    }
  }

  function renderErrorBoundary(err) {
    const wrap = el('div', 'view-error');
    wrap.style.padding = '40px';
    wrap.style.color = 'var(--red)';
    wrap.style.fontFamily = 'var(--font-mono)';
    wrap.style.fontSize = '12px';
    wrap.appendChild(el('div', '', '⚠️ 渲染错误'));
    wrap.appendChild(el('div', '', String(err && err.message || err)));
    return wrap;
  }

  function _renderMainImpl(main) {

    if (state.onboardingStep !== null) {
      main.appendChild(renderOnboarding());
      return;
    }

    if (state.loading) {
      main.appendChild(renderSkeletonList(8));
      return;
    }

    if (state.focusReplyOpen) {
      main.appendChild(renderFocusReply());
      return;
    }

    if (state.readTogetherOpen) {
      main.appendChild(renderReadTogether());
      return;
    }

    const bucketViews = ['feed', 'paperTrail', 'screener', 'replyLater', 'setAside', 'bubbleUp', 'trash', 'spam'];
    let viewEl;
    if (state.view === 'imbox') {
      viewEl = renderImbox();
    } else if (state.view === 'feed') {
      viewEl = renderStream();
    } else if (state.view === 'screener') {
      viewEl = renderGate();
    } else if (bucketViews.includes(state.view)) {
      viewEl = renderBucket(state.view);
    } else if (state.view === 'screenerHistory') {
      viewEl = renderScreenerHistory();
    } else if (state.view === 'contacts') {
      viewEl = renderPeople();
    } else if (state.view === 'company') {
      viewEl = renderCompanyView(state.selectedCompanyName);
    } else if (state.view === 'calendar') {
      viewEl = renderCalendar();
    } else if (state.view === 'files') {
      viewEl = renderFiles();
    } else if (state.view === 'insights') {
      viewEl = renderInsightsView();
    } else if (state.view === 'agent') {
      viewEl = renderAgentView();
    } else if (state.view === 'drafts') {
      viewEl = renderDrafts();
    } else if (state.view === 'settings') {
      viewEl = renderSettings();
    } else if (state.view === 'search') {
      viewEl = renderSearchView();
    } else {
      viewEl = el('div', 'view view-placeholder', viewTitle(state.view));
    }

    if (state.view !== 'calendar' && state.view !== 'company' && state.view !== 'search') {
      const header = el('div', 'view-header');
      const headerLeft = el('div', 'view-header-left');
      headerLeft.appendChild(el('h1', 'view-title', viewTitle(state.view)));
      const subtitles = {
        imbox: 'Important emails, ready for you.',
        feed: 'Newsletters and bulk mail, like a newsfeed.',
        paperTrail: 'Receipts, confirmations, and records.',
        screener: 'Decide who is allowed to email you.',
        screenerHistory: 'Your past screening decisions.',
        contacts: 'People and companies you talk to.',
        files: 'Attachments and files from your email.',
        insights: 'Analytics and trends across your relationships.',
        agent: 'Your AI workspace: sessions, tasks, drafts, and memory.',
        drafts: 'Messages you are working on.',
        settings: 'Preferences and account options.',
        search: 'Results across people, messages, files, meetings, and tasks.',
        trash: 'Deleted emails.',
        spam: 'Emails marked as spam.',
      };
      if (subtitles[state.view]) {
        headerLeft.appendChild(el('div', 'view-subtitle', subtitles[state.view]));
      }
      header.appendChild(headerLeft);
      if (state.view === 'imbox') {
        const action = el('button', 'view-header-action');
        action.appendChild(icon('ph-check'));
        action.appendChild(el('span', '', 'Mark all read'));
        action.addEventListener('click', () => {
          const msgs = D._msgs.filter(m => m.bucket === 'imbox' && !m.seen);
          msgs.forEach(m => { m.seen = true; });
          if (msgs.length) {
            showToast(`Marked ${msgs.length} email${msgs.length > 1 ? 's' : ''} as read`);
            renderMain();
          }
        });
        header.appendChild(action);

        const newDraftBtn = el('button', 'view-header-action');
        newDraftBtn.appendChild(icon('ph-pencil-simple'));
        newDraftBtn.appendChild(el('span', '', 'New draft'));
        newDraftBtn.addEventListener('click', () => openDraftModal(null));
        header.appendChild(newDraftBtn);

        header.appendChild(renderMoreFiltersHeaderAction('imbox'));
      }
      if (state.view === 'drafts') {
        const newDraftBtn = el('button', 'view-header-action');
        newDraftBtn.appendChild(icon('ph-plus'));
        newDraftBtn.appendChild(el('span', '', 'New draft'));
        newDraftBtn.addEventListener('click', () => openDraftModal(null));
        header.appendChild(newDraftBtn);
      }
      if (state.view === 'contacts') {
        const newContactBtn = el('button', 'view-header-action');
        newContactBtn.appendChild(icon('ph-plus'));
        newContactBtn.appendChild(el('span', '', 'New contact'));
        newContactBtn.addEventListener('click', () => openContactModal(null));
        header.appendChild(newContactBtn);
      }
      viewEl.insertBefore(header, viewEl.firstChild);
    }
    main.appendChild(viewEl);
    renderDetailPanel();
  }

  function startOnboarding() {
    localStorage.removeItem('sendpalm-onboarding');
    state.onboardingCompleted = false;
    state.onboardingStep = 0;
    renderMain();
  }

  function completeOnboardingStep() {
    if (state.onboardingStep >= 3) {
      finishOnboarding();
    } else {
      state.onboardingStep++;
      renderMain();
    }
  }

  function finishOnboarding() {
    clearOnboardingInterval();
    localStorage.setItem('sendpalm-onboarding', '1');
    state.onboardingCompleted = true;
    state.onboardingStep = null;
    state.view = 'imbox';
    renderMain();
    renderNav();
    renderTopBar();
    showToast('Welcome to SendPalm');
  }

  function skipOnboarding() {
    finishOnboarding();
  }

  function clearOnboardingInterval() {
    if (onboardingProgressInterval) {
      clearInterval(onboardingProgressInterval);
      onboardingProgressInterval = null;
    }
  }

  function renderOnboarding() {
    const view = el('div', 'onboarding-view');

    const progress = el('div', 'onboarding-progress');
    for (let i = 0; i < 4; i++) {
      const dot = el('span', 'onboarding-dot' + (i === state.onboardingStep ? ' active' : '') + (i < state.onboardingStep ? ' completed' : ''));
      progress.appendChild(dot);
    }
    view.appendChild(progress);

    const content = el('div', 'onboarding-content');
    const step = state.onboardingStep;

    if (step === 0) content.appendChild(renderOnboardingWelcome());
    else if (step === 1) content.appendChild(renderOnboardingConnect());
    else if (step === 2) content.appendChild(renderOnboardingIndex());
    else content.appendChild(renderOnboardingDone());
    view.appendChild(content);

    return view;
  }

  function renderOnboardingWelcome() {
    const wrap = el('div', 'onboarding-step');
    const iconWrap = el('div', 'onboarding-brand-icon');
    iconWrap.appendChild(icon('ph-palm-tree'));
    wrap.appendChild(iconWrap);
    wrap.appendChild(el('h1', 'onboarding-title', 'Welcome to SendPalm'));
    wrap.appendChild(el('p', 'onboarding-subtitle', 'Calm email + agent context. Focus on the people that matter, and let the noise fade into the background.'));

    const actions = el('div', 'onboarding-actions');
    const skip = el('button', 'btn btn-ghost', 'Skip');
    skip.addEventListener('click', skipOnboarding);
    actions.appendChild(skip);
    const next = el('button', 'btn btn-primary', 'Get started');
    next.addEventListener('click', completeOnboardingStep);
    actions.appendChild(next);
    wrap.appendChild(actions);
    return wrap;
  }

  function renderOnboardingConnect() {
    const wrap = el('div', 'onboarding-step');
    wrap.appendChild(el('h1', 'onboarding-title', 'Connect your channels'));
    wrap.appendChild(el('p', 'onboarding-subtitle', 'Choose the accounts you want to bring into SendPalm. You can always add more later in Settings.'));

    const channels = [
      { id: 'gmail', name: 'Gmail', desc: 'edwin.hao@gmail.com', provider: 'gmail', color: '#ea4335', icon: 'ph-envelope-simple' },
      { id: 'outlook', name: 'Outlook', desc: 'edwin@sendpalm.com', provider: 'outlook', color: '#0078d4', icon: 'ph-envelope-simple' },
      { id: 'slack', name: 'Slack', desc: 'sendpalm workspace', provider: 'slack', color: '#4a154b', icon: 'ph-slack-logo' },
      { id: 'calendar', name: 'Google Calendar', desc: 'Upcoming events & meetings', provider: 'google', color: '#a78bfa', icon: 'ph-calendar-blank' },
    ];

    const selected = new Set(['gmail']);
    const grid = el('div', 'onboarding-channel-grid');

    function refresh() {
      grid.innerHTML = '';
      channels.forEach(ch => {
        const card = el('div', 'onboarding-channel-card' + (selected.has(ch.id) ? ' selected' : ''));
        const top = el('div', 'onboarding-channel-top');
        const avatar = el('div', 'onboarding-channel-avatar');
        avatar.style.background = ch.color;
        avatar.appendChild(icon(ch.icon));
        top.appendChild(avatar);
        const info = el('div', 'onboarding-channel-info');
        info.appendChild(el('div', 'onboarding-channel-name', ch.name));
        info.appendChild(el('div', 'onboarding-channel-desc', ch.desc));
        top.appendChild(info);
        const toggle = renderToggle('', selected.has(ch.id), (on) => {
          if (on) selected.add(ch.id);
          else selected.delete(ch.id);
          refresh();
        });
        top.appendChild(toggle);
        card.appendChild(top);

        const status = el('div', 'onboarding-channel-status');
        const existing = (D.accounts || []).find(a => a.provider === ch.provider || a.id === ch.id);
        if (existing && existing.status === 'connected') {
          status.textContent = 'Connected';
          status.className = 'onboarding-channel-status connected';
        } else {
          const connectBtn = el('button', 'btn btn-secondary btn-sm', selected.has(ch.id) ? 'Connect' : 'Select to connect');
          connectBtn.disabled = !selected.has(ch.id);
          connectBtn.addEventListener('click', () => {
            connectBtn.textContent = 'Connecting…';
            connectBtn.disabled = true;
            setTimeout(() => {
              let acct = (D.accounts || []).find(a => a.provider === ch.provider || a.id === ch.id);
              if (!acct) {
                acct = { id: ch.id, type: ch.id === 'calendar' ? 'calendar' : (ch.id === 'slack' ? 'im' : 'email'), provider: ch.provider, label: ch.name, status: 'connected', synced: 0, total: 0, privacy: 'unified', color: ch.color, avatar: ch.name[0], lastSync: '刚刚' };
                D.accounts.push(acct);
              }
              acct.status = 'connected';
              acct.lastSync = '刚刚';
              showToast(ch.name + ' connected');
              refresh();
            }, 900);
          });
          status.appendChild(connectBtn);
        }
        card.appendChild(status);
        grid.appendChild(card);
      });
    }
    refresh();
    wrap.appendChild(grid);

    const actions = el('div', 'onboarding-actions');
    const skip = el('button', 'btn btn-ghost', 'Skip');
    skip.addEventListener('click', skipOnboarding);
    actions.appendChild(skip);
    const next = el('button', 'btn btn-primary', 'Continue');
    next.addEventListener('click', completeOnboardingStep);
    actions.appendChild(next);
    wrap.appendChild(actions);
    return wrap;
  }

  function renderOnboardingIndex() {
    const wrap = el('div', 'onboarding-step');
    wrap.appendChild(el('h1', 'onboarding-title', 'Indexing your email…'));
    wrap.appendChild(el('p', 'onboarding-subtitle', 'We are scanning messages, extracting people, and finding files so you can focus on what matters.'));

    const track = el('div', 'onboarding-progress-track');
    const fill = el('div', 'onboarding-progress-fill');
    fill.style.width = '0%';
    track.appendChild(fill);
    wrap.appendChild(track);

    const status = el('div', 'onboarding-index-status', 'Starting…');
    wrap.appendChild(status);

    const insight = el('div', 'onboarding-insight hidden');
    insight.appendChild(el('div', 'onboarding-insight-title', 'First insight ready'));
    const unreadCount = (D._msgs || []).filter(m => !m.seen && m.bucket === 'imbox').length;
    const todoCount = (D._msgs || []).filter(m => !m.seen && m.bucket === 'imbox' && (m.fl === 'todo' || m.replyLater)).length;
    insight.appendChild(el('div', 'onboarding-insight-body', `You have ${unreadCount} unread messages in your Inbox, including ${todoCount} flagged for follow-up.`));
    wrap.appendChild(insight);

    const actions = el('div', 'onboarding-actions');
    const skip = el('button', 'btn btn-ghost', 'Skip');
    skip.addEventListener('click', skipOnboarding);
    actions.appendChild(skip);
    const next = el('button', 'btn btn-primary hidden', 'Continue');
    next.addEventListener('click', completeOnboardingStep);
    actions.appendChild(next);
    wrap.appendChild(actions);

    clearOnboardingInterval();
    let progress = 0;
    const statuses = ['Scanning messages…', 'Extracting people…', 'Finding files…', 'Building context…', 'Almost there…'];
    onboardingProgressInterval = setInterval(() => {
      progress += Math.random() * 18 + 6;
      if (progress >= 100) {
        progress = 100;
        clearOnboardingInterval();
        status.textContent = 'Ready';
        insight.classList.remove('hidden');
        next.classList.remove('hidden');
        next.textContent = 'Continue';
      } else {
        status.textContent = statuses[Math.min(Math.floor((progress / 100) * statuses.length), statuses.length - 1)];
      }
      fill.style.width = progress + '%';
    }, 240);

    return wrap;
  }

  function renderOnboardingDone() {
    const wrap = el('div', 'onboarding-step');
    wrap.appendChild(el('h1', 'onboarding-title', 'You are all set'));
    wrap.appendChild(el('p', 'onboarding-subtitle', 'Here are 3 things to focus on this week:'));

    const list = el('div', 'onboarding-focus-list');
    const focusItems = getOnboardingFocusItems();
    focusItems.forEach(item => {
      const row = el('div', 'onboarding-focus-item');
      const iconEl = el('div', 'onboarding-focus-icon');
      iconEl.appendChild(icon(item.icon));
      row.appendChild(iconEl);
      const body = el('div', 'onboarding-focus-body');
      body.appendChild(el('div', 'onboarding-focus-title', item.title));
      body.appendChild(el('div', 'onboarding-focus-meta', item.meta));
      row.appendChild(body);
      list.appendChild(row);
    });
    wrap.appendChild(list);

    const actions = el('div', 'onboarding-actions');
    const skip = el('button', 'btn btn-ghost', 'Skip');
    skip.addEventListener('click', skipOnboarding);
    actions.appendChild(skip);
    const open = el('button', 'btn btn-primary', 'Open Inbox');
    open.addEventListener('click', completeOnboardingStep);
    actions.appendChild(open);
    wrap.appendChild(actions);
    return wrap;
  }

  function getOnboardingFocusItems() {
    const items = [];
    const unreadTodos = (D._msgs || [])
      .filter(m => !m.seen && m.bucket === 'imbox' && (m.fl === 'todo' || m.replyLater || m.fl === 'wait'))
      .sort((a, b) => (b.st || '').localeCompare(a.st || ''))
      .slice(0, 3);
    unreadTodos.forEach(m => {
      const c = getContact(m.pid);
      items.push({ icon: 'ph-envelope-simple', title: m.subj, meta: (c ? c.name : m.fm) + ' · ' + (m.tm || 'recent') });
    });

    if (items.length < 3) {
      const tasks = (D.agentTasks || [])
        .filter(t => t.status === 'go' || t.status === 'wt')
        .slice(0, 3 - items.length);
      tasks.forEach(t => {
        items.push({ icon: 'ph-sparkle', title: t.name, meta: 'Agent task · ' + (t.eta || 'soon') });
      });
    }

    if (items.length < 3) {
      const meetings = (D.events || D._meetings || [])
        .filter(m => m.br && !m.post)
        .slice(0, 3 - items.length);
      meetings.forEach(m => {
        items.push({ icon: 'ph-calendar-blank', title: m.title, meta: m.ppl + ' · ' + (m.dt || '') });
      });
    }

    if (items.length === 0) {
      items.push({ icon: 'ph-tray', title: 'Your Inbox is calm', meta: 'No urgent items right now' });
    }
    return items.slice(0, 3);
  }

  function renderDetailPanel() {
    const panel = document.getElementById('detail-panel');
    if (!panel || panel.classList.contains('hidden')) return;

    let content = null;
    if (state.selectedFileId) {
      const f = (D._files || []).find(x => x.id === state.selectedFileId);
      if (f) content = renderFilePanel(f);
    } else if (state.selectedMessageId) {
      const m = (D._msgs || []).find(x => x.pid + '-' + x.subj === state.selectedMessageId);
      if (m) content = renderMessagePanel(m);
    } else if (state.selectedMeetingId) {
      const m = (D._meetings || []).find(x => x.id === state.selectedMeetingId);
      if (m) content = renderMeetingPanel(m);
    } else if (state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      if (c) content = renderContactPanel(c);
    }

    if (content) {
      panel.innerHTML = '';
      panel.appendChild(content);
    }
  }

  function openReadTogether() {
    const allEvents = filterFeedEvents(buildFeed());
    const unread = allEvents.filter(e => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened && !e.data.seen);
    if (unread.length === 0) {
      showToast('No unread emails to read together');
      return;
    }
    state.readTogetherOpen = true;
    state.readTogetherIndex = 0;
    renderMain();
  }

  function closeReadTogether() {
    state.readTogetherOpen = false;
    state.readTogetherIndex = 0;
    renderMain();
  }

  function renderReadTogether() {
    const container = el('div', 'view read-together-view');
    const allEvents = filterFeedEvents(buildFeed());
    const unread = allEvents.filter(e => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened && !e.data.seen);

    if (unread.length === 0 || state.readTogetherIndex >= unread.length) {
      closeReadTogether();
      showToast('All caught up');
      return container;
    }

    const ev = unread[state.readTogetherIndex];
    const m = ev.data;
    const contact = getContact(m.pid);

    const header = el('div', 'read-together-header');
    const progress = el('div', 'read-together-progress', (state.readTogetherIndex + 1) + ' of ' + unread.length);
    const closeBtn = el('button', 'icon-btn');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closeReadTogether);
    header.appendChild(progress);
    header.appendChild(closeBtn);
    container.appendChild(header);

    const card = el('div', 'read-together-card');
    const meta = el('div', 'read-together-meta');
    meta.appendChild(renderAvatar(contact, 'read-together-avatar', contact ? contact.name[0] : '?', contact ? () => openContact(contact.id) : null));
    const sender = el('div', 'read-together-sender');
    sender.appendChild(el('div', 'read-together-name', contact ? contact.name : 'Unknown'));
    sender.appendChild(el('div', 'read-together-email', contact ? contact.em : m.fm));
    meta.appendChild(sender);
    meta.appendChild(el('span', 'read-together-time', m.tm));
    card.appendChild(meta);

    card.appendChild(el('h2', 'read-together-subject', m.subj));

    const body = el('div', 'read-together-body');
    formatMessageBody(m).split(/\n\s*\n/).forEach(p => {
      const trimmed = p.trim();
      if (!trimmed) return;
      body.appendChild(el('p', '', trimmed));
    });
    card.appendChild(body);
    container.appendChild(card);

    const actions = el('div', 'read-together-actions');

    const nextBtn = el('button', 'btn btn-primary btn-lg');
    nextBtn.appendChild(icon('ph-check'));
    nextBtn.appendChild(el('span', '', 'Next'));
    nextBtn.title = 'Mark as read and continue';
    nextBtn.addEventListener('click', () => {
      m.seen = true;
      state.readTogetherIndex++;
      renderMain();
    });

    const replyBtn = el('button', 'btn btn-secondary');
    replyBtn.appendChild(icon('ph-arrow-u-up-left'));
    replyBtn.appendChild(el('span', '', 'Reply'));
    replyBtn.addEventListener('click', () => {
      closeReadTogether();
      openMessage(m);
    });

    const pendingBtn = el('button', 'btn btn-secondary');
    pendingBtn.appendChild(icon('ph-clock'));
    pendingBtn.appendChild(el('span', '', 'Pending'));
    pendingBtn.addEventListener('click', () => {
      replyLaterMessage(m);
      state.readTogetherIndex++;
      renderMain();
    });

    const moreBtn = el('button', 'btn btn-ghost');
    moreBtn.appendChild(icon('ph-dots-three'));
    moreBtn.appendChild(el('span', '', 'More'));
    moreBtn.addEventListener('click', () => {
      showContextMenuForMessage({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, preventDefault: () => {} }, m);
    });

    actions.appendChild(nextBtn);
    actions.appendChild(replyBtn);
    actions.appendChild(pendingBtn);
    actions.appendChild(moreBtn);
    container.appendChild(actions);

    return container;
  }

  function isInBucketView(ev, view) {
    if (ev.type === 'meeting') return view === 'imbox';
    const m = ev.data;
    const contact = getContact(m.pid);
    if (contact && contact.blocked) return false;
    if (m.blocked) return false;

    const isTrashedOrSpam = m.trashed || m.spam;
    switch (view) {
      case 'imbox':
        return m.bucket === 'imbox' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened && !isTrashedOrSpam;
      case 'feed':
        return m.bucket === 'feed' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened && !isTrashedOrSpam;
      case 'paperTrail':
        return m.bucket === 'paperTrail' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened && !isTrashedOrSpam;
      case 'screener':
        return contact && contact.firstSeen && !contact.screened && !isTrashedOrSpam;
      case 'replyLater':
        return m.replyLater === true && !isTrashedOrSpam;
      case 'setAside':
        return m.setAside === true && !isTrashedOrSpam;
      case 'bubbleUp':
        return m.bubbleUpUntil && new Date(m.bubbleUpUntil).getTime() > Date.now() && !isTrashedOrSpam;
      case 'trash':
        return m.trashed === true && !m.permanentlyDeleted;
      case 'spam':
        return m.spam === true && !m.permanentlyDeleted;
      default:
        return false;
    }
  }

  function bucketEmptyCopy(view) {
    const map = {
      imbox: { text: '重要的、需要你来处理的对话会出现在这里。', title: 'Inbox 是给你的重要邮件', art: 'art-purple' },
      feed: { text: 'Newsletter、订阅和批量邮件会出现在这里，像刷信息流一样阅读。', title: 'Stream 是 newsletter 的专属位置', art: 'art-green' },
      paperTrail: { text: '发票、收据、验证码和系统通知会安静地躺在这里，需要时随时查找。', title: 'Records 放你不需要天天看的邮件', art: 'art-orange' },
      screener: { text: '所有新联系人都已经过筛选。你的收件箱由你做主。', title: 'Gate 很干净', art: 'art-blue' },
      replyLater: { text: '需要回复但暂时没空的邮件先放在这里，批量专注处理。', title: 'Pending 为空', art: 'art-orange' },
      setAside: { text: '想留作参考或稍后处理的邮件可以暂时存在这里。', title: 'Saved 为空', art: 'art-green' },
      bubbleUp: { text: '被提醒的邮件会在指定时间重新浮上来。', title: 'Remind 为空', art: 'art-blue' },
      trash: { text: '删除的邮件会在这里保留 30 天，之后自动清空。', title: 'Trash 为空', art: 'art-red' },
      spam: { text: '被标记为垃圾邮件的内容会集中在这里。', title: 'Spam 为空', art: 'art-red' },
    };
    return map[view] || { text: 'Nothing here.', title: null, art: null };
  }

  function renderBucket(view) {
    const container = el('div', 'view bucket-view');
    const allEvents = buildFeed();
    const filteredEvents = filterFeedEvents(allEvents).filter(e => isInBucketView(e, view));

    const list = el('div', 'feed-list');

    if (view === 'screener') {
      list.appendChild(renderSectionHeader('New senders', 'View history', () => setView('screenerHistory')));
    }

    if (view === 'replyLater' && filteredEvents.length > 0) {
      const focusBar = el('div', 'focus-reply-bar');
      const focusBtn = el('button', 'btn btn-primary', 'Focus & Reply');
      focusBtn.addEventListener('click', () => {
        state.focusReplyOpen = true;
        state.focusReplyIndex = 0;
        state.focusReplyCompletedIds.clear();
        renderMain();
      });
      focusBar.appendChild(focusBtn);
      focusBar.appendChild(el('span', 'focus-reply-hint', 'Reply to your Pending emails one by one, without distractions.'));
      list.appendChild(focusBar);
    }

    if (view === 'trash' && filteredEvents.length > 0) {
      const trashBar = el('div', 'trash-bar');
      const emptyBtn = el('button', 'btn btn-secondary btn-sm', 'Empty Trash');
      emptyBtn.addEventListener('click', emptyTrash);
      trashBar.appendChild(emptyBtn);
      trashBar.appendChild(el('span', 'trash-hint', filteredEvents.length + ' email' + (filteredEvents.length > 1 ? 's' : '') + ' will be permanently removed'));
      list.appendChild(trashBar);
    }

    if (view === 'spam' && filteredEvents.length > 0) {
      const spamBar = el('div', 'spam-bar');
      const notSpamBtn = el('button', 'btn btn-secondary btn-sm', 'Mark all as not spam');
      notSpamBtn.addEventListener('click', () => {
        filteredEvents.forEach(ev => { if (ev.type === 'message') ev.data.spam = false; });
        showToast('Marked as not spam');
        renderMain();
      });
      spamBar.appendChild(notSpamBtn);
      list.appendChild(spamBar);
    }

    if (filteredEvents.length === 0) {
      const emptyCopy = bucketEmptyCopy(view);
      list.appendChild(renderEmpty(emptyCopy.text, 'ph-inbox', emptyCopy.title, emptyCopy.art));
    } else {
      if (view === 'imbox') {
        filteredEvents.sort((a, b) => priorityScore(b) - priorityScore(a));
      } else if (view === 'screener') {
        filteredEvents.sort((a, b) => a.sortKey - b.sortKey);
      } else {
        filteredEvents.sort((a, b) => b.sortKey - a.sortKey);
      }
      const pageSize = state.feedPageSize;
      const paged = filteredEvents.slice(0, state.feedOffset + pageSize);
      paged.forEach((ev, idx) => list.appendChild(renderFeedItem(ev, view, idx)));

      if (paged.length < filteredEvents.length) {
        const loadMore = el('button', 'feed-load-more');
        loadMore.appendChild(icon('ph-caret-down'));
        loadMore.appendChild(el('span', '', 'Load more'));
        const remaining = filteredEvents.length - paged.length;
        loadMore.appendChild(el('span', 'feed-load-more-count', remaining + ' more'));
        loadMore.addEventListener('click', () => {
          state.feedOffset += pageSize;
          renderMain();
        });
        list.appendChild(loadMore);
      }
    }

    container.appendChild(list);
    return container;
  }

  function renderGate() {
    const container = el('div', 'view gate-view');

    const intro = el('div', 'gate-intro');
    intro.appendChild(el('p', 'gate-intro-text', '以下联系人第一次给你发邮件。由你决定是否接收。'));
    container.appendChild(intro);

    const newSenders = D.contacts.filter(c => c.firstSeen && !c.screened && !c.blocked);

    if (newSenders.length === 0) {
      const empty = renderEmpty('没有新的发件人需要筛选，你的收件箱由你掌控。✨', 'ph-funnel', 'Gate 很干净', 'art-purple');
      empty.className += ' gate-empty';
      container.appendChild(empty);

      const historyLink = el('button', 'gate-history-link', '查看 Gate 历史');
      historyLink.addEventListener('click', () => setView('screenerHistory'));
      container.appendChild(historyLink);
      return container;
    }

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
    yesBtn.title = '允许并选择邮件去向';
    const noBtn = el('button', 'gate-btn gate-no');
    noBtn.innerHTML = '<i class="ph ph-thumbs-down"></i><span>屏蔽</span>';
    noBtn.title = '屏蔽此发件人';

    const bucketBar = el('div', 'gate-bucket-bar hidden');
    const bucketIcons = { imbox: 'ph-tray', feed: 'ph-newspaper', paperTrail: 'ph-receipt' };
    ['imbox', 'feed', 'paperTrail'].forEach(bucket => {
      const b = el('button', 'gate-bucket-btn');
      b.innerHTML = '<i class="ph ' + bucketIcons[bucket] + '"></i><span>' + viewTitle(bucket) + '</span>';
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
    container.appendChild(cardWrap);

    const historyLink = el('button', 'gate-history-link', '查看 Gate 历史');
    historyLink.addEventListener('click', () => setView('screenerHistory'));
    container.appendChild(historyLink);

    return container;
  }

  function renderStream() {
    const container = el('div', 'view stream-view');
    const allEvents = filterFeedEvents(buildFeed()).filter(e => isInBucketView(e, 'feed'));

    if (allEvents.length === 0) {
      container.appendChild(renderEmpty('Newsletter、订阅和批量邮件会出现在这里，像刷信息流一样阅读。', 'ph-newspaper', 'Stream 是 newsletter 的专属位置', 'art-green'));
      return container;
    }

    const list = el('div', 'stream-list');
    allEvents.sort((a, b) => b.sortKey - a.sortKey);

    allEvents.forEach(ev => {
      const m = ev.data;
      const contact = getContact(m.pid);
      const card = el('div', 'stream-card');

      const header = el('div', 'stream-card-header');
      header.appendChild(renderAvatar(contact, 'stream-avatar', contact ? contact.name[0] : '?', contact ? () => openContact(contact.id) : null));
      const meta = el('div', 'stream-card-meta');
      const nameRow = el('div', 'stream-card-name-row');
      nameRow.appendChild(el('span', 'stream-card-name', contact ? contact.name : 'Unknown'));
      nameRow.appendChild(el('span', 'stream-card-email', '<' + (contact ? contact.em : m.fm) + '>'));
      meta.appendChild(nameRow);
      meta.appendChild(el('div', 'stream-card-to', 'to You'));
      header.appendChild(meta);
      header.appendChild(el('span', 'stream-card-time', m.tm));
      card.appendChild(header);

      card.appendChild(el('h2', 'stream-card-subject', m.subj));

      const body = el('div', 'stream-card-body');
      const isExpanded = state.expandedStreamMessages.has(m.id);
      const preview = formatMessageBody(m);
      const paragraphs = preview.split(/\n\s*\n/).filter(p => p.trim());
      const visibleParagraphs = isExpanded ? paragraphs : paragraphs.slice(0, 2);
      visibleParagraphs.forEach(p => body.appendChild(el('p', '', p.trim())));

      if (paragraphs.length > 2 && !isExpanded) {
        const more = el('button', 'stream-card-more', 'See more...');
        more.addEventListener('click', () => {
          state.expandedStreamMessages.add(m.id);
          renderMain();
        });
        body.appendChild(more);
      }

      card.appendChild(body);
      list.appendChild(card);
    });

    container.appendChild(list);
    return container;
  }

  function renderFocusReply() {
    const container = el('div', 'view focus-reply-view');
    const allEvents = filterFeedEvents(buildFeed()).filter(e => isInBucketView(e, 'replyLater'));
    const pendingEvents = allEvents.filter(ev => !state.focusReplyCompletedIds.has(ev.data.id));

    if (allEvents.length === 0) {
      state.focusReplyOpen = false;
      state.focusReplyIndex = 0;
      state.focusReplyCompletedIds.clear();
      renderMain();
      return container;
    }

    const header = el('div', 'focus-reply-header');
    const headerText = el('div', 'focus-reply-header-text');
    headerText.appendChild(el('h1', 'focus-reply-title', 'Focus & Reply'));
    headerText.appendChild(el('div', 'focus-reply-subtitle', pendingEvents.length + ' pending'));
    header.appendChild(headerText);
    const closeBtn = el('button', 'icon-btn');
    closeBtn.title = 'Close Focus & Reply';
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', () => {
      state.focusReplyOpen = false;
      state.focusReplyIndex = 0;
      state.focusReplyCompletedIds.clear();
      renderMain();
    });
    header.appendChild(closeBtn);
    container.appendChild(header);

    const scrollWrap = el('div', 'focus-reply-scroll');

    if (pendingEvents.length === 0) {
      const doneState = el('div', 'focus-reply-done-state');
      doneState.appendChild(icon('ph-check-circle'));
      doneState.appendChild(el('h2', '', 'All caught up'));
      doneState.appendChild(el('p', '', 'You\'ve cleared your Pending replies.'));
      const backBtn = el('button', 'btn btn-primary', 'Back to Inbox');
      backBtn.addEventListener('click', () => {
        state.focusReplyOpen = false;
        state.focusReplyCompletedIds.clear();
        renderMain();
      });
      doneState.appendChild(backBtn);
      scrollWrap.appendChild(doneState);
    } else {
      pendingEvents.forEach((ev, idx) => {
        scrollWrap.appendChild(renderFocusReplyItem(ev, idx));
      });
    }

    container.appendChild(scrollWrap);
    return container;
  }

  function renderFocusReplyItem(ev, idx) {
    const m = ev.data;
    const contact = getContact(m.pid);
    if (!m.aiDraft) m.aiDraft = generateAiDraft(m, contact);

    const item = el('div', 'focus-reply-item');
    item.dataset.messageId = m.id;
    item.style.setProperty('--item-index', idx);

    const originalCard = el('div', 'focus-reply-card');
    const meta = el('div', 'focus-reply-meta');
    meta.appendChild(renderAvatar(contact, 'focus-reply-avatar', contact ? contact.name[0] : '?', contact ? () => openContact(contact.id) : null));
    const sender = el('div', 'focus-reply-sender');
    sender.appendChild(el('div', 'focus-reply-name', contact ? contact.name : 'Unknown'));
    sender.appendChild(el('div', 'focus-reply-email', contact ? contact.em : m.fm));
    meta.appendChild(sender);
    meta.appendChild(el('span', 'focus-reply-time', m.tm));
    originalCard.appendChild(meta);
    originalCard.appendChild(el('h2', 'focus-reply-subject', m.subj));

    const body = el('div', 'focus-reply-body');
    formatMessageBody(m).split(/\n\s*\n/).forEach(p => {
      const trimmed = p.trim();
      if (!trimmed) return;
      body.appendChild(el('p', '', trimmed));
    });
    originalCard.appendChild(body);
    item.appendChild(originalCard);

    const replyCard = el('div', 'focus-reply-reply-card');
    const replyHeader = el('div', 'focus-reply-reply-header');
    replyHeader.appendChild(icon('ph-sparkle'));
    replyHeader.appendChild(el('span', '', 'SendPalm draft'));
    replyCard.appendChild(replyHeader);

    const textarea = el('textarea', 'focus-reply-reply-textarea');
    textarea.value = m.aiDraft || '';
    textarea.placeholder = 'Write your reply, or edit the draft below...';
    textarea.addEventListener('input', () => {
      m.aiDraft = textarea.value;
    });
    replyCard.appendChild(textarea);

    const actions = el('div', 'focus-reply-item-actions');

    const sendBtn = el('button', 'btn btn-primary');
    sendBtn.appendChild(icon('ph-paper-plane-right'));
    sendBtn.appendChild(el('span', '', 'Send'));
    sendBtn.addEventListener('click', () => sendAiDraftReply(m));

    const regenerateBtn = el('button', 'btn btn-secondary');
    regenerateBtn.appendChild(icon('ph-arrows-clockwise'));
    regenerateBtn.appendChild(el('span', '', 'Regenerate'));
    regenerateBtn.addEventListener('click', () => {
      m.aiDraft = '';
      renderMain();
    });

    const editBtn = el('button', 'btn btn-secondary');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.appendChild(el('span', '', 'Edit'));
    editBtn.addEventListener('click', () => editAiDraftReply(m));

    const skipBtn = el('button', 'btn btn-ghost');
    skipBtn.appendChild(el('span', '', 'Skip'));
    skipBtn.addEventListener('click', () => {
      state.focusReplyCompletedIds.add(m.id);
      renderMain();
    });

    const doneBtn = el('button', 'btn btn-ghost');
    doneBtn.appendChild(el('span', '', 'Done'));
    doneBtn.addEventListener('click', () => {
      clearWorkflowFlags(m);
      state.focusReplyCompletedIds.add(m.id);
      renderMain();
      showToast('Marked as done');
    });

    actions.appendChild(sendBtn);
    actions.appendChild(regenerateBtn);
    actions.appendChild(editBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(doneBtn);
    replyCard.appendChild(actions);
    item.appendChild(replyCard);

    return item;
  }

  function generateAiDraft(m, contact, thread) {
    thread = thread || [m];
    const recentCount = thread.length;
    const lastSentDirection = thread.filter(x => x.fm !== '你').slice(-1)[0] || m;
    const name = contact ? contact.name : (m.fm || 'there');
    const subject = baseSubject(m.subj);
    const body = formatMessageBody(m).toLowerCase();

    if (subject.includes('metrics') || subject.includes('numbers') || body.includes('arr') || body.includes('retention')) {
      return 'Hi ' + name + ',\n\nThanks for the follow-up. I\'ve attached the latest snapshot below:\n\n- ARR: $2.4M (up 142% YoY)\n- Net revenue retention: 118%\n- CAC payback: 13 months\n- Logo churn: 4.2% annually\n\nHappy to walk through the cohort analysis if helpful.\n\nBest,\nEdwin';
    }
    if (subject.includes('合同') || subject.includes('proposal') || body.includes('付款') || body.includes('deliverable')) {
      return name + '，\n\n感谢反馈，回复如下：\n\n1. 付款节奏同意按 30-40-30 调整。\n2. 交付物定义已补充在附件 v3 中。\n3. 违约金上限我们建议保持 10%，但可增加「不可抗力」免责条款。\n\n请查收附件，会上我们逐条确认。\n\nBest,\nEdwin';
    }
    if (subject.includes('部署') || subject.includes('测试') || body.includes('测试计划')) {
      return 'Hi ' + name + ',\n\n测试计划已看，周五上午 10 点部署可行。支付模块的回归用例和性能基线我都标注了，整体 OK。\n\nBest,\nEdwin';
    }
    if (subject.includes('meeting') || subject.includes('schedule') || body.includes('available')) {
      return 'Hi ' + name + ',\n\nThanks for reaching out. I\'m free Tuesday afternoon or Wednesday morning this week. Let me know what works best for you.\n\nBest,\nEdwin';
    }
    if (body.includes('urgent') || body.includes('紧急') || body.includes('今日') || subject.includes('紧急')) {
      return 'Hi ' + name + ',\n\nGot it — I\'ll get back to you with a decision by end of day.\n\nBest,\nEdwin';
    }
    return 'Hi ' + name + ',\n\nThanks for the note. I\'ll review and get back to you shortly.\n\nBest,\nEdwin';
  }

  function sendAiDraftReply(m) {
    const contact = getContact(m.pid);
    const draft = m.aiDraft || '';
    if (!draft.trim()) {
      showToast('No draft to send');
      return;
    }
    sendMessage({
      to: contact ? contact.name : m.fm,
      subject: 'Re: ' + baseSubject(m.subj),
      body: draft,
      mode: 'reply',
      originalMsg: m
    });
    clearWorkflowFlags(m);
    state.focusReplyCompletedIds.add(m.id);
    renderMain();
    showToast('Reply sent');
  }

  function editAiDraftReply(m) {
    const contact = getContact(m.pid);
    const quoteHeader = 'On ' + m.tm + ', ' + (contact ? contact.name : m.fm) + ' wrote:';
    openComposeWithContext(contact ? contact.name : m.fm, 'Re: ' + baseSubject(m.subj), m.aiDraft || '', 'reply', m, quoteHeader);
  }

  function renderSectionHeader(title, actionLabel, action, modifier) {
    const header = el('div', 'feed-section-header' + (modifier ? ' feed-section-' + modifier : ''));
    const left = el('div', 'feed-section-title-wrap');
    left.appendChild(el('span', 'feed-section-title', title));
    header.appendChild(left);
    if (actionLabel && action) {
      const btn = el('button', 'feed-section-action', actionLabel);
      btn.addEventListener('click', action);
      header.appendChild(btn);
    }
    return header;
  }

  function renderImboxPile(events, title, iconName, pileId, pileView) {
    const pile = el('div', 'imbox-pile' + (state.expandedPile === pileId ? ' expanded' : ''));
    const header = el('div', 'imbox-pile-header');
    header.appendChild(icon(iconName));
    header.appendChild(el('span', '', title));
    header.appendChild(el('span', 'imbox-pile-count', events.length));
    pile.appendChild(header);
    header.addEventListener('click', () => {
      state.expandedPile = state.expandedPile === pileId ? null : pileId;
      renderMain();
    });

    if (state.expandedPile === pileId) {
      const drawer = el('div', 'pile-drawer');
      events.slice(0, 5).forEach(ev => {
        const row = el('div', 'pile-drawer-row');
        const m = ev.data;
        const contact = getContact(m.pid);
        row.appendChild(renderAvatar(contact, 'pile-drawer-avatar', contact ? contact.name[0] : '?', contact ? () => openContact(contact.id) : null));
        const body = el('div', 'pile-drawer-body');
        body.appendChild(el('div', 'pile-drawer-subj', m.subj));
        body.appendChild(el('div', 'pile-drawer-from', contact ? contact.name : m.fm));
        row.appendChild(body);
        row.appendChild(el('span', 'pile-drawer-time', m.tm));
        row.addEventListener('click', () => openMessage(m));
        drawer.appendChild(row);
      });
      if (events.length > 5) {
        const more = el('div', 'pile-drawer-more', '+' + (events.length - 5) + ' more');
        drawer.appendChild(more);
      }
      const boardBtn = el('button', 'pile-board-btn', 'Open ' + title + ' board');
      boardBtn.addEventListener('click', () => setView(pileView));
      drawer.appendChild(boardBtn);
      pile.appendChild(drawer);
    }
    return pile;
  }

  function renderScreenerHistory() {
    const container = el('div', 'view screener-history-view');

    const wrap = el('div', 'screener-history-wrap');

    const inCol = el('div', 'screener-history-col');
    inCol.appendChild(el('div', 'screener-history-heading', 'Screened In'));
    const inContacts = D.contacts.filter(c => c.screened && !c.firstSeen && !c.blocked);
    if (inContacts.length === 0) {
      inCol.appendChild(el('div', 'screener-history-empty', 'No senders screened in yet.'));
    } else {
      inContacts.forEach(c => inCol.appendChild(renderScreenerHistoryRow(c, true)));
    }

    const outCol = el('div', 'screener-history-col');
    outCol.appendChild(el('div', 'screener-history-heading', 'Screened Out'));
    const outContacts = D.contacts.filter(c => c.blocked);
    if (outContacts.length === 0) {
      outCol.appendChild(el('div', 'screener-history-empty', 'No senders blocked yet.'));
    } else {
      outContacts.forEach(c => outCol.appendChild(renderScreenerHistoryRow(c, false)));
    }

    wrap.appendChild(inCol);
    wrap.appendChild(outCol);
    container.appendChild(wrap);
    return container;
  }

  function renderScreenerHistoryRow(c, isIn) {
    const row = el('div', 'screener-history-row');
    row.appendChild(renderAvatar(c, 'screener-history-avatar', c.name[0]));
    const info = el('div', 'screener-history-info');
    info.appendChild(el('div', 'screener-history-name', c.name));
    info.appendChild(el('div', 'screener-history-email', c.em));
    row.appendChild(info);
    const toggle = el('button', 'contact-toggle' + (isIn ? ' on' : ''));
    toggle.title = isIn ? 'Screened in' : 'Blocked';
    toggle.addEventListener('click', () => {
      if (isIn) {
        c.blocked = true;
      } else {
        c.blocked = false;
        c.screened = true;
        c.firstSeen = false;
      }
      renderMain();
      showToast(isIn ? 'Moved to Screened Out' : 'Moved to Screened In');
    });
    row.appendChild(toggle);
    return row;
  }

  function renderImbox() {
    const container = el('div', 'view imbox-view');
    const allEvents = applyImboxFilters(filterFeedEvents(buildFeed()));

    // Remind banner
    const bubbled = allEvents.filter(e => isInBucketView(e, 'bubbleUp'));
    if (bubbled.length) {
      const banner = el('div', 'bubble-up-banner');
      banner.appendChild(icon('ph-arrow-fat-line-up'));
      const bannerBody = el('div', 'bubble-up-body');
      bannerBody.appendChild(el('div', 'bubble-up-title', bubbled.length + ' reminded'));
      bannerBody.appendChild(el('div', 'bubble-up-subtitle', 'Back at the top of your Inbox'));
      banner.appendChild(bannerBody);
      banner.addEventListener('click', () => setView('bubbleUp'));
      container.appendChild(banner);
    }

    const isImboxMsg = (e) => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened;
    const newForYou = allEvents.filter(e => isImboxMsg(e) && !e.data.seen);
    const previouslySeen = allEvents.filter(e => isImboxMsg(e) && e.data.seen);
    const replyLater = allEvents.filter(e => isInBucketView(e, 'replyLater'));
    const setAside = allEvents.filter(e => isInBucketView(e, 'setAside'));
    const bubbleUp = allEvents.filter(e => isInBucketView(e, 'bubbleUp'));

    if (newForYou.length === 0 && previouslySeen.length === 0 && replyLater.length === 0 && setAside.length === 0 && bubbleUp.length === 0) {
      container.appendChild(renderEmpty('重要的、需要你来处理的对话会出现在这里。', 'ph-inbox', 'Inbox 是给你的重要邮件', 'art-purple'));
      return container;
    }

    const list = el('div', 'feed-list');

    if (newForYou.length) {
      list.appendChild(renderSectionHeader('New for you', 'Read together', openReadTogether, 'new'));
      newForYou.forEach((ev, idx) => list.appendChild(renderFeedItem(ev, 'imbox', idx)));
    }

    if (previouslySeen.length) {
      list.appendChild(renderSectionHeader('Previously seen', null, null, 'seen'));
      previouslySeen.forEach((ev, idx) => list.appendChild(renderFeedItem(ev, 'imbox', newForYou.length + idx)));
    }

    container.appendChild(list);

    const workflowItems = [
      { events: replyLater, title: 'Pending', icon: 'ph-clock', id: 'pending', view: 'replyLater' },
      { events: setAside, title: 'Saved', icon: 'ph-push-pin', id: 'saved', view: 'setAside' },
      { events: bubbleUp, title: 'Remind', icon: 'ph-arrow-fat-line-up', id: 'remind', view: 'bubbleUp' },
    ].filter(item => item.events.length > 0);

    if (workflowItems.length) {
      const piles = el('div', 'imbox-piles');
      workflowItems.forEach(item => piles.appendChild(renderImboxPile(item.events, item.title, item.icon, item.id, item.view)));
      container.appendChild(piles);
    }

    return container;
  }

  function renderPeople() {
    const container = el('div', 'view people-view');

    const filterBar = el('div', 'filter-bar');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
      { id: 'risk', label: 'Need Follow Up' },
      { id: 'cold', label: 'Cold' },
    ];
    filters.forEach(f => {
      const btn = el('button', 'filter-pill' + (state.peopleFilter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.peopleFilter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });

    const groupToggle = el('div', 'filter-group-toggle');
    const allBtn = el('button', 'filter-group-btn' + (state.peopleGroupBy === 'all' ? ' active' : ''), 'All contacts');
    allBtn.addEventListener('click', () => { state.peopleGroupBy = 'all'; renderMain(); });
    const byBtn = el('button', 'filter-group-btn' + (state.peopleGroupBy === 'company' ? ' active' : ''), 'By company');
    byBtn.addEventListener('click', () => { state.peopleGroupBy = 'company'; renderMain(); });
    groupToggle.appendChild(allBtn);
    groupToggle.appendChild(byBtn);
    filterBar.appendChild(groupToggle);
    filterBar.appendChild(renderMoreFiltersButton('contacts'));
    container.appendChild(filterBar);

    const grid = el('div', 'people-grid');
    const contacts = filterContacts(D.contacts);

    if (contacts.length === 0) {
      grid.appendChild(renderEmpty('No contacts match this filter.', 'ph-users'));
    } else if (state.peopleGroupBy === 'company') {
      const groups = {};
      contacts.forEach(c => {
        const key = (c.company || '').toLowerCase();
        if (!groups[key]) groups[key] = { company: c.company || '', contacts: [] };
        groups[key].contacts.push(c);
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return groups[a].company.localeCompare(groups[b].company, undefined, { sensitivity: 'base' });
      });
      sortedKeys.forEach(key => {
        const g = groups[key];
        if (g.company) {
          grid.appendChild(renderCompanyRow(g.company, g.contacts));
        } else {
          g.contacts.forEach(c => grid.appendChild(renderPersonCard(c)));
        }
      });
    } else {
      contacts.forEach(c => grid.appendChild(renderPersonCard(c)));
    }

    container.appendChild(grid);
    return container;
  }

  function renderCompanyRow(company, contacts) {
    const row = el('div', 'company-row');
    const health = computeCompanyHealth(contacts);
    const domain = getCompanyDomain(company);
    const initials = company.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || company[0].toUpperCase();

    const avatar = el('div', 'company-avatar', initials);
    avatar.style.background = avatarGradientFor(company);

    const body = el('div', 'company-body');
    const top = el('div', 'company-top');
    const nameWrap = el('div', 'company-name-wrap');
    nameWrap.appendChild(el('span', 'company-name', company));
    if (domain) nameWrap.appendChild(el('span', 'company-domain', domain));
    top.appendChild(nameWrap);

    const count = el('span', 'company-count', contacts.length + ' people');
    top.appendChild(count);
    body.appendChild(top);

    const bottom = el('div', 'company-bottom');
    const healthWrap = el('span', 'company-health');
    healthWrap.style.color = health.score >= 70 ? 'var(--green)' : health.score >= 40 ? 'var(--yellow)' : 'var(--red)';
    healthWrap.appendChild(icon(statusIconFor(health.score >= 70 ? 'active' : health.score >= 40 ? 'risk' : 'cold')));
    healthWrap.appendChild(el('span', '', health.label + ' · ' + health.score + '%'));
    bottom.appendChild(healthWrap);
    const topicText = contacts.map(c => c.title).filter(Boolean).slice(0, 3).join(' · ');
    if (topicText) bottom.appendChild(el('span', 'company-roles', topicText));
    body.appendChild(bottom);

    row.appendChild(avatar);
    row.appendChild(body);
    row.addEventListener('click', () => openCompanyView(company));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [
        { label: 'View account', icon: 'ph-buildings', action: () => openCompanyView(company) },
      ]);
    });
    return row;
  }

  function filterContacts(contacts) {
    let result = contacts;
    if (state.peopleFilter && state.peopleFilter !== 'all') {
      result = result.filter(c => c.grp === state.peopleFilter);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.co && c.co.toLowerCase().includes(q)) ||
        (c.tl && c.tl.toLowerCase().includes(q))
      );
    }
    result = applyContactsAdvancedFilters(result);
    return result;
  }

  function getCompanyContacts(company) {
    const target = (company || '').toLowerCase();
    return D.contacts.filter(c => (c.company || '').toLowerCase() === target);
  }

  function getCompanyDomain(company) {
    const contacts = getCompanyContacts(company);
    const email = contacts.map(c => c.emails && c.emails[0] && c.emails[0].value).find(Boolean);
    if (!email) return '';
    const match = email.match(/@([^@]+)$/);
    return match ? match[1] : '';
  }

  function computeCompanyHealth(contacts) {
    if (contacts.length === 0) return { score: 0, label: '—' };
    const total = contacts.reduce((sum, c) => sum + (c.health || 0), 0);
    const score = Math.round(total / contacts.length);
    return { score, label: score >= 70 ? 'Healthy' : score >= 40 ? 'At risk' : 'Cold' };
  }

  const avatarGradients = [
    'linear-gradient(135deg, #6366f1, #4f46e5)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #ec4899, #db2777)',
    'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #3b82f6, #2563eb)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #06b6d4, #0891b2)',
  ];

  function avatarGradientFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarGradients[Math.abs(hash) % avatarGradients.length];
  }

  function renderAvatar(contact, className, text, onClick) {
    let avatarEl;
    if (contact && contact.photo) {
      avatarEl = document.createElement('img');
      avatarEl.className = className;
      avatarEl.src = contact.photo;
      avatarEl.alt = contact.name || text || '';
      avatarEl.loading = 'lazy';
      avatarEl.onerror = function() {
        this.onerror = null;
        this.style.display = 'none';
        const fallback = el('div', className, text);
        fallback.style.background = avatarGradientFor(contact.name);
        if (onClick) wireAvatarClick(fallback, onClick);
        this.parentNode.replaceChild(fallback, this);
      };
    } else {
      avatarEl = el('div', className, text);
      if (contact) avatarEl.style.background = avatarGradientFor(contact.name);
      else avatarEl.style.background = '#999';
    }
    if (onClick) wireAvatarClick(avatarEl, onClick);
    return avatarEl;
  }

  function wireAvatarClick(avatarEl, onClick) {
    avatarEl.classList.add('avatar-clickable');
    avatarEl.style.cursor = 'pointer';
    avatarEl.title = 'View contact';
    avatarEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  function trendIcon(trd) {
    if (trd === 'up') return 'ph-trend-up';
    if (trd === 'dn') return 'ph-trend-down';
    return 'ph-minus';
  }

  function statusIconFor(grp) {
    if (grp === 'risk') return 'ph-warning';
    if (grp === 'cold') return 'ph-snowflake';
    return 'ph-check-circle';
  }

  function statusColorFor(grp) {
    if (grp === 'risk') return 'var(--yellow)';
    if (grp === 'cold') return 'var(--red)';
    return 'var(--green)';
  }

  function messageStatusInfo(fl) {
    if (fl === 'wait') return { label: 'Needs Reply', color: 'var(--yellow)', bg: 'var(--yellow-soft)', icon: 'ph-arrow-u-up-left' };
    if (fl === 'todo') return { label: 'Follow Up', color: 'var(--accent)', bg: 'var(--accent-soft)', icon: 'ph-flag' };
    if (fl === 'done') return { label: 'Done', color: 'var(--green)', bg: 'var(--green-soft)', icon: 'ph-check' };
    return null;
  }

  function renderPersonCard(c) {
    const card = el('div', 'person-card');
    card.addEventListener('click', () => openContact(c.id));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, [
        { label: 'Edit', icon: 'ph-pencil-simple', action: () => openContactModal(c.id) },
        { type: 'divider' },
        { label: 'Write to ' + c.name, icon: 'ph-pencil-simple', action: () => openCompose({ to: c.name, subject: '' }) },
      ]);
    });

    const avatar = renderAvatar(c, 'person-avatar', c.name[0]);

    const body = el('div', 'person-body');
    const top = el('div', 'person-top');
    const nameWrap = el('div', 'person-name-wrap');
    nameWrap.appendChild(el('span', 'person-name', c.name));
    if (c.merged) {
      const mergedTag = el('span', 'person-merged-tag', 'Merged');
      nameWrap.appendChild(mergedTag);
    }
    top.appendChild(nameWrap);
    const scoreWrap = el('span', 'person-score');
    scoreWrap.appendChild(icon(trendIcon(c.trd)));
    scoreWrap.appendChild(el('span', '', c.sc));
    scoreWrap.style.color = c.scC;
    top.appendChild(scoreWrap);

    const bottom = el('div', 'person-bottom');
    const coRole = el('span', 'person-co-role');
    const statusI = icon(statusIconFor(c.grp));
    statusI.style.color = statusColorFor(c.grp);
    coRole.appendChild(statusI);
    coRole.appendChild(el('span', '', c.co + (c.tl ? ' · ' + c.tl : '')));
    bottom.appendChild(coRole);
    const topicText = c.lc + (c.topics && c.topics.length ? ' · ' + c.topics.slice(0, 2).join(' · ') : '');
    const topic = el('span', 'person-topic', topicText);
    bottom.appendChild(topic);

    body.appendChild(top);
    body.appendChild(bottom);

    card.appendChild(avatar);
    card.appendChild(body);

    // Quick action buttons on hover
    const hoverActions = el('div', 'person-hover-actions');
    const writeBtn = el('button', 'icon-btn person-action-btn');
    writeBtn.title = 'Write to ' + c.name;
    writeBtn.appendChild(icon('ph-pencil-simple'));
    writeBtn.addEventListener('click', (e) => { e.stopPropagation(); openCompose({ to: c.name, subject: '' }); });
    hoverActions.appendChild(writeBtn);
    card.appendChild(hoverActions);

    return card;
  }

  function openContact(id) {
    state.selectedContactId = id;
    state.selectedMessageId = null;
    state.selectedMeetingId = null;
    state.selectedFileId = null;
    openDetailPanel(renderContactPanel(D.getP(id)));
    renderAgentPanel();
  }

  function openCompanyView(company) {
    state.view = 'company';
    state.selectedCompanyName = company;
    state.selectedContactId = null;
    state.selectedMessageId = null;
    state.selectedMeetingId = null;
    state.selectedFileId = null;
    closePanel();
    renderNav();
    renderTopBar();
    renderMain();
    renderAgentPanel();
  }

  function openDetailPanel(content) {
    const app = document.getElementById('app');
    const panel = document.getElementById('detail-panel');
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    app.classList.add('detail-open');
    panel.appendChild(content);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('open');
      });
    });
  }

  function closePanel() {
    const app = document.getElementById('app');
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('open');
    setTimeout(() => {
      panel.classList.add('hidden');
      app.classList.remove('detail-open');
      state.selectedContactId = null;
      state.selectedMessageId = null;
      state.selectedMeetingId = null;
      state.selectedFileId = null;
    }, 340);
  }

  function accountIconFor(id) {
    const acct = D.getAcct(id);
    if (!acct) return 'ph-user';
    if (acct.provider === 'gmail') return 'ph-envelope-simple';
    if (acct.provider === 'outlook') return 'ph-envelope-simple';
    if (acct.provider === 'slack') return 'ph-slack-logo';
    if (acct.provider === 'wechat') return 'ph-chat-circle';
    if (acct.type === 'calendar') return 'ph-calendar-blank';
    return 'ph-user';
  }

  function renderContactPanel(c) {
    const wrapper = el('div', 'panel-wrapper contact-panel');

    const header = el('div', 'panel-header contact-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const hero = el('div', 'contact-header-hero');
    const avatar = renderAvatar(c, 'panel-avatar contact-header-avatar', c.name[0]);
    const info = el('div', 'contact-header-info');
    info.appendChild(el('div', 'panel-name', c.name));
    const subtitle = el('div', 'panel-role');
    const parts = [];
    if (c.em) parts.push(el('span', '', c.em));
    if (c.co) {
      const co = el('button', 'panel-role-company', c.co);
      co.type = 'button';
      co.addEventListener('click', (e) => { e.stopPropagation(); openCompanyView(c.co); });
      parts.push(co);
    }
    if (c.tl) parts.push(el('span', '', c.tl));
    parts.forEach((part, idx) => {
      if (idx > 0) subtitle.appendChild(el('span', 'panel-role-separator', ' · '));
      subtitle.appendChild(part);
    });
    info.appendChild(subtitle);
    const writeBtn = el('button', 'btn btn-primary btn-sm contact-write-btn');
    writeBtn.appendChild(icon('ph-pencil-simple'));
    writeBtn.appendChild(el('span', '', '+ Write'));
    writeBtn.addEventListener('click', () => openCompose({ to: c.name, subject: '' }));
    const editBtn = el('button', 'btn btn-secondary btn-sm contact-edit-btn');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.appendChild(el('span', '', 'Edit'));
    editBtn.addEventListener('click', () => openContactModal(c.id));
    const followUpBtn = el('button', 'btn btn-secondary btn-sm contact-followup-btn');
    followUpBtn.appendChild(icon('ph-check-circle'));
    followUpBtn.appendChild(el('span', '', 'Add follow-up'));
    followUpBtn.addEventListener('click', () => openTaskModal(null, { relatedType: 'contact', relatedId: c.id }));
    hero.appendChild(avatar);
    hero.appendChild(info);
    hero.appendChild(editBtn);
    hero.appendChild(followUpBtn);
    hero.appendChild(writeBtn);

    header.appendChild(closeBtn);
    header.appendChild(hero);
    wrapper.appendChild(header);

    const actionBar = el('div', 'contact-action-bar');

    const notifyBtn = el('button', 'contact-action-btn' + (c.notify ? ' on' : ''));
    notifyBtn.appendChild(icon(c.notify ? 'ph-bell' : 'ph-bell-slash'));
    notifyBtn.appendChild(el('span', '', c.notify ? 'Notifying' : 'Not notifying'));
    notifyBtn.title = 'Toggle notifications';
    notifyBtn.addEventListener('click', () => {
      c.notify = !c.notify;
      renderMain();
      showToast(c.notify ? 'Notifications on for ' + c.name : 'Notifications off for ' + c.name);
    });

    const deliverBtn = el('button', 'contact-action-btn');
    deliverBtn.appendChild(icon('ph-star'));
    deliverBtn.appendChild(el('span', '', 'Delivering to ' + viewTitle(c.defaultBucket || 'imbox')));
    deliverBtn.title = 'Change delivery bucket';
    deliverBtn.addEventListener('click', () => {
      openContextMenuFromElement(deliverBtn, [
        { label: 'Inbox', icon: 'ph-tray', action: () => { setContactBucket(c, 'imbox'); } },
        { label: 'Stream', icon: 'ph-newspaper', action: () => { setContactBucket(c, 'feed'); } },
        { label: 'Records', icon: 'ph-receipt', action: () => { setContactBucket(c, 'paperTrail'); } },
      ]);
    });

    const autofileBtn = el('button', 'contact-action-btn');
    autofileBtn.appendChild(icon('ph-tag'));
    const autoLabelNames = c.autoLabel && c.autoLabel.length
      ? c.autoLabel.map(id => (D.labels || []).find(l => l.id === id)?.name || id).join(', ')
      : '';
    autofileBtn.appendChild(el('span', '', autoLabelNames || 'Autofile'));
    autofileBtn.title = 'Auto-label emails';
    autofileBtn.addEventListener('click', () => {
      openContextMenuFromElement(autofileBtn, D.labels.map(label => ({
        label: (c.autoLabel && c.autoLabel.includes(label.id) ? '✓ ' : '') + label.name,
        action: () => {
          if (!c.autoLabel) c.autoLabel = [];
          const idx = c.autoLabel.indexOf(label.id);
          if (idx >= 0) c.autoLabel.splice(idx, 1);
          else c.autoLabel.push(label.id);
          renderMain();
          showToast('Autofile labels updated');
        }
      })));
    });

    const recyclingBtn = el('button', 'contact-action-btn' + (c.recycling ? ' on' : ''));
    recyclingBtn.appendChild(icon('ph-arrow-clockwise'));
    recyclingBtn.appendChild(el('span', '', c.recycling ? 'Recycling on' : 'Set up recycling'));
    recyclingBtn.title = 'Auto-delete older emails';
    recyclingBtn.addEventListener('click', () => {
      c.recycling = !c.recycling;
      renderMain();
      showToast(c.recycling ? 'Recycling on for ' + c.name : 'Recycling off for ' + c.name);
    });

    const notesBtn = el('button', 'contact-action-btn');
    notesBtn.appendChild(icon('ph-note'));
    notesBtn.appendChild(el('span', '', c.notes ? 'Has note' : 'Add note'));
    notesBtn.title = 'Jump to notes';
    notesBtn.addEventListener('click', () => {
      const notesTextarea = wrapper.querySelector('.contact-notes-textarea');
      if (notesTextarea) notesTextarea.focus();
    });

    actionBar.appendChild(notifyBtn);
    actionBar.appendChild(deliverBtn);
    actionBar.appendChild(autofileBtn);
    actionBar.appendChild(recyclingBtn);
    actionBar.appendChild(notesBtn);
    wrapper.appendChild(actionBar);

    const content = el('div', 'panel-content');
    content.appendChild(renderContactProfileCard(c));
    content.appendChild(renderContactNotes(c));
    content.appendChild(renderContactTabs(c));
    content.appendChild(renderContactTabContent(c));
    wrapper.appendChild(content);

    return wrapper;
  }

  function renderContactTabs(c) {
    const tabs = ['Timeline', 'Files', 'Insights', 'Network', 'Calendar'];
    const activeTab = state.contactTab || 'Timeline';
    const wrap = el('div', 'contact-tabs');
    tabs.forEach(tab => {
      const btn = el('button', 'contact-tab' + (tab === activeTab ? ' active' : ''), tab);
      btn.addEventListener('click', () => {
        state.contactTab = tab;
        renderMain();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderContactTabContent(c) {
    const activeTab = state.contactTab || 'Timeline';
    if (activeTab === 'Files') return renderContactFilesTab(c);
    if (activeTab === 'Insights') return renderContactInsightsTab(c);
    if (activeTab === 'Network') return renderContactNetworkTab(c);
    if (activeTab === 'Calendar') return renderContactCalendarTab(c);
    return renderContactTimelineTab(c);
  }

  function renderContactTimelineTab(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Timeline'));
    section.appendChild(header);

    const filterBar = el('div', 'contact-thread-filters');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'from', label: 'From them' },
      { id: 'to', label: 'To them' },
    ];
    const currentFilter = state.contactThreadFilter || 'all';
    filters.forEach(f => {
      const btn = el('button', 'contact-thread-filter' + (currentFilter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.contactThreadFilter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });
    section.appendChild(filterBar);

    let msgs = D.getMsgs(c.id);
    if (currentFilter === 'from') msgs = msgs.filter(m => m.fm !== '你');
    if (currentFilter === 'to') msgs = msgs.filter(m => m.fm === '你');

    if (msgs.length === 0) {
      section.appendChild(renderEmpty('No messages match this filter.', 'ph-chat-circle'));
      return section;
    }

    const list = el('div', 'contact-timeline-list');
    msgs.forEach(m => {
      const row = el('div', 'contact-timeline-row');
      const direction = el('span', 'contact-timeline-direction', m.fm === '你' ? 'To' : 'From');
      const body = el('div', 'contact-timeline-body');
      body.appendChild(el('div', 'contact-timeline-subj', m.subj));
      body.appendChild(el('div', 'contact-timeline-preview', m.prev));
      const meta = el('div', 'contact-timeline-meta');
      meta.appendChild(el('span', '', m.tag));
      meta.appendChild(el('span', '', m.tm));
      body.appendChild(meta);

      const marker = renderFollowUpMarker(m);

      row.appendChild(direction);
      row.appendChild(body);
      row.appendChild(marker);
      row.addEventListener('click', (e) => {
        if (e.target.closest('.contact-followup-marker')) return;
        openMessage(m);
      });
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderFollowUpMarker(m) {
    const order = ['', 'todo', 'wait', 'done'];
    const labels = { todo: 'Todo', wait: 'Waiting', done: 'Done' };
    const classes = { todo: 'todo', wait: 'wait', done: 'done' };
    const status = order.includes(m.fl) ? m.fl : '';
    const marker = el('button', 'contact-followup-marker' + (status ? ' ' + classes[status] : ''), status ? labels[status] : '+');
    marker.title = status ? 'Follow-up: ' + labels[status] + ' (click to cycle)' : 'Add follow-up (click to cycle)';
    marker.type = 'button';
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = order.indexOf(status);
      const next = order[(idx + 1) % order.length];
      m.fl = next;
      renderMain();
    });
    return marker;
  }

  function renderContactFilesTab(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Files'));
    section.appendChild(header);

    const grid = el('div', 'mini-grid');
    const files = D.getFiles(c.id);
    if (files.length === 0) {
      section.appendChild(renderEmpty('No files yet.', 'ph-files'));
    } else {
      files.forEach(f => {
        const card = el('div', 'mini-file');
        const name = el('div', 'mini-file-name');
        name.appendChild(icon(fileIconName(f.tp)));
        name.appendChild(el('span', '', f.name));
        card.appendChild(name);
        card.appendChild(el('div', 'mini-file-meta', f.sz + ' · ' + f.dt));
        card.addEventListener('click', () => openFile(f));
        grid.appendChild(card);
      });
      section.appendChild(grid);
    }
    return section;
  }

  function renderContactInsightsTab(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Insights'));
    section.appendChild(header);

    const wrap = el('div', 'contact-insights');
    const msgs = D.getMsgs(c.id);

    // Reply time
    const replyStat = computeReplyTimeStats(c, msgs);
    const replyRow = el('div', 'contact-insight-row');
    replyRow.appendChild(icon('ph-clock'));
    const replyBody = el('div', 'contact-insight-body');
    replyBody.appendChild(el('div', 'contact-insight-label', 'Avg reply time'));
    replyBody.appendChild(el('div', 'contact-insight-value', replyStat.text));
    replyRow.appendChild(replyBody);
    wrap.appendChild(replyRow);

    // Top topics
    const topics = computeTopTopics(c, msgs);
    const topicRow = el('div', 'contact-insight-row');
    topicRow.appendChild(icon('ph-hash'));
    const topicBody = el('div', 'contact-insight-body');
    topicBody.appendChild(el('div', 'contact-insight-label', 'Top topics'));
    const topicChips = el('div', 'contact-insight-chips');
    if (topics.length) {
      topics.forEach(t => {
        const chip = el('span', 'contact-insight-chip', t);
        chip.addEventListener('click', () => {
          state.searchQuery = t;
          state.view = 'imbox';
          renderMain();
          closePanel();
        });
        topicChips.appendChild(chip);
      });
    } else {
      topicChips.appendChild(el('span', 'contact-insight-empty', 'No topics yet'));
    }
    topicBody.appendChild(topicChips);
    topicRow.appendChild(topicBody);
    wrap.appendChild(topicRow);

    // 3-month frequency
    const freq = computeMessageFrequency(msgs);
    const freqRow = el('div', 'contact-insight-row');
    freqRow.appendChild(icon('ph-chart-bar'));
    const freqBody = el('div', 'contact-insight-body');
    freqBody.appendChild(el('div', 'contact-insight-label', '3-month frequency'));
    const bars = el('div', 'contact-frequency-bars');
    freq.forEach(f => {
      const col = el('div', 'contact-frequency-col');
      const barWrap = el('div', 'contact-frequency-bar-wrap');
      const bar = el('div', 'contact-frequency-bar');
      bar.style.height = f.pct + '%';
      barWrap.appendChild(bar);
      col.appendChild(barWrap);
      col.appendChild(el('div', 'contact-frequency-label', f.label));
      col.appendChild(el('div', 'contact-frequency-count', f.count));
      bars.appendChild(col);
    });
    freqBody.appendChild(bars);
    freqRow.appendChild(freqBody);
    wrap.appendChild(freqRow);

    // Best contact time
    const best = computeBestContactTime(msgs);
    const bestRow = el('div', 'contact-insight-row');
    bestRow.appendChild(icon('ph-calendar-check'));
    const bestBody = el('div', 'contact-insight-body');
    bestBody.appendChild(el('div', 'contact-insight-label', 'Best contact time'));
    bestBody.appendChild(el('div', 'contact-insight-value', best || 'Not enough data'));
    bestRow.appendChild(bestBody);
    wrap.appendChild(bestRow);

    section.appendChild(wrap);
    return section;
  }

  function computeReplyTimeStats(c, msgs) {
    const appNow = new Date('2026-07-20T00:00:00');
    const thisMonthStart = new Date(appNow.getFullYear(), appNow.getMonth(), 1);
    const lastMonthStart = new Date(appNow.getFullYear(), appNow.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

    function avgReply(list) {
      let total = 0, count = 0;
      for (let i = 0; i < list.length - 1; i++) {
        const cur = list[i], next = list[i + 1];
        const curFromThem = cur.fm !== '你';
        const nextFromMe = next.fm === '你';
        if (curFromThem && nextFromMe) {
          const a = new Date(cur.st).getTime();
          const b = new Date(next.st).getTime();
          if (a && b && b > a) {
            total += (b - a) / (1000 * 60 * 60);
            count++;
          }
        }
      }
      return count ? total / count : 0;
    }

    const sorted = [...msgs].sort((a, b) => new Date(a.st) - new Date(b.st));
    const thisMonth = sorted.filter(m => new Date(m.st) >= thisMonthStart);
    const lastMonth = sorted.filter(m => {
      const d = new Date(m.st);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    const thisAvg = avgReply(thisMonth);
    const lastAvg = avgReply(lastMonth);

    function fmt(h) {
      if (!h) return '—';
      if (h < 1) return Math.round(h * 60) + ' min';
      if (h < 24) return Math.round(h) + 'h';
      return Math.round(h / 24) + 'd';
    }

    let text = 'This month ' + fmt(thisAvg);
    if (lastAvg) text += ' · Last month ' + fmt(lastAvg);
    if (c.pattern) text += ' · ' + c.pattern;
    return { text };
  }

  function computeTopTopics(c, msgs) {
    const counts = {};
    (c.topics || []).forEach(t => { counts[t] = (counts[t] || 0) + 2; });
    msgs.forEach(m => {
      const topic = m.ctx && m.ctx.topic;
      if (topic) counts[topic] = (counts[topic] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
  }

  function computeMessageFrequency(msgs) {
    const now = new Date('2026-07-20T00:00:00');
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ d, label: (d.getMonth() + 1) + '月', count: 0 });
    }
    msgs.forEach(m => {
      const d = new Date(m.st);
      months.forEach(mo => {
        if (d.getFullYear() === mo.d.getFullYear() && d.getMonth() === mo.d.getMonth()) mo.count++;
      });
    });
    const max = Math.max(1, ...months.map(m => m.count));
    return months.map(mo => ({ ...mo, pct: Math.round((mo.count / max) * 100) }));
  }

  function computeBestContactTime(msgs) {
    if (!msgs.length) return null;
    const dayCounts = {};
    const hourCounts = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    msgs.forEach(m => {
      const d = new Date(m.st);
      if (!d.getTime()) return;
      const day = days[d.getDay()];
      dayCounts[day] = (dayCounts[day] || 0) + 1;
      const hour = d.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    if (!bestDay || !bestHour) return null;
    const hour = parseInt(bestHour[0], 10);
    const hourLabel = hour + ':00';
    return bestDay[0] + 's around ' + hourLabel;
  }

  function renderContactNetworkTab(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Network'));
    section.appendChild(header);

    const wrap = el('div', 'contact-network');

    // Common contacts (from message ctx.people)
    const commonIds = new Set();
    D.getMsgs(c.id).forEach(m => {
      if (m.ctx && m.ctx.people) {
        m.ctx.people.forEach(id => { if (id !== c.id) commonIds.add(id); });
      }
    });
    const common = Array.from(commonIds).map(id => D.getP(id)).filter(Boolean);
    wrap.appendChild(renderNetworkGroup('Common contacts', common, 'ph-share-network'));

    // Colleagues (same company)
    const colleagues = D.contacts.filter(p => p.id !== c.id && p.company && p.company === c.company);
    wrap.appendChild(renderNetworkGroup('Colleagues', colleagues, 'ph-buildings'));

    // Similar contacts (shared topics)
    const myTopics = new Set(c.topics || []);
    const similar = D.contacts.filter(p => {
      if (p.id === c.id) return false;
      const theirTopics = new Set(p.topics || []);
      for (const t of myTopics) if (theirTopics.has(t)) return true;
      return false;
    });
    wrap.appendChild(renderNetworkGroup('Similar contacts', similar, 'ph-users-three'));

    section.appendChild(wrap);
    return section;
  }

  function renderNetworkGroup(title, people, iconName) {
    const group = el('div', 'contact-network-group');
    const head = el('div', 'contact-network-header');
    head.appendChild(icon(iconName));
    head.appendChild(el('span', '', title));
    head.appendChild(el('span', 'contact-network-count', people.length));
    group.appendChild(head);

    if (people.length === 0) {
      group.appendChild(el('div', 'contact-network-empty', 'No ' + title.toLowerCase()));
      return group;
    }

    const grid = el('div', 'mini-grid');
    people.forEach(p => {
      const card = el('div', 'mini-person');
      const av = renderAvatar(p, 'mini-person-avatar', p.name ? p.name[0] : '?');
      card.appendChild(av);
      const info = el('div', 'mini-person-info');
      info.appendChild(el('div', 'mini-person-name', p.name));
      info.appendChild(el('div', 'mini-person-meta', p.co || p.company || ''));
      card.appendChild(info);
      card.addEventListener('click', () => openContact(p.id));
      grid.appendChild(card);
    });
    group.appendChild(grid);
    return group;
  }

  function renderContactCalendarTab(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Calendar'));
    section.appendChild(header);

    const meetings = D.getMeetings(c.id).slice().sort((a, b) => {
      const da = parseMeetingDate(a.dt);
      const db = parseMeetingDate(b.dt);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });

    if (meetings.length === 0) {
      section.appendChild(renderEmpty('No meetings with ' + c.name + '.', 'ph-calendar-blank'));
      return section;
    }

    const list = el('div', 'contact-calendar-list');
    meetings.forEach(m => {
      const row = el('div', 'contact-calendar-row');
      const iconBox = el('div', 'contact-calendar-icon');
      iconBox.appendChild(icon('ph-calendar-blank'));
      const body = el('div', 'contact-calendar-body');
      body.appendChild(el('div', 'contact-calendar-title', m.title));
      body.appendChild(el('div', 'contact-calendar-meta', m.dt + ' · ' + m.tm + ' · ' + m.ppl));
      row.appendChild(iconBox);
      row.appendChild(body);
      row.addEventListener('click', () => openMeeting(m));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function getCompanyMessages(company) {
    const contacts = getCompanyContacts(company);
    const ids = new Set(contacts.map(c => c.id));
    return D._msgs.filter(m => ids.has(m.pid)).sort((a, b) => new Date(b.st) - new Date(a.st));
  }

  function getCompanyFiles(company) {
    const contacts = getCompanyContacts(company);
    const ids = new Set(contacts.map(c => c.id));
    return D._files.filter(f => ids.has(f.pid));
  }

  function getCompanyMeetings(company) {
    const contacts = getCompanyContacts(company);
    const ids = new Set(contacts.map(c => c.id));
    return D._meetings.filter(m => m.pids && m.pids.some(id => ids.has(id)));
  }

  function renderCompanyView(companyName) {
    const container = el('div', 'view company-view');
    const contacts = getCompanyContacts(companyName);
    const health = computeCompanyHealth(contacts);
    const domain = getCompanyDomain(companyName);
    const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || companyName[0].toUpperCase();

    const header = el('div', 'company-header');
    const avatar = el('div', 'company-header-avatar', initials);
    avatar.style.background = avatarGradientFor(companyName);
    const info = el('div', 'company-header-info');
    const nameRow = el('div', 'company-header-name-row');
    nameRow.appendChild(el('h1', 'company-header-name', companyName));
    if (domain) {
      const domainLink = el('a', 'company-header-domain', domain);
      domainLink.href = 'https://' + domain;
      domainLink.target = '_blank';
      domainLink.rel = 'noopener noreferrer';
      nameRow.appendChild(domainLink);
    }
    info.appendChild(nameRow);
    const meta = el('div', 'company-header-meta');
    const activeCount = contacts.filter(c => c.grp === 'active').length;
    meta.appendChild(el('span', '', contacts.length + ' people · ' + activeCount + ' active'));
    info.appendChild(meta);

    const healthWrap = el('div', 'company-header-health');
    healthWrap.style.color = health.score >= 70 ? 'var(--green)' : health.score >= 40 ? 'var(--yellow)' : 'var(--red)';
    healthWrap.appendChild(el('div', 'company-header-score', health.score + '%'));
    healthWrap.appendChild(el('div', 'company-header-health-label', health.label));
    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(healthWrap);
    container.appendChild(header);

    container.appendChild(renderCompanyTabs(companyName));
    container.appendChild(renderCompanyTabContent(companyName));
    return container;
  }

  function renderCompanyTabs(companyName) {
    const tabs = ['People', 'Communications', 'Files', 'Meetings', 'Insights'];
    const activeTab = state.companyTab || 'People';
    const wrap = el('div', 'company-tabs');
    tabs.forEach(tab => {
      const btn = el('button', 'company-tab' + (tab === activeTab ? ' active' : ''), tab);
      btn.addEventListener('click', () => { state.companyTab = tab; renderMain(); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderCompanyTabContent(companyName) {
    const activeTab = state.companyTab || 'People';
    if (activeTab === 'Communications') return renderCompanyCommunicationsTab(companyName);
    if (activeTab === 'Files') return renderCompanyFilesTab(companyName);
    if (activeTab === 'Meetings') return renderCompanyMeetingsTab(companyName);
    if (activeTab === 'Insights') return renderCompanyInsightsTab(companyName);
    return renderCompanyPeopleTab(companyName);
  }

  function renderCompanyPeopleTab(companyName) {
    const section = el('div', 'contact-section');
    const contacts = getCompanyContacts(companyName);
    if (contacts.length === 0) {
      section.appendChild(renderEmpty('No contacts at this company.', 'ph-users'));
      return section;
    }
    const list = el('div', 'company-people-list');
    contacts.sort((a, b) => (b.health || 0) - (a.health || 0)).forEach(c => {
      const row = el('div', 'company-person-row');
      const avatar = renderAvatar(c, 'company-person-avatar', c.name ? c.name[0] : '?', () => openContact(c.id));
      const body = el('div', 'company-person-body');
      body.appendChild(el('div', 'company-person-name', c.name));
      body.appendChild(el('div', 'company-person-role', c.title || c.tl || ''));
      const health = el('span', 'company-person-health');
      health.style.color = c.scC || 'var(--text-muted)';
      health.appendChild(icon(trendIcon(c.trd)));
      health.appendChild(el('span', '', c.sc || '—'));
      body.appendChild(health);
      row.appendChild(avatar);
      row.appendChild(body);
      row.addEventListener('click', () => openContact(c.id));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderCompanyCommunicationsTab(companyName) {
    const section = el('div', 'contact-section');
    const msgs = getCompanyMessages(companyName);
    if (msgs.length === 0) {
      section.appendChild(renderEmpty('No communications yet.', 'ph-chat-circle'));
      return section;
    }
    const list = el('div', 'contact-timeline-list');
    msgs.forEach(m => {
      const contact = D.getP(m.pid);
      const row = el('div', 'contact-timeline-row');
      const direction = el('span', 'contact-timeline-direction', m.fm === '你' ? 'To' : 'From');
      const body = el('div', 'contact-timeline-body');
      const subj = el('div', 'contact-timeline-subj', m.subj);
      if (contact) {
        subj.appendChild(el('span', 'company-timeline-contact', contact.name));
      }
      body.appendChild(subj);
      body.appendChild(el('div', 'contact-timeline-preview', m.prev));
      const meta = el('div', 'contact-timeline-meta');
      meta.appendChild(el('span', '', m.tag));
      meta.appendChild(el('span', '', m.tm));
      body.appendChild(meta);
      row.appendChild(direction);
      row.appendChild(body);
      row.appendChild(renderFollowUpMarker(m));
      row.addEventListener('click', (e) => {
        if (e.target.closest('.contact-followup-marker')) return;
        openMessage(m);
      });
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderCompanyFilesTab(companyName) {
    const section = el('div', 'contact-section');
    const files = getCompanyFiles(companyName);
    if (files.length === 0) {
      section.appendChild(renderEmpty('No files yet.', 'ph-files'));
      return section;
    }
    const grid = el('div', 'mini-grid');
    files.forEach(f => {
      const card = el('div', 'mini-file');
      const name = el('div', 'mini-file-name');
      name.appendChild(icon(fileIconName(f.tp)));
      name.appendChild(el('span', '', f.name));
      card.appendChild(name);
      const contact = D.getP(f.pid);
      card.appendChild(el('div', 'mini-file-meta', f.sz + ' · ' + f.dt + (contact ? ' · ' + contact.name : '')));
      card.addEventListener('click', () => openFile(f));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function renderCompanyMeetingsTab(companyName) {
    const section = el('div', 'contact-section');
    const meetings = getCompanyMeetings(companyName).slice().sort((a, b) => {
      const da = parseMeetingDate(a.dt);
      const db = parseMeetingDate(b.dt);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });
    if (meetings.length === 0) {
      section.appendChild(renderEmpty('No meetings with this company.', 'ph-calendar-blank'));
      return section;
    }
    const list = el('div', 'contact-calendar-list');
    meetings.forEach(m => {
      const row = el('div', 'contact-calendar-row');
      const iconBox = el('div', 'contact-calendar-icon');
      iconBox.appendChild(icon('ph-calendar-blank'));
      const body = el('div', 'contact-calendar-body');
      body.appendChild(el('div', 'contact-calendar-title', m.title));
      body.appendChild(el('div', 'contact-calendar-meta', m.dt + ' · ' + m.tm + ' · ' + m.ppl));
      row.appendChild(iconBox);
      row.appendChild(body);
      row.addEventListener('click', () => openMeeting(m));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderCompanyInsightsTab(companyName) {
    const section = el('div', 'contact-section');
    const wrap = el('div', 'contact-insights');
    const contacts = getCompanyContacts(companyName);
    const msgs = getCompanyMessages(companyName);

    // Reply time
    const replyStat = computeReplyTimeStats({}, msgs);
    const replyRow = el('div', 'contact-insight-row');
    replyRow.appendChild(icon('ph-clock'));
    const replyBody = el('div', 'contact-insight-body');
    replyBody.appendChild(el('div', 'contact-insight-label', 'Avg reply time'));
    replyBody.appendChild(el('div', 'contact-insight-value', replyStat.text));
    replyRow.appendChild(replyBody);
    wrap.appendChild(replyRow);

    // Top topics
    const topicCounts = {};
    contacts.forEach(c => (c.topics || []).forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 2; }));
    msgs.forEach(m => { const t = m.ctx && m.ctx.topic; if (t) topicCounts[t] = (topicCounts[t] || 0) + 1; });
    const topics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
    const topicRow = el('div', 'contact-insight-row');
    topicRow.appendChild(icon('ph-hash'));
    const topicBody = el('div', 'contact-insight-body');
    topicBody.appendChild(el('div', 'contact-insight-label', 'Top topics'));
    const topicChips = el('div', 'contact-insight-chips');
    if (topics.length) {
      topics.forEach(t => {
        const chip = el('span', 'contact-insight-chip', t);
        chip.addEventListener('click', () => {
          state.searchQuery = t;
          state.view = 'imbox';
          renderMain();
        });
        topicChips.appendChild(chip);
      });
    } else {
      topicChips.appendChild(el('span', 'contact-insight-empty', 'No topics yet'));
    }
    topicBody.appendChild(topicChips);
    topicRow.appendChild(topicBody);
    wrap.appendChild(topicRow);

    // Frequency
    const freq = computeMessageFrequency(msgs);
    const freqRow = el('div', 'contact-insight-row');
    freqRow.appendChild(icon('ph-chart-bar'));
    const freqBody = el('div', 'contact-insight-body');
    freqBody.appendChild(el('div', 'contact-insight-label', '3-month frequency'));
    const bars = el('div', 'contact-frequency-bars');
    freq.forEach(f => {
      const col = el('div', 'contact-frequency-col');
      const barWrap = el('div', 'contact-frequency-bar-wrap');
      const bar = el('div', 'contact-frequency-bar');
      bar.style.height = f.pct + '%';
      barWrap.appendChild(bar);
      col.appendChild(barWrap);
      col.appendChild(el('div', 'contact-frequency-label', f.label));
      col.appendChild(el('div', 'contact-frequency-count', f.count));
      bars.appendChild(col);
    });
    freqBody.appendChild(bars);
    freqRow.appendChild(freqBody);
    wrap.appendChild(freqRow);

    // Best contact time
    const best = computeBestContactTime(msgs);
    const bestRow = el('div', 'contact-insight-row');
    bestRow.appendChild(icon('ph-calendar-check'));
    const bestBody = el('div', 'contact-insight-body');
    bestBody.appendChild(el('div', 'contact-insight-label', 'Best contact time'));
    bestBody.appendChild(el('div', 'contact-insight-value', best || 'Not enough data'));
    bestRow.appendChild(bestBody);
    wrap.appendChild(bestRow);

    section.appendChild(wrap);
    return section;
  }

  function renderContactRecycling(c) {
    const section = el('div', 'contact-section contact-recycling-section');
    const row = el('div', 'contact-recycling-row');
    const left = el('div', 'contact-recycling-left');
    left.appendChild(icon('ph-arrow-clockwise'));
    const text = el('div', '');
    text.appendChild(el('div', 'contact-recycling-title', 'Recycling'));
    text.appendChild(el('div', 'contact-recycling-desc', 'Auto-delete older emails to reduce digital waste'));
    left.appendChild(text);
    row.appendChild(left);

    const toggle = el('button', 'contact-toggle' + (c.recycling ? ' on' : ''));
    toggle.addEventListener('click', () => {
      c.recycling = !c.recycling;
      renderMain();
      showToast(c.recycling ? 'Recycling on for ' + c.name : 'Recycling off for ' + c.name);
    });
    row.appendChild(toggle);
    section.appendChild(row);
    return section;
  }

  function setContactBucket(c, bucket) {
    c.defaultBucket = bucket;
    c.firstSeen = false;
    c.screened = true;
    D._msgs.filter(m => m.pid === c.id).forEach(m => { m.bucket = bucket; m.screened = true; });
    renderMain();
    showToast(c.name + ' now delivers to ' + viewTitle(bucket));
  }

  function renderContactSection(title) {
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', title));
    return header;
  }

  function renderContactRouting(c) {
    const section = el('div', 'contact-section');
    section.appendChild(renderContactSection('Routing'));

    const card = el('div', 'contact-routing-card');

    const bucketRow = el('div', 'contact-routing-row');
    bucketRow.appendChild(icon('ph-tray'));
    bucketRow.appendChild(el('span', '', 'Default bucket'));
    const bucketSelect = el('select', 'contact-routing-select');
    const buckets = [
      { value: 'imbox', label: 'Inbox' },
      { value: 'feed', label: 'Stream' },
      { value: 'paperTrail', label: 'Records' },
    ];
    buckets.forEach(b => {
      const opt = el('option', '', b.label);
      opt.value = b.value;
      if (c.defaultBucket === b.value) opt.selected = true;
      bucketSelect.appendChild(opt);
    });
    bucketSelect.addEventListener('change', () => {
      c.defaultBucket = bucketSelect.value;
      D._msgs.filter(m => m.pid === c.id).forEach(m => { m.bucket = bucketSelect.value; });
      renderMain();
      showToast('Default bucket updated');
    });
    bucketRow.appendChild(bucketSelect);
    card.appendChild(bucketRow);

    const notifyRow = el('div', 'contact-routing-row');
    notifyRow.appendChild(icon('ph-bell'));
    notifyRow.appendChild(el('span', '', 'Notify me'));
    const notifyToggle = el('button', 'contact-toggle' + (c.notify ? ' on' : ''));
    notifyToggle.addEventListener('click', () => {
      c.notify = !c.notify;
      renderMain();
      showToast(c.notify ? 'Notifications on' : 'Notifications off');
    });
    notifyRow.appendChild(notifyToggle);
    card.appendChild(notifyRow);

    const blockRow = el('div', 'contact-routing-row');
    blockRow.appendChild(icon('ph-prohibit'));
    blockRow.appendChild(el('span', '', c.blocked ? 'Blocked' : 'Block this sender'));
    const blockBtn = el('button', 'btn btn-ghost btn-xs', c.blocked ? 'Unblock' : 'Block');
    blockBtn.addEventListener('click', () => {
      c.blocked = !c.blocked;
      renderMain();
      showToast(c.blocked ? 'Sender blocked' : 'Sender unblocked');
    });
    blockRow.appendChild(blockBtn);
    card.appendChild(blockRow);

    section.appendChild(card);
    return section;
  }

  function renderContactThreads(c) {
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'All threads with ' + c.name));
    section.appendChild(header);

    const filterBar = el('div', 'contact-thread-filters');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'from', label: 'From them' },
      { id: 'to', label: 'To them' },
    ];
    const currentFilter = state.contactThreadFilter || 'all';
    filters.forEach(f => {
      const btn = el('button', 'contact-thread-filter' + (currentFilter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.contactThreadFilter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });
    section.appendChild(filterBar);

    let msgs = D.getMsgs(c.id);
    if (currentFilter === 'from') msgs = msgs.filter(m => m.fm !== '你');
    if (currentFilter === 'to') msgs = msgs.filter(m => m.fm === '你');

    if (msgs.length === 0) {
      section.appendChild(el('div', 'contact-notes-empty', 'No threads match this filter.'));
      return section;
    }

    const list = el('div', 'contact-thread-list');
    msgs.slice(0, 8).forEach(m => {
      const row = el('div', 'contact-thread-row');
      const direction = el('span', 'contact-thread-direction', m.fm === '你' ? 'To' : 'From');
      const body = el('div', 'contact-thread-body');
      body.appendChild(el('div', 'contact-thread-subj', m.subj));
      body.appendChild(el('div', 'contact-thread-preview', m.prev));
      row.appendChild(direction);
      row.appendChild(body);
      row.appendChild(el('div', 'contact-thread-meta', m.tm));
      row.addEventListener('click', () => openMessage(m));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function addContactNote(c) {
    const note = prompt('Add a note about ' + c.name + ':', c.notes || '');
    if (note !== null) {
      c.notes = note;
      showToast('Note saved');
      renderMain();
      openContact(c.id);
    }
  }

  function renderContactProfileCard(c) {
    const card = el('div', 'contact-profile-card');

    const row = el('div', 'contact-profile-row');
    row.appendChild(icon('ph-envelope-simple'));
    const email = el('a', 'contact-profile-link', c.em);
    email.href = 'mailto:' + c.em;
    email.title = 'Send email';
    row.appendChild(email);
    card.appendChild(row);

    const phoneRow = el('div', 'contact-profile-row');
    phoneRow.appendChild(icon('ph-phone'));
    const phone = el('a', 'contact-profile-link', c.ph);
    phone.href = 'tel:' + c.ph.replace(/\s/g, '');
    phone.title = 'Call';
    phoneRow.appendChild(phone);
    card.appendChild(phoneRow);

    if (c.accounts && c.accounts.length) {
      const accountsRow = el('div', 'contact-profile-row');
      accountsRow.appendChild(icon('ph-plugs-connected'));
      const accountChips = el('div', 'contact-account-chips');
      c.accounts.forEach(id => {
        const acct = D.getAcct(id);
        const chip = el('span', 'contact-account-chip');
        chip.appendChild(icon(accountIconFor(id)));
        chip.appendChild(el('span', '', acct ? (acct.label || acct.provider) : id));
        accountChips.appendChild(chip);
      });
      accountsRow.appendChild(accountChips);
      card.appendChild(accountsRow);
    }

    return card;
  }

  function renderContactStats(c) {
    const stats = el('div', 'contact-stats');

    const health = el('div', 'contact-stat');
    health.appendChild(el('div', 'contact-stat-label', 'Health'));
    const score = el('div', 'contact-stat-value', c.sc);
    score.style.color = c.scC;
    health.appendChild(score);
    stats.appendChild(health);

    const stage = el('div', 'contact-stat');
    stage.appendChild(el('div', 'contact-stat-label', 'Stage'));
    const stageBadge = el('span', 'contact-stage-badge', D.stageLabel[c.stage] || c.stage);
    stageBadge.style.background = D.stageColor[c.stage] ? hexToRgba(D.stageColor[c.stage], 0.12) : 'var(--surface-2)';
    stageBadge.style.color = D.stageColor[c.stage] || 'var(--text-secondary)';
    stage.appendChild(stageBadge);
    stats.appendChild(stage);

    const last = el('div', 'contact-stat');
    last.appendChild(el('div', 'contact-stat-label', 'Last contact'));
    last.appendChild(el('div', 'contact-stat-value', c.lc));
    stats.appendChild(last);

    const first = el('div', 'contact-stat');
    first.appendChild(el('div', 'contact-stat-label', 'Known since'));
    first.appendChild(el('div', 'contact-stat-value', c.firstContact));
    stats.appendChild(first);

    return stats;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function renderContactTopics(c) {
    const wrap = el('div', 'contact-topics');
    c.topics.forEach(t => {
      const chip = el('span', 'contact-topic-chip', t);
      chip.addEventListener('click', () => {
        state.searchQuery = t;
        state.view = 'imbox';
        renderMain();
        closePanel();
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function getUpcomingMeeting(c) {
    return D.getMeetings(c.id).find(m => !String(m.dt).includes('已结束'));
  }

  function renderContactUpcoming(c) {
    const wrap = el('div', 'contact-upcoming');
    const meeting = getUpcomingMeeting(c);
    const suggest = D.stageSuggest[c.stage] || '';

    if (meeting) {
      const mtgCard = el('div', 'contact-upcoming-card');
      const mtgHeader = el('div', 'contact-upcoming-header');
      mtgHeader.appendChild(icon('ph-calendar-blank'));
      mtgHeader.appendChild(el('span', '', 'Next meeting'));
      mtgCard.appendChild(mtgHeader);
      mtgCard.appendChild(el('div', 'contact-upcoming-title', meeting.title));
      mtgCard.appendChild(el('div', 'contact-upcoming-meta', meeting.dt + ' · ' + meeting.tm));
      mtgCard.addEventListener('click', () => openMeeting(meeting));
      wrap.appendChild(mtgCard);
    }

    if (suggest) {
      const taskCard = el('div', 'contact-upcoming-card suggest');
      const taskHeader = el('div', 'contact-upcoming-header');
      taskHeader.appendChild(icon('ph-lightbulb'));
      taskHeader.appendChild(el('span', '', 'Suggested action'));
      taskCard.appendChild(taskHeader);
      taskCard.appendChild(el('div', 'contact-upcoming-title', suggest));
      taskCard.addEventListener('click', () => openCompose({ to: c.name, subject: '' }));
      wrap.appendChild(taskCard);
    }

    if (!meeting && !suggest) return el('div');
    return wrap;
  }

  function renderContactInsights(c) {
    const section = el('div', 'contact-section');
    section.appendChild(el('div', 'contact-section-title', 'AI Insights'));

    const wrap = el('div', 'contact-insights');

    if (c.pattern) {
      const row = el('div', 'contact-insight-row');
      row.appendChild(icon('ph-clock'));
      const body = el('div', 'contact-insight-body');
      body.appendChild(el('div', 'contact-insight-label', 'Communication pattern'));
      body.appendChild(el('div', 'contact-insight-value', c.pattern));
      row.appendChild(body);
      wrap.appendChild(row);
    }

    if (c.stageHistory && c.stageHistory.length) {
      const row = el('div', 'contact-insight-row');
      row.appendChild(icon('ph-chart-line-up'));
      const body = el('div', 'contact-insight-body');
      body.appendChild(el('div', 'contact-insight-label', 'Relationship timeline'));
      const timeline = el('div', 'contact-insight-timeline');
      c.stageHistory.forEach((s, i) => {
        const item = el('div', 'contact-timeline-item');
        const dot = el('span', 'contact-timeline-dot');
        dot.style.background = D.stageColor[s.stage] || 'var(--text-muted)';
        item.appendChild(dot);
        item.appendChild(el('span', 'contact-timeline-stage', D.stageLabel[s.stage] || s.stage));
        item.appendChild(el('span', 'contact-timeline-date', s.date));
        timeline.appendChild(item);
        if (i < c.stageHistory.length - 1) {
          timeline.appendChild(el('div', 'contact-timeline-connector'));
        }
      });
      body.appendChild(timeline);
      row.appendChild(body);
      wrap.appendChild(row);
    }

    if (c.milestones && c.milestones.length) {
      const row = el('div', 'contact-insight-row');
      row.appendChild(icon('ph-flag'));
      const body = el('div', 'contact-insight-body');
      body.appendChild(el('div', 'contact-insight-label', 'Milestones'));
      const list = el('ul', 'contact-milestones');
      c.milestones.forEach(m => {
        const li = el('li', '', m);
        list.appendChild(li);
      });
      body.appendChild(list);
      row.appendChild(body);
      wrap.appendChild(row);
    }

    if (!wrap.children.length) return el('div');
    section.appendChild(wrap);
    return section;
  }

  function renderContactNotes(c) {
    const section = el('div', 'contact-section contact-notes-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Notes'));
    section.appendChild(header);

    const textarea = el('textarea', 'contact-notes-textarea');
    textarea.placeholder = 'Add a note about ' + c.name + '...';
    textarea.value = c.notes || '';
    textarea.addEventListener('input', () => {
      c.notes = textarea.value;
      const actionBtn = document.querySelector('.contact-action-btn[title="Jump to notes"] span');
      if (actionBtn) actionBtn.textContent = c.notes ? 'Has note' : 'Add note';
    });
    section.appendChild(textarea);
    return section;
  }

  function buildContactActivity(c) {
    const events = [];
    D.getMsgs(c.id).forEach(m => {
      events.push({ type: 'message', sort: new Date(m.st).getTime() || 0, data: m });
    });
    D.getMeetings(c.id).forEach(m => {
      const d = parseMeetingDate(m.dt);
      events.push({ type: 'meeting', sort: d ? d.getTime() : 0, data: m });
    });
    return events.sort((a, b) => b.sort - a.sort);
  }

  function renderContactActivity(c) {
    const section = el('div', 'contact-section');
    section.appendChild(el('div', 'contact-section-title', 'Recent Activity'));

    const list = el('div', 'contact-activity');
    const events = buildContactActivity(c).slice(0, 12);

    if (events.length === 0) {
      list.appendChild(renderEmpty('No activity yet.', 'ph-chat-circle'));
    } else {
      events.forEach(ev => {
        if (ev.type === 'message') {
          const m = ev.data;
          const row = el('div', 'contact-activity-row');
          const iconBox = el('div', 'contact-activity-icon');
          iconBox.appendChild(icon(channelIconName(m.ch)));
          const body = el('div', 'contact-activity-body');
          body.appendChild(el('div', 'contact-activity-subj', m.subj));
          body.appendChild(el('div', 'contact-activity-preview', m.prev));
          const meta = el('div', 'contact-activity-meta');
          meta.appendChild(el('span', '', m.tag));
          meta.appendChild(el('span', '', m.tm));
          body.appendChild(meta);
          row.appendChild(iconBox);
          row.appendChild(body);
          row.addEventListener('click', () => openMessage(m));
          list.appendChild(row);
        } else if (ev.type === 'meeting') {
          const m = ev.data;
          const row = el('div', 'contact-activity-row');
          const iconBox = el('div', 'contact-activity-icon meeting');
          iconBox.appendChild(icon('ph-calendar-blank'));
          const body = el('div', 'contact-activity-body');
          body.appendChild(el('div', 'contact-activity-subj', m.title));
          body.appendChild(el('div', 'contact-activity-preview', m.ppl + (m.notes ? ' · ' + m.notes : '')));
          const meta = el('div', 'contact-activity-meta');
          meta.appendChild(el('span', '', 'Meeting'));
          meta.appendChild(el('span', '', m.dt + ' ' + m.tm));
          body.appendChild(meta);
          row.appendChild(iconBox);
          row.appendChild(body);
          row.addEventListener('click', () => openMeeting(m));
          list.appendChild(row);
        }
      });
    }

    section.appendChild(list);
    return section;
  }

  function renderContactFiles(c) {
    const section = el('div', 'contact-section');
    section.appendChild(el('div', 'contact-section-title', 'Files'));

    const grid = el('div', 'mini-grid');
    const files = D.getFiles(c.id);
    if (files.length === 0) {
      section.appendChild(renderEmpty('No files yet.', 'ph-files'));
    } else {
      files.slice(0, 6).forEach(f => {
        const card = el('div', 'mini-file');
        const name = el('div', 'mini-file-name');
        name.appendChild(icon(fileIconName(f.tp)));
        name.appendChild(el('span', '', f.name));
        card.appendChild(name);
        card.appendChild(el('div', 'mini-file-meta', f.sz + ' · ' + f.dt));
        card.addEventListener('click', () => openFile(f));
        grid.appendChild(card);
      });
      section.appendChild(grid);
    }
    return section;
  }

  function renderContactNetwork(c) {
    const section = el('div', 'contact-section');
    section.appendChild(el('div', 'contact-section-title', 'Network'));

    const grid = el('div', 'mini-grid');
    const connections = D.getConnections(c.id);
    if (connections.length === 0) {
      section.appendChild(renderEmpty('No connections found.', 'ph-share-network'));
    } else {
      connections.forEach(p => {
        const card = el('div', 'mini-person');
        const av = renderAvatar(p, 'mini-person-avatar', p.name[0]);
        card.appendChild(av);
        card.appendChild(el('div', 'mini-person-name', p.name));
        card.appendChild(el('div', 'mini-person-meta', p.co));
        card.addEventListener('click', () => openContact(p.id));
        grid.appendChild(card);
      });
    }
    return section;
  }

  function parseMeetingDate(dt) {
    const match = String(dt).match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    return new Date(2026, month, day);
  }

  function sameDate(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fromKey(key) {
    const parts = key.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function formatDateLabel(d) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return weekdays[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
  }

  function formatDayShort(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }

  function formatTimeCompact(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return h + 'h';
    return h + 'h' + m;
  }

  function buildCalendarDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(year, month, 1 - firstDay.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return days;
  }

  function getMeetingsForDate(date, meetings) {
    return meetings.filter(m => sameDate(parseMeetingDate(m.dt), date));
  }

  function getMultiDayEventsForDate(date, events) {
    return events.filter(e => {
      const start = fromKey(e.start);
      const end = fromKey(e.end);
      return date >= start && date <= end;
    });
  }

  function getMultiDayEventsInRange(start, end, events) {
    return events.filter(e => {
      const s = fromKey(e.start);
      const en = fromKey(e.end);
      return !(en < start || s > end);
    });
  }

  function parseMeetingTime(m) {
    const match = String(m.tm).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const start = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    const end = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
    return { start, end };
  }

  function formatMinutes(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }

  function changeSelectedDate(days) {
    const d = new Date(state.calendarSelected.getFullYear(), state.calendarSelected.getMonth(), state.calendarSelected.getDate() + days);
    state.calendarSelected = d;
    renderMain();
  }

  function startOfWeek(d) {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = out.getDay();
    const offset = (day + 6) % 7;
    out.setDate(out.getDate() - offset);
    return out;
  }

  function endOfWeek(d) {
    const s = startOfWeek(d);
    const out = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    return out;
  }

  function changeWeek(offset) {
    const s = state.calendarWeekStart || startOfWeek(state.calendarSelected);
    const next = new Date(s.getFullYear(), s.getMonth(), s.getDate() + offset * 7);
    state.calendarWeekStart = next;
    state.calendarSelected = next;
    renderMain();
  }

  function changeYear(offset) {
    const y = state.calendarYearAnchor.getFullYear();
    state.calendarYearAnchor = new Date(y + offset, 0, 1);
    renderMain();
  }

  function layoutDayEvents(meetings, startHour, endHour) {
    const startLimit = startHour * 60;
    const endLimit = (endHour + 1) * 60;
    let items = meetings.map(m => {
      const t = parseMeetingTime(m);
      if (!t) return null;
      const start = Math.max(t.start, startLimit);
      const end = Math.min(t.end, endLimit);
      if (end <= startLimit || start >= endLimit) return null;
      return { m, start, end, duration: end - start, col: 0, maxCols: 1 };
    }).filter(Boolean);
    items.sort((a, b) => a.start - b.start || a.end - b.end);
    let active = [];
    items.forEach(item => {
      active = active.filter(a => a.end > item.start);
      const used = new Set(active.map(a => a.col));
      let col = 0;
      while (used.has(col)) col++;
      item.col = col;
      active.push(item);
      const maxCols = Math.max(...active.map(a => a.col)) + 1;
      active.forEach(a => { if (a.maxCols < maxCols) a.maxCols = maxCols; });
    });
    return items;
  }

  function computeFreetimeSlots(meetings, startHour, endHour) {
    const slots = [];
    const min = startHour * 60;
    const max = endHour * 60;
    const occupied = meetings
      .map(m => parseMeetingTime(m))
      .filter(Boolean)
      .map(t => ({ start: Math.max(t.start, min), end: Math.min(t.end, max) }))
      .filter(t => t.end > min && t.start < max)
      .sort((a, b) => a.start - b.start);

    let cursor = min;
    occupied.forEach(b => {
      if (b.start > cursor) slots.push({ start: cursor, end: b.start, duration: b.start - cursor });
      cursor = Math.max(cursor, b.end);
    });
    if (cursor < max) slots.push({ start: cursor, end: max, duration: max - cursor });
    return slots;
  }

  function eventColor(m) {
    if (m.color) return m.color;
    if (m.br) return 'mint';
    return 'sky';
  }

  function eventTitleColor(title) {
    const map = ['sky', 'mint', 'peach', 'lavender', 'canary'];
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    return map[sum % map.length];
  }

  function multiDayColorMap() {
    const map = {};
    (D.calendarExtras.multiDayEvents || []).forEach(e => {
      map[e.id] = e.color || 'sky';
    });
    return map;
  }

  function renderCalendar() {
    const container = el('div', 'view calendar-view');
    container.appendChild(renderCalendarHeader());
    const body = el('div', 'cal-body');
    if (state.calendarView === 'day') {
      body.appendChild(renderDayView());
    } else if (state.calendarView === 'week') {
      body.appendChild(renderWeekView());
    } else {
      body.appendChild(renderYearView());
    }
    container.appendChild(body);
    return container;
  }

  function renderCalendarHeader() {
    const header = el('div', 'cal-header');

    const left = el('div', 'cal-header-left view-header-left');
    const title = el('h1', 'cal-title');
    title.textContent = 'Calendar';
    const subline = el('div', 'cal-subline');
    subline.textContent = calendarHeaderSubtitle();
    left.appendChild(title);
    left.appendChild(subline);

    const tabs = el('div', 'cal-tabs');
    ['day', 'week', 'year'].forEach(v => {
      const tab = el('button', 'cal-tab' + (state.calendarView === v ? ' active' : ''));
      tab.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      tab.addEventListener('click', () => {
        state.calendarView = v;
        renderMain();
      });
      tabs.appendChild(tab);
    });

    const right = el('div', 'cal-header-right');

    const nav = el('div', 'cal-nav');
    const prevBtn = el('button', 'icon-btn');
    prevBtn.title = 'Previous';
    prevBtn.appendChild(icon('ph-caret-left'));
    prevBtn.addEventListener('click', () => {
      if (state.calendarView === 'day') changeSelectedDate(-1);
      else if (state.calendarView === 'week') changeWeek(-1);
      else changeYear(-1);
    });

    const nextBtn = el('button', 'icon-btn');
    nextBtn.title = 'Next';
    nextBtn.appendChild(icon('ph-caret-right'));
    nextBtn.addEventListener('click', () => {
      if (state.calendarView === 'day') changeSelectedDate(1);
      else if (state.calendarView === 'week') changeWeek(1);
      else changeYear(1);
    });

    const todayBtn = el('button', 'btn btn-secondary btn-sm');
    todayBtn.appendChild(icon('ph-calendar-blank'));
    todayBtn.appendChild(el('span', '', 'Today'));
    todayBtn.addEventListener('click', () => goToToday());

    nav.appendChild(prevBtn);
    nav.appendChild(todayBtn);
    nav.appendChild(nextBtn);

    const filters = el('div', 'cal-filters');
    ['all', 'meetings', 'sometime', 'habits', 'tracking'].forEach(f => {
      const chip = el('button', 'cal-filter-chip' + (state.calendarFilter === f ? ' active' : ''));
      chip.textContent = ({
        all: '全部',
        meetings: '会议',
        sometime: '待办',
        habits: '习惯',
        tracking: '计时',
      })[f];
      chip.addEventListener('click', () => {
        state.calendarFilter = f;
        renderMain();
      });
      filters.appendChild(chip);
    });

    const moreFiltersBtn = el('button', 'cal-filter-chip cal-more-filters' + (activeFilterCount('calendar') > 0 ? ' active' : ''));
    moreFiltersBtn.type = 'button';
    moreFiltersBtn.appendChild(icon('ph-sliders-horizontal'));
    moreFiltersBtn.appendChild(el('span', '', 'More'));
    const calFilterCount = activeFilterCount('calendar');
    if (calFilterCount > 0) moreFiltersBtn.appendChild(el('span', 'filter-count', String(calFilterCount)));
    moreFiltersBtn.addEventListener('click', () => openFilterPanel('calendar'));
    filters.appendChild(moreFiltersBtn);

    const newBtn = el('button', 'btn btn-primary btn-sm');
    newBtn.appendChild(icon('ph-plus'));
    newBtn.appendChild(el('span', '', 'New'));
    newBtn.addEventListener('click', () => openEventModal());

    right.appendChild(nav);
    right.appendChild(filters);
    right.appendChild(newBtn);

    header.appendChild(left);
    header.appendChild(tabs);
    header.appendChild(right);
    return header;
  }

  function goToToday() {
    state.calendarSelected = new Date(2026, 6, 20);
    state.calendarWeekStart = startOfWeek(state.calendarSelected);
    state.calendarYearAnchor = new Date(2026, 6, 1);
    renderMain();
  }

  function calendarHeaderSubtitle() {
    if (state.calendarView === 'day') return formatDateLabel(state.calendarSelected);
    if (state.calendarView === 'week') {
      const ws = state.calendarWeekStart || startOfWeek(state.calendarSelected);
      const we = endOfWeek(ws);
      const m1 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ws.getMonth()];
      const m2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][we.getMonth()];
      if (ws.getMonth() === we.getMonth()) return m1 + ' ' + ws.getDate() + ' – ' + we.getDate() + ', ' + ws.getFullYear();
      return m1 + ' ' + ws.getDate() + ' – ' + m2 + ' ' + we.getDate() + ', ' + we.getFullYear();
    }
    return state.calendarYearAnchor.getFullYear() + ' · 全年鸟瞰';
  }

  function renderDayView() {
    const wrap = el('div', 'day-view');
    const filteredMeetings = filterMeetings(D._meetings);
    const dayMeetings = getMeetingsForDate(state.calendarSelected, filteredMeetings);
    const multiDay = getMultiDayEventsForDate(state.calendarSelected, D.calendarExtras.multiDayEvents || []);

    const topSection = el('div', 'day-top');
    topSection.appendChild(renderDayHero(state.calendarSelected));
    topSection.appendChild(renderDayActions(state.calendarSelected, dayMeetings));

    const filmstripSection = el('div', 'day-filmstrip-section');
    filmstripSection.appendChild(renderDayFilmstrip(dayMeetings));

    const belowRow = el('div', 'day-below');
    if (state.calendarFilter === 'all' || state.calendarFilter === 'sometime') {
      belowRow.appendChild(renderSometimePanel());
    }
    if (state.calendarFilter === 'all' || state.calendarFilter === 'habits') {
      belowRow.appendChild(renderHabitsPanel(state.calendarSelected));
    }
    if (state.calendarFilter === 'all' || state.calendarFilter === 'tracking') {
      belowRow.appendChild(renderTimeTrackingPanel(state.calendarSelected));
    }

    const detailRow = el('div', 'day-detail');
    detailRow.appendChild(renderDayAgenda(dayMeetings, state.calendarSelected));
    if (state.calendarFilter === 'all') {
      detailRow.appendChild(renderDayJournal(state.calendarSelected));
    }

    wrap.appendChild(topSection);
    if (state.calendarFilter === 'all' || state.calendarFilter === 'meetings') {
      wrap.appendChild(filmstripSection);
      wrap.appendChild(detailRow);
    }
    wrap.appendChild(belowRow);
    if (multiDay.length) {
      wrap.appendChild(renderMultiDayStrip(multiDay));
    }
    return wrap;
  }

  function renderDayHero(date) {
    const hero = el('div', 'day-hero');
    const key = dateKey(date);
    const dayLabel = (D.calendarExtras.dayLabels || {})[key];
    const photo = (D.calendarExtras.dayPhotos || {})[key];
    const circled = !!(D.calendarExtras.dayCircled || {})[key];

    if (photo) {
      const bg = el('div', 'day-hero-bg');
      bg.style.background = 'linear-gradient(135deg, ' + photo + ' 0%, rgba(255,255,255,0.85) 100%)';
      hero.appendChild(bg);
    }

    const inner = el('div', 'day-hero-inner');
    const dateBlock = el('div', 'day-hero-date');
    const weekday = el('div', 'day-hero-weekday');
    weekday.textContent = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][date.getDay()];
    const day = el('div', 'day-hero-day');
    day.textContent = date.getDate();
    const monthLine = el('div', 'day-hero-month');
    monthLine.textContent = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'][date.getMonth()] + ' ' + date.getFullYear();
    dateBlock.appendChild(weekday);
    dateBlock.appendChild(day);
    dateBlock.appendChild(monthLine);
    inner.appendChild(dateBlock);

    const middle = el('div', 'day-hero-middle');
    const titleWrap = el('div', 'day-hero-title-wrap');
    const titleInput = el('div', 'day-hero-title' + (dayLabel ? ' has-label' : ''));
    titleInput.contentEditable = true;
    titleInput.spellcheck = false;
    titleInput.textContent = dayLabel || '为这一天命名…';
    if (!dayLabel) titleInput.classList.add('placeholder');
    titleInput.addEventListener('focus', () => {
      if (!D.calendarExtras.dayLabels[key]) {
        titleInput.textContent = '';
        titleInput.classList.remove('placeholder');
      }
    });
    titleInput.addEventListener('blur', () => {
      const v = titleInput.textContent.trim();
      if (v) {
        D.calendarExtras.dayLabels[key] = v;
        titleInput.classList.add('has-label');
      } else {
        delete D.calendarExtras.dayLabels[key];
        titleInput.textContent = '为这一天命名…';
        titleInput.classList.add('placeholder');
      }
    });
    titleWrap.appendChild(titleInput);
    middle.appendChild(titleWrap);

    const stats = el('div', 'day-hero-stats');
    const dayMeetings = getMeetingsForDate(date, filterMeetings(D._meetings));
    const slots = computeFreetimeSlots(dayMeetings, 6, 22);
    const longest = slots.reduce((a, b) => (b.duration > (a ? a.duration : 0) ? b : a), null);
    const totalBusy = dayMeetings.reduce((s, m) => {
      const t = parseMeetingTime(m);
      return t ? s + (t.end - t.start) : s;
    }, 0);
    const freetimeMin = slots.reduce((s, x) => s + x.duration, 0);

    const stat1 = el('div', 'day-stat');
    stat1.appendChild(el('div', 'day-stat-label', '会议'));
    stat1.appendChild(el('div', 'day-stat-value', formatTimeCompact(totalBusy)));
    stats.appendChild(stat1);

    const stat2 = el('div', 'day-stat');
    stat2.appendChild(el('div', 'day-stat-label', '空闲'));
    stat2.appendChild(el('div', 'day-stat-value', formatTimeCompact(freetimeMin)));
    stats.appendChild(stat2);

    const stat3 = el('div', 'day-stat');
    stat3.appendChild(el('div', 'day-stat-label', '最长空档'));
    stat3.appendChild(el('div', 'day-stat-value', longest && longest.duration >= 60 ? formatTimeCompact(longest.duration) : '—'));
    stats.appendChild(stat3);

    middle.appendChild(stats);
    inner.appendChild(middle);

    const aside = el('div', 'day-hero-aside');
    const circleBtn = el('button', 'day-circle-btn' + (circled ? ' active' : ''));
    circleBtn.title = circled ? '取消标记' : '标记这一天';
    circleBtn.appendChild(icon(circled ? 'ph-circle-half-tilt' : 'ph-circle'));
    circleBtn.appendChild(el('span', '', circled ? '已标记' : '标记'));
    circleBtn.addEventListener('click', () => {
      if (D.calendarExtras.dayCircled[key]) delete D.calendarExtras.dayCircled[key];
      else D.calendarExtras.dayCircled[key] = true;
      renderMain();
    });
    aside.appendChild(circleBtn);

    const photoBtn = el('button', 'day-photo-btn');
    photoBtn.title = '添加背景';
    photoBtn.appendChild(icon('ph-image'));
    photoBtn.addEventListener('click', () => {
      const colors = ['#fde68a', '#fca5a5', '#a7f3d0', '#bae6fd', '#ddd6fe', '#fed7aa'];
      const palette = ['#fde68a', '#86efac', '#93c5fd', '#c4b5fd', '#fbcfe8'];
      const cur = D.calendarExtras.dayPhotos || {};
      const used = Object.values(cur);
      const available = palette.filter(c => used.indexOf(c) === -1);
      const next = available.length ? available[0] : palette[Math.floor(Math.random() * palette.length)];
      if (cur[key]) delete cur[key];
      else cur[key] = next;
      D.calendarExtras.dayPhotos = cur;
      renderMain();
    });
    aside.appendChild(photoBtn);

    inner.appendChild(aside);
    hero.appendChild(inner);
    return hero;
  }

  function renderDayActions(date, meetings) {
    const wrap = el('div', 'day-actions');
    const dateKeyVal = dateKey(date);
    const today = new Date(2026, 6, 20);
    const isToday = sameDate(date, today);

    const reminder = el('button', 'btn btn-ghost btn-sm');
    reminder.appendChild(icon('ph-arrow-fat-line-up'));
    reminder.appendChild(el('span', '', 'Bubble Up'));
    reminder.addEventListener('click', () => openTaskModal(null, {
      relatedType: 'none',
      dueDate: dateKey(state.calendarSelected),
      description: 'Bubble Up reminder'
    }));

    const sometime = el('button', 'btn btn-ghost btn-sm');
    sometime.appendChild(icon('ph-list-checks'));
    sometime.appendChild(el('span', '', 'Sometime'));
    sometime.addEventListener('click', () => openSometimeModal());

    const tracking = el('button', 'btn btn-ghost btn-sm');
    tracking.appendChild(icon('ph-clock-clockwise'));
    tracking.appendChild(el('span', '', '开始计时'));
    tracking.addEventListener('click', () => startTimeTracking(date));

    wrap.appendChild(reminder);
    wrap.appendChild(sometime);
    wrap.appendChild(tracking);
    return wrap;
  }

  function renderDayFilmstrip(meetings) {
    const wrap = el('div', 'filmstrip-wrap');
    const scroll = el('div', 'filmstrip-scroll');
    const strip = el('div', 'filmstrip-strip');

    const startHour = 0;
    const endHour = 24;
    const totalMinutes = (endHour - startHour) * 60;

    const rail = el('div', 'filmstrip-rail');
    rail.style.width = '100%';
    for (let h = startHour; h <= endHour; h++) {
      const tick = el('div', 'filmstrip-tick' + (h % 3 === 0 ? ' major' : ''));
      tick.style.left = ((h - startHour) / (endHour - startHour) * 100) + '%';
      if (h % 3 === 0) {
        const label = el('div', 'filmstrip-tick-label');
        label.textContent = h.toString().padStart(2, '0') + ':00';
        tick.appendChild(label);
      }
      rail.appendChild(tick);
    }
    strip.appendChild(rail);

    const slots = computeFreetimeSlots(meetings, startHour, endHour);
    slots.forEach(s => {
      if (s.duration < 60) return;
      const left = ((s.start - startHour * 60) / totalMinutes) * 100;
      const width = (s.duration / totalMinutes) * 100;
      const block = el('div', 'filmstrip-freetime');
      block.style.left = left + '%';
      block.style.width = width + '%';
      block.title = '空闲 ' + formatTimeCompact(s.duration);
      if (s.duration >= 180) {
        const lbl = el('div', 'filmstrip-freetime-label');
        lbl.textContent = formatTimeCompact(s.duration) + ' 空闲';
        block.appendChild(lbl);
      }
      block.addEventListener('click', () => openEventModal({ slot: s }));
      strip.appendChild(block);
    });

    const today = new Date(2026, 6, 20);
    if (sameDate(state.calendarSelected, today)) {
      const now = new Date(2026, 6, 20, 9, 0, 0);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const left = ((nowMin - startHour * 60) / totalMinutes) * 100;
      const marker = el('div', 'filmstrip-now');
      marker.style.left = left + '%';
      const dot = el('div', 'filmstrip-now-dot');
      marker.appendChild(dot);
      const lbl = el('div', 'filmstrip-now-label');
      lbl.textContent = 'Now · ' + formatMinutes(nowMin);
      marker.appendChild(lbl);
      strip.appendChild(marker);
    }

    meetings.forEach(m => {
      const t = parseMeetingTime(m);
      if (!t) return;
      const left = ((t.start - startHour * 60) / totalMinutes) * 100;
      const width = Math.max(2, (t.end - t.start) / totalMinutes * 100);
      const color = eventColor(m);
      const ev = el('div', 'filmstrip-event filmstrip-event-' + color);
      ev.style.left = left + '%';
      ev.style.width = width + '%';
      ev.title = m.title + ' · ' + formatMinutes(t.start) + '–' + formatMinutes(t.end);
      const evTime = el('div', 'filmstrip-event-time');
      evTime.textContent = formatMinutes(t.start);
      ev.appendChild(evTime);
      const evTitle = el('div', 'filmstrip-event-title');
      evTitle.textContent = m.title;
      ev.appendChild(evTitle);
      const evPeople = el('div', 'filmstrip-event-people');
      evPeople.textContent = m.ppl;
      ev.appendChild(evPeople);
      ev.addEventListener('click', () => openMeeting(m));
      strip.appendChild(ev);
    });

    scroll.appendChild(strip);
    wrap.appendChild(scroll);
    return wrap;
  }

  function renderDayAgenda(meetings, date) {
    const wrap = el('div', 'day-agenda-card');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '今日会议'));
    const count = el('div', 'card-head-count');
    count.textContent = meetings.length + ' 场';
    head.appendChild(count);
    wrap.appendChild(head);

    const list = el('div', 'day-agenda-list');
    if (meetings.length === 0) {
      list.appendChild(el('div', 'empty-soft', '没有会议，给自己一点时间吧。'));
    } else {
      meetings.forEach(m => {
        const item = el('div', 'day-agenda-item');
        const t = parseMeetingTime(m);
        const color = eventColor(m);
        const stripe = el('div', 'day-agenda-stripe stripe-' + color);
        item.appendChild(stripe);
        const body = el('div', 'day-agenda-body');
        if (t) {
          const time = el('div', 'day-agenda-time');
          time.textContent = formatMinutes(t.start) + ' – ' + formatMinutes(t.end);
          body.appendChild(time);
        }
        body.appendChild(el('div', 'day-agenda-title', m.title));
        body.appendChild(el('div', 'day-agenda-people', m.ppl));
        if (m.notes) body.appendChild(el('div', 'day-agenda-note', m.notes));

        if (m.prep && m.prep.length) {
          const prep = el('div', 'day-agenda-prep');
          m.prep.forEach((p, idx) => {
            const check = el('label', 'prep-check');
            const cb = el('input');
            cb.type = 'checkbox';
            const k = m.id + '-prep-' + idx;
            cb.checked = !!state.prepChecked[k];
            cb.addEventListener('change', () => {
              state.prepChecked[k] = cb.checked;
              if (cb.checked) {
                check.classList.add('done');
              } else {
                check.classList.remove('done');
              }
            });
            if (cb.checked) check.classList.add('done');
            check.appendChild(cb);
            check.appendChild(el('span', '', p));
            prep.appendChild(check);
          });
          body.appendChild(prep);
        } else if (m.post) {
          body.appendChild(el('div', 'post-item', m.post));
        }

        const footer = el('div', 'day-agenda-footer');
        const brief = el('button', 'day-brief-btn' + (m.br ? ' ready' : ''));
        brief.appendChild(icon(m.br ? 'ph-arrows-clockwise' : 'ph-sparkle'));
        brief.appendChild(el('span', '', m.br ? 'Regenerate' : 'AI 简报'));
        brief.addEventListener('click', (e) => { e.stopPropagation(); generateBrief(m); });
        footer.appendChild(brief);
        body.appendChild(footer);

        item.appendChild(body);
        item.addEventListener('click', () => openMeeting(m));
        list.appendChild(item);
      });
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderSometimePanel() {
    const wrap = el('div', 'sometime-card');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '本周随手做'));
    const add = el('button', 'icon-btn');
    add.appendChild(icon('ph-plus'));
    add.addEventListener('click', () => openSometimeModal());
    head.appendChild(add);
    wrap.appendChild(head);

    const list = el('div', 'sometime-list');
    const items = (D.calendarExtras.sometime || []).slice(0, 6);
    if (items.length === 0) {
      list.appendChild(el('div', 'empty-soft', '本周还没有"不一定哪一天"的事。'));
    } else {
      items.forEach(it => {
        const row = el('div', 'sometime-row');
        const check = el('label', 'prep-check');
        const cb = el('input');
        cb.type = 'checkbox';
        check.appendChild(cb);
        check.appendChild(el('span', '', it.title));
        const meta = el('div', 'sometime-meta');
        meta.appendChild(icon('ph-clock'));
        meta.appendChild(el('span', '', formatTimeCompact(it.estMin)));
        row.appendChild(check);
        row.appendChild(meta);
        list.appendChild(row);
      });
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderHabitsPanel(date) {
    const wrap = el('div', 'habits-card');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '今日习惯'));
    const dot = el('div', 'habits-progress');
    const done = (D.calendarExtras.habits || []).filter(h => h.days[date.getDay()]).length;
    dot.textContent = done + ' / ' + (D.calendarExtras.habits || []).length;
    head.appendChild(dot);
    wrap.appendChild(head);

    const list = el('div', 'habits-list');
    (D.calendarExtras.habits || []).forEach(h => {
      const row = el('div', 'habit-row habit-color-' + h.color);
      const dot = el('div', 'habit-dot');
      dot.appendChild(icon(h.icon));
      const body = el('div', 'habit-body');
      body.appendChild(el('div', 'habit-title', h.title));
      const week = el('div', 'habit-week');
      const days = ['日','一','二','三','四','五','六'];
      for (let i = 0; i < 7; i++) {
        const cell = el('div', 'habit-day' + (h.days[i] ? ' done' : ''));
        cell.textContent = days[i];
        week.appendChild(cell);
      }
      body.appendChild(week);
      const check = el('label', 'habit-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!h.days[date.getDay()];
      check.appendChild(cb);
      check.appendChild(el('span', '', '今天'));
      cb.addEventListener('change', () => {
        h.days[date.getDay()] = cb.checked;
        renderMain();
      });
      body.appendChild(check);
      row.appendChild(dot);
      row.appendChild(body);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderTimeTrackingPanel(date) {
    const wrap = el('div', 'tracking-card');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '今日计时'));
    const add = el('button', 'btn btn-ghost btn-xs');
    add.appendChild(icon('ph-play'));
    add.appendChild(el('span', '', 'Start'));
    add.addEventListener('click', () => startTimeTracking(date));
    head.appendChild(add);
    wrap.appendChild(head);

    const dayKey = dateKey(date);
    const entries = (D.calendarExtras.timeTracking || []).filter(t => t.date === dayKey);
    const list = el('div', 'tracking-list');
    if (entries.length === 0) {
      list.appendChild(el('div', 'empty-soft', '今天还没有计时记录。'));
    } else {
      const total = entries.reduce((s, e) => s + e.minutes, 0);
      const summary = el('div', 'tracking-summary');
      summary.appendChild(el('div', 'tracking-total', formatTimeCompact(total)));
      summary.appendChild(el('div', 'tracking-breakdown', entries.map(e => e.category + ' ' + formatTimeCompact(e.minutes)).join(' · ')));
      list.appendChild(summary);

      const cats = {};
      entries.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.minutes; });
      const bars = el('div', 'tracking-bars');
      Object.keys(cats).forEach(k => {
        const row = el('div', 'tracking-bar-row');
        const label = el('div', 'tracking-bar-label', k);
        const bar = el('div', 'tracking-bar');
        const fill = el('div', 'tracking-bar-fill');
        fill.style.width = (cats[k] / total * 100) + '%';
        bar.appendChild(fill);
        const val = el('div', 'tracking-bar-val', formatTimeCompact(cats[k]));
        row.appendChild(label);
        row.appendChild(bar);
        row.appendChild(val);
        bars.appendChild(row);
      });
      list.appendChild(bars);
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderDayJournal(date) {
    const wrap = el('div', 'journal-card');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '日记'));
    const count = el('div', 'card-head-count');
    count.textContent = (D.calendarExtras.dayPhotos && D.calendarExtras.dayPhotos[dateKey(state.calendarSelected)]) ? '有背景图' : '私人空间';
    head.appendChild(count);
    wrap.appendChild(head);

    const ta = el('textarea', 'journal-textarea');
    ta.placeholder = '今天的会议、感受、灵感…';
    ta.value = (D.calendarExtras.dayNotes || {})[dateKey(state.calendarSelected)] || '';
    ta.addEventListener('input', () => {
      if (!D.calendarExtras.dayNotes) D.calendarExtras.dayNotes = {};
      D.calendarExtras.dayNotes[dateKey(state.calendarSelected)] = ta.value;
    });
    wrap.appendChild(ta);
    return wrap;
  }

  function renderMultiDayStrip(events) {
    const wrap = el('div', 'multi-day-strip');
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-head-title', '跨日事件'));
    const count = el('div', 'card-head-count');
    count.textContent = events.length + ' 个';
    head.appendChild(count);
    wrap.appendChild(head);

    const list = el('div', 'multi-day-list');
    events.forEach(e => {
      const row = el('div', 'multi-day-row stripe-bg-' + (e.color || 'sky'));
      const title = el('div', 'multi-day-title');
      title.textContent = e.title;
      const date = el('div', 'multi-day-date');
      const s = fromKey(e.start), en = fromKey(e.end);
      const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      date.textContent = months[s.getMonth()] + ' ' + s.getDate() + ' – ' + (s.getMonth() === en.getMonth() ? en.getDate() + ', ' : months[en.getMonth()] + ' ' + en.getDate() + ', ') + en.getFullYear();
      row.appendChild(title);
      row.appendChild(date);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderWeekView() {
    const wrap = el('div', 'week-view');
    const ws = state.calendarWeekStart || startOfWeek(state.calendarSelected);
    state.calendarWeekStart = ws;
    const we = endOfWeek(ws);

    const filteredMeetings = filterMeetings(D._meetings);
    const multiDayEvents = getMultiDayEventsInRange(ws, we, D.calendarExtras.multiDayEvents || []);

    const multiDayRow = el('div', 'week-multi-day-row');
    multiDayRow.appendChild(el('div', 'week-multi-day-spacer'));
    const multiDayTrack = el('div', 'week-multi-day-track');
    multiDayEvents.forEach(e => {
      const bar = el('div', 'week-multi-day-bar stripe-bg-' + (e.color || 'sky'));
      const s = Math.max(0, Math.floor((fromKey(e.start) - ws) / (1000 * 60 * 60 * 24)));
      const en = Math.min(6, Math.floor((fromKey(e.end) - ws) / (1000 * 60 * 60 * 24)));
      bar.style.left = (s / 7 * 100) + '%';
      bar.style.width = ((en - s + 1) / 7 * 100) + '%';
      bar.appendChild(el('span', '', e.title));
      multiDayTrack.appendChild(bar);
    });
    multiDayRow.appendChild(multiDayTrack);
    wrap.appendChild(multiDayRow);

    const cols = el('div', 'week-cols');
    for (let i = 0; i < 7; i++) {
      const day = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      const col = el('div', 'week-col');
      const today = new Date(2026, 6, 20);
      const isToday = sameDate(day, today);
      const isSel = sameDate(day, state.calendarSelected);
      const key = dateKey(day);
      const label = (D.calendarExtras.dayLabels || {})[key];
      const photo = (D.calendarExtras.dayPhotos || {})[key];
      const circled = !!(D.calendarExtras.dayCircled || {})[key];
      if (photo) col.style.background = 'linear-gradient(180deg, ' + photo + ' 0%, transparent 60%)';

      if (isToday) col.classList.add('today');
      if (isSel) col.classList.add('selected');
      if (circled) col.classList.add('circled');

      const head = el('div', 'week-col-head');
      head.appendChild(el('div', 'week-col-dayname', ['日','一','二','三','四','五','六'][day.getDay()]));
      head.appendChild(el('div', 'week-col-daynum', day.getDate().toString()));
      if (label) head.appendChild(el('div', 'week-col-label', label));
      head.addEventListener('click', () => {
        state.calendarSelected = day;
        state.calendarView = 'day';
        renderMain();
      });
      col.appendChild(head);

      const dayMeetings = getMeetingsForDate(day, filteredMeetings);
      const slots = computeFreetimeSlots(dayMeetings, 6, 22);
      const totalBusy = dayMeetings.reduce((s, m) => {
        const t = parseMeetingTime(m);
        return t ? s + (t.end - t.start) : s;
      }, 0);

      const stats = el('div', 'week-col-stats');
      stats.appendChild(el('div', 'week-col-stat', dayMeetings.length + ' 会议'));
      stats.appendChild(el('div', 'week-col-stat', formatTimeCompact(totalBusy) + ' 工作'));
      col.appendChild(stats);

      const timeline = el('div', 'week-col-timeline');
      const rail = el('div', 'week-col-rail');
      for (let h = 6; h <= 22; h += 2) {
        const t = el('div', 'week-col-tick');
        t.style.top = ((h - 6) / 16 * 100) + '%';
        t.textContent = h;
        rail.appendChild(t);
      }
      timeline.appendChild(rail);
      const eventsBox = el('div', 'week-col-events');
      dayMeetings.forEach(m => {
        const tm = parseMeetingTime(m);
        if (!tm) return;
        const top = Math.max(0, (tm.start - 6 * 60) / (16 * 60) * 100);
        const height = Math.max(8, (tm.end - tm.start) / (16 * 60) * 100);
        const ev = el('div', 'week-col-event stripe-bg-' + eventColor(m));
        ev.style.top = top + '%';
        ev.style.height = height + '%';
        ev.appendChild(el('div', 'week-col-event-time', formatMinutes(tm.start)));
        ev.appendChild(el('div', 'week-col-event-title', m.title));
        ev.addEventListener('click', (e) => { e.stopPropagation(); openMeeting(m); });
        eventsBox.appendChild(ev);
      });
      timeline.appendChild(eventsBox);
      col.appendChild(timeline);

      const freetime = el('div', 'week-col-freetime');
      const longest = slots.reduce((a, b) => (b.duration > (a ? a.duration : 0) ? b : a), null);
      if (longest && longest.duration >= 60) {
        freetime.textContent = '空闲 ' + formatTimeCompact(longest.duration);
        if (longest.duration >= 180) freetime.classList.add('long');
      } else {
        freetime.textContent = '忙碌';
        freetime.classList.add('busy');
      }
      col.appendChild(freetime);

      cols.appendChild(col);
    }
    wrap.appendChild(cols);
    return wrap;
  }

  function renderYearView() {
    const wrap = el('div', 'year-view');
    const y = state.calendarYearAnchor.getFullYear();
    const filteredMeetings = filterMeetings(D._meetings);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const hero = el('div', 'year-hero');
    hero.appendChild(el('div', 'year-hero-year', y));
    hero.appendChild(el('div', 'year-hero-sub', '全年节奏 · 单日事件 · 跨日弧线'));
    wrap.appendChild(hero);

    const legend = el('div', 'year-legend');
    const dotLegend = el('div', 'legend-item');
    dotLegend.appendChild(el('div', 'legend-dot', ''));
    dotLegend.appendChild(el('span', '', '单日会议'));
    legend.appendChild(dotLegend);
    const mdLegend = el('div', 'legend-item');
    mdLegend.appendChild(el('div', 'legend-bar stripe-bg-mint', ''));
    mdLegend.appendChild(el('span', '', '跨日事件'));
    legend.appendChild(mdLegend);
    const phLegend = el('div', 'legend-item');
    phLegend.appendChild(el('div', 'legend-bar stripe-bg-canary', ''));
    phLegend.appendChild(el('span', '', '已加背景'));
    legend.appendChild(phLegend);
    const ciLegend = el('div', 'legend-item');
    ciLegend.appendChild(el('div', 'legend-circle', ''));
    ciLegend.appendChild(el('span', '', '已标记'));
    legend.appendChild(ciLegend);
    wrap.appendChild(legend);

    const monthsWrap = el('div', 'year-months');
    for (let m = 0; m < 12; m++) {
      const card = el('div', 'year-month');
      const mhead = el('div', 'year-month-head');
      mhead.appendChild(el('div', 'year-month-name', months[m]));
      mhead.appendChild(el('div', 'year-month-year', y));
      card.appendChild(mhead);

      const weekdays = el('div', 'year-month-weekdays');
      ['S','M','T','W','T','F','S'].forEach(w => weekdays.appendChild(el('div', '', w)));
      card.appendChild(weekdays);

      const grid = el('div', 'year-month-grid');
      const firstDay = new Date(y, m, 1);
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const startWeekday = firstDay.getDay();
      for (let i = 0; i < startWeekday; i++) grid.appendChild(el('div', 'year-month-cell empty'));
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = el('div', 'year-month-cell');
        const dayDate = new Date(y, m, d);
        const key = dateKey(dayDate);
        cell.textContent = d.toString();
        const hasMeeting = filteredMeetings.some(mtg => sameDate(parseMeetingDate(mtg.dt), dayDate));
        const hasMd = (D.calendarExtras.multiDayEvents || []).some(e => {
          const s = fromKey(e.start), en = fromKey(e.end);
          return dayDate >= s && dayDate <= en;
        });
        const circled = !!(D.calendarExtras.dayCircled || {})[key];
        const hasPhoto = !!(D.calendarExtras.dayPhotos || {})[key];
        if (hasMd) cell.classList.add('has-multiday');
        if (hasMeeting) cell.classList.add('has-meeting');
        if (circled) cell.classList.add('circled');
        if (hasPhoto) cell.classList.add('has-photo');
        const today = new Date(2026, 6, 20);
        if (sameDate(dayDate, today)) cell.classList.add('today');
        if (sameDate(dayDate, state.calendarSelected)) cell.classList.add('selected');
        cell.addEventListener('click', () => {
          state.calendarSelected = dayDate;
          state.calendarView = 'day';
          renderMain();
        });
        grid.appendChild(cell);
      }
      card.appendChild(grid);

      const arcs = el('div', 'year-month-arcs');
      (D.calendarExtras.multiDayEvents || []).forEach(e => {
        const s = fromKey(e.start);
        const en = fromKey(e.end);
        if (en.getFullYear() < y || s.getFullYear() > y) return;
        if (s.getFullYear() < y && en.getFullYear() > y) {
          const arc = el('div', 'year-arc stripe-bg-' + (e.color || 'sky'));
          arc.style.left = '0%';
          arc.style.width = '100%';
          arc.title = e.title;
          arcs.appendChild(arc);
        } else if (s.getFullYear() === y || en.getFullYear() === y) {
          const sy = s.getFullYear() === y ? s.getMonth() : 0;
          const ey = en.getFullYear() === y ? en.getMonth() : 11;
          if (sy === m || ey === m || (sy < m && ey > m)) {
            const arc = el('div', 'year-arc stripe-bg-' + (e.color || 'sky'));
            arc.title = e.title;
            if (sy === m && ey === m) {
              const l = (s.getDate() - 1) / daysInMonth * 100;
              const r = (en.getDate()) / daysInMonth * 100;
              arc.style.left = l + '%';
              arc.style.width = (r - l) + '%';
            } else if (sy === m) {
              const l = (s.getDate() - 1) / daysInMonth * 100;
              arc.style.left = l + '%';
              arc.style.width = (100 - l) + '%';
            } else if (ey === m) {
              arc.style.left = '0%';
              arc.style.width = (en.getDate() / daysInMonth * 100) + '%';
            } else {
              arc.style.left = '0%';
              arc.style.width = '100%';
            }
            arcs.appendChild(arc);
          }
        }
      });
      card.appendChild(arcs);

      monthsWrap.appendChild(card);
    }
    wrap.appendChild(monthsWrap);
    return wrap;
  }

  function openSometimeModal(slot) {
    const minutes = slot ? slot.duration : 30;
    openTaskModal(null, {
      relatedType: 'none',
      dueDate: dateKey(state.calendarSelected),
      description: slot ? `Estimated: ${formatTimeCompact(minutes)}` : '',
      onSave: (task) => {
        // Keep the legacy Sometime panel working while storing the canonical task in D.tasks.
        D.calendarExtras.sometime = D.calendarExtras.sometime || [];
        D.calendarExtras.sometime.push({ id: 'st' + Date.now(), title: task.title, estMin: minutes, added: dateKey(new Date()) });
      }
    });
  }

  function startTimeTracking(date) {
    openTaskModal(null, {
      relatedType: 'none',
      dueDate: dateKey(date),
      status: 'in-progress',
      description: 'Time tracking',
      onSave: (task) => {
        // Keep the legacy time-tracking panel working while storing the canonical task in D.tasks.
        D.calendarExtras.timeTracking = D.calendarExtras.timeTracking || [];
        D.calendarExtras.timeTracking.push({ date: dateKey(date), minutes: 25, category: task.title || 'Deep work', icon: 'ph-laptop', note: task.description || '' });
      }
    });
  }

  function filterMeetings(meetings) {
    let result = meetings;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(m =>
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.ppl && m.ppl.toLowerCase().includes(q))
      );
    }
    result = applyCalendarAdvancedFilters(result);
    return result;
  }

  function fileTypeLabel(tp) {
    const map = { pdf: 'PDF', doc: 'Doc', image: 'Image', sheet: 'Spreadsheet', spreadsheet: 'Spreadsheet' };
    return map[tp] || (tp ? tp.charAt(0).toUpperCase() + tp.slice(1) : 'File');
  }

  function fileIconName(tp) {
    if (tp === 'pdf') return 'ph-file-pdf';
    if (tp === 'doc') return 'ph-file-doc';
    if (tp === 'image') return 'ph-file-image';
    if (tp === 'sheet' || tp === 'spreadsheet') return 'ph-table';
    return 'ph-file';
  }

  function fileIconForName(name) {
    const lower = (name || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'ph-file-pdf';
    if (/\.(docx?|doc)$/.test(lower)) return 'ph-file-doc';
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower)) return 'ph-file-image';
    if (/\.(xlsx?|csv)$/.test(lower)) return 'ph-table';
    if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) return 'ph-file-zip';
    if (/\.(md|txt|rtf)$/.test(lower)) return 'ph-file-text';
    return 'ph-file';
  }

  function renderFiles() {
    const container = el('div', 'view files-view');

    const filterBar = el('div', 'filter-bar');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'pdf', label: 'PDF' },
      { id: 'image', label: 'Image' },
      { id: 'doc', label: 'Doc' },
      { id: 'spreadsheet', label: 'Spreadsheet' },
    ];
    filters.forEach(f => {
      const btn = el('button', 'filter-pill' + (state.filesFilter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.filesFilter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });
    filterBar.appendChild(renderMoreFiltersButton('files'));
    container.appendChild(filterBar);

    const files = filterFiles(D._files);

    if (files.length === 0) {
      container.appendChild(renderEmpty('No files match your filter.', 'ph-files', null, 'art-blue'));
      return container;
    }

    const list = el('div', 'files-list');
    files.forEach(f => {
      const contact = D.getP(f.pid);
      const card = el('div', 'file-card' + (state.selectedFileId === f.id ? ' selected' : ''));
      card.addEventListener('click', () => openFile(f));

      const fileIcon = el('div', 'file-card-icon');
      fileIcon.appendChild(icon(fileIconName(f.tp)));

      const body = el('div', 'file-card-body');
      const top = el('div', 'file-card-top');
      top.appendChild(el('span', 'file-card-name', f.name));
      top.appendChild(el('span', 'file-card-size', f.sz));

      const bottom = el('div', 'file-card-bottom');
      const fromWrap = el('div', 'file-card-from');
      if (contact) {
        fromWrap.appendChild(renderAvatar(contact, 'file-card-avatar', contact.name[0], () => openContact(contact.id)));
        const fromName = el('span', '', contact.name);
        fromName.style.cursor = 'pointer';
        fromName.addEventListener('click', (e) => { e.stopPropagation(); openContact(contact.id); });
        fromWrap.appendChild(fromName);
      } else {
        fromWrap.appendChild(el('span', '', 'Unknown'));
      }
      bottom.appendChild(fromWrap);
      bottom.appendChild(el('span', 'file-card-meta', f.dt + ' · ' + fileTypeLabel(f.tp)));

      body.appendChild(top);
      body.appendChild(bottom);
      card.appendChild(fileIcon);
      card.appendChild(body);
      list.appendChild(card);
    });

    container.appendChild(list);
    return container;
  }

  // ===================================================================
  // Insights dashboard (Task 12)
  // ===================================================================

  const INSIGHTS_NOW = new Date('2026-07-20T12:00:00');

  function startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function isSameWeek(a, b) {
    const sa = startOfWeek(a);
    const sb = startOfWeek(b);
    return sa.getFullYear() === sb.getFullYear() && sa.getMonth() === sb.getMonth() && sa.getDate() === sb.getDate();
  }

  function messagesInWeek(anchor, offset) {
    const weekStart = startOfWeek(anchor);
    weekStart.setDate(weekStart.getDate() + offset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return D._msgs.filter(m => {
      const t = new Date(m.st).getTime();
      return !isNaN(t) && t >= weekStart.getTime() && t < weekEnd.getTime();
    });
  }

  function computeWeeklyVolume() {
    const current = messagesInWeek(INSIGHTS_NOW, 0).length;
    const previous = messagesInWeek(INSIGHTS_NOW, -1).length;
    const trend = previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);
    return { current, previous, trend };
  }

  function computeTopPeople(limit = 5) {
    const counts = {};
    D._msgs.forEach(m => {
      if (!m.pid) return;
      counts[m.pid] = (counts[m.pid] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([pid, count]) => ({ contact: D.getP(pid), count }))
      .filter(({ contact }) => contact && (contact.health || 0) > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  function computeReplyTimeTrend() {
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(INSIGHTS_NOW.getFullYear(), INSIGHTS_NOW.getMonth() - i, 1);
      months.push({ d, label: (d.getMonth() + 1) + '月', hours: 0, count: 0 });
    }

    const sorted = [...D._msgs].sort((a, b) => new Date(a.st) - new Date(b.st));
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.fm !== '你' && next.fm === '你') {
        const a = new Date(cur.st).getTime();
        const b = new Date(next.st).getTime();
        if (!a || !b || b <= a) continue;
        const d = new Date(next.st);
        const month = months.find(mo => d.getFullYear() === mo.d.getFullYear() && d.getMonth() === mo.d.getMonth());
        if (month) {
          month.hours += (b - a) / (1000 * 60 * 60);
          month.count++;
        }
      }
    }

    return months.map(mo => ({
      label: mo.label,
      hours: mo.count ? Math.round(mo.hours / mo.count) : 0,
    }));
  }

  function computeChannelShare() {
    const map = { 'Gmail': 'Email', 'Outlook': 'Email', 'Slack': 'Slack', 'WeChat': 'WeChat', 'Calendar': 'Calendar' };
    const counts = { Email: 0, Slack: 0, WeChat: 0, Calendar: 0 };
    D._msgs.forEach(m => {
      const ch = map[m.ch] || m.ch;
      if (counts[ch] !== undefined) counts[ch]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }

  function computeFollowUpCount() {
    const agent = (D.agentTasks || []).filter(t => t.status !== 'done').length;
    const general = (D.tasks || []).filter(t => t.status !== 'done' && t.status !== 'completed').length;
    return agent + general;
  }

  function computeAgentActionsThisWeek() {
    const actions = (D.agentAuditLog || []).filter(a => a.status === 'completed' || a.status === 'sent');
    const recent = [...actions].reverse().slice(0, 3);
    return { count: actions.length, recent };
  }

  function computeHealthDistribution() {
    const dist = { Healthy: 0, 'At risk': 0, Cold: 0 };
    D.contacts.forEach(c => {
      if (!c.health) return;
      if (c.health >= 70) dist.Healthy++;
      else if (c.health >= 40) dist['At risk']++;
      else dist.Cold++;
    });
    return dist;
  }

  function renderInsightsView() {
    const container = el('div', 'view insights-view');

    const grid = el('div', 'insights-grid');

    // Card 1: Weekly volume
    const volume = computeWeeklyVolume();
    const volCard = el('div', 'insights-card insights-card--hero');
    volCard.appendChild(el('div', 'insights-card-label', 'Messages this week'));
    const volValue = el('div', 'insights-hero-value', String(volume.current));
    const volMeta = el('div', 'insights-hero-meta');
    const volTrend = el('span', 'insights-trend' + (volume.trend >= 0 ? ' up' : ' down'));
    volTrend.appendChild(icon(volume.trend >= 0 ? 'ph-trend-up' : 'ph-trend-down'));
    volTrend.appendChild(el('span', '', Math.abs(volume.trend) + '% vs last week'));
    volMeta.appendChild(volTrend);
    volMeta.appendChild(el('span', 'insights-muted', volume.previous + ' last week'));
    volCard.appendChild(volValue);
    volCard.appendChild(volMeta);
    grid.appendChild(volCard);

    // Card 2: Top People
    const topPeople = computeTopPeople(5);
    const peopleCard = el('div', 'insights-card insights-card--list');
    peopleCard.appendChild(el('div', 'insights-card-label', 'Top People'));
    const peopleList = el('div', 'insights-list');
    if (!topPeople.length) {
      peopleList.appendChild(el('div', 'insights-empty', 'No recent conversations'));
    }
    topPeople.forEach(({ contact, count }) => {
      const row = el('div', 'insights-person-row');
      row.appendChild(renderAvatar(contact, 'insights-avatar', contact.name ? contact.name[0] : '?', () => openContact(contact.id)));
      const info = el('div', 'insights-person-info');
      info.appendChild(el('div', 'insights-person-name', contact.name));
      info.appendChild(el('div', 'insights-person-meta', contact.co + (contact.tl ? ' · ' + contact.tl : '')));
      row.appendChild(info);
      const scoreWrap = el('div', 'insights-person-score');
      scoreWrap.appendChild(icon(statusIconFor(contact.grp)));
      scoreWrap.appendChild(el('span', '', contact.sc || 0));
      scoreWrap.style.color = statusColorFor(contact.grp);
      row.appendChild(scoreWrap);
      const countWrap = el('div', 'insights-person-count', count + '');
      row.appendChild(countWrap);
      row.addEventListener('click', () => openContact(contact.id));
      peopleList.appendChild(row);
    });
    peopleCard.appendChild(peopleList);
    grid.appendChild(peopleCard);

    // Card 3: Reply time trend
    const replyTrend = computeReplyTimeTrend();
    const replyCard = el('div', 'insights-card insights-card--chart');
    replyCard.appendChild(el('div', 'insights-card-label', 'Avg. reply time'));
    const chartWrap = el('div', 'insights-line-chart');
    const maxHours = Math.max(1, ...replyTrend.map(p => p.hours));
    replyTrend.forEach((point, idx) => {
      const col = el('div', 'insights-line-col');
      const barWrap = el('div', 'insights-line-bar-wrap');
      const bar = el('div', 'insights-line-bar');
      bar.style.height = Math.round((point.hours / maxHours) * 100) + '%';
      barWrap.appendChild(bar);
      col.appendChild(barWrap);
      col.appendChild(el('div', 'insights-line-label', point.label));
      col.appendChild(el('div', 'insights-line-value', point.hours + 'h'));
      chartWrap.appendChild(col);
    });
    replyCard.appendChild(chartWrap);
    grid.appendChild(replyCard);

    // Card 4: Channel share
    const channels = computeChannelShare();
    const channelCard = el('div', 'insights-card');
    channelCard.appendChild(el('div', 'insights-card-label', 'Channel share'));
    const channelList = el('div', 'insights-channel-list');
    const channelColors = { Email: '#0A8F63', Slack: '#4a154b', WeChat: '#22c55e', Calendar: '#a78bfa' };
    channels.forEach(ch => {
      const row = el('div', 'insights-channel-row');
      const labelWrap = el('div', 'insights-channel-label-wrap');
      labelWrap.appendChild(el('span', 'insights-channel-name', ch.name));
      labelWrap.appendChild(el('span', 'insights-channel-count', ch.count + ''));
      row.appendChild(labelWrap);
      const barTrack = el('div', 'insights-channel-track');
      const barFill = el('div', 'insights-channel-fill');
      barFill.style.width = ch.pct + '%';
      barFill.style.background = channelColors[ch.name] || 'var(--accent)';
      barTrack.appendChild(barFill);
      row.appendChild(barTrack);
      row.appendChild(el('div', 'insights-channel-pct', ch.pct + '%'));
      channelList.appendChild(row);
    });
    channelCard.appendChild(channelList);
    grid.appendChild(channelCard);

    // Card 5: Follow-ups
    const followUpCount = computeFollowUpCount();
    const followCard = el('div', 'insights-card insights-card--hero insights-card--clickable');
    followCard.appendChild(el('div', 'insights-card-label', 'Follow-ups'));
    followCard.appendChild(el('div', 'insights-hero-value', String(followUpCount)));
    followCard.appendChild(el('div', 'insights-hero-meta', 'Open tasks waiting on you'));
    followCard.addEventListener('click', () => setView('agent'));
    grid.appendChild(followCard);

    // Card 6: Agent actions this week
    const agentActions = computeAgentActionsThisWeek();
    const agentCard = el('div', 'insights-card insights-card--list');
    agentCard.appendChild(el('div', 'insights-card-label', 'Agent actions this week'));
    agentCard.appendChild(el('div', 'insights-agent-count', agentActions.count + ' completed'));
    const actionList = el('div', 'insights-list');
    if (!agentActions.recent.length) {
      actionList.appendChild(el('div', 'insights-empty', 'No recent agent actions'));
    }
    agentActions.recent.forEach(a => {
      const row = el('div', 'insights-action-row');
      const iconWrap = el('div', 'insights-action-icon');
      iconWrap.appendChild(icon(a.action === 'draft' ? 'ph-pencil-simple' : a.action === 'send' ? 'ph-paper-plane' : 'ph-sparkle'));
      row.appendChild(iconWrap);
      const body = el('div', 'insights-action-body');
      body.appendChild(el('div', 'insights-action-title', a.detail));
      body.appendChild(el('div', 'insights-action-meta', a.target + ' · ' + a.time));
      row.appendChild(body);
      actionList.appendChild(row);
    });
    agentCard.appendChild(actionList);
    grid.appendChild(agentCard);

    // Card 7: Health distribution
    const healthDist = computeHealthDistribution();
    const healthCard = el('div', 'insights-card');
    healthCard.appendChild(el('div', 'insights-card-label', 'Relationship health'));
    const healthGrid = el('div', 'insights-health-grid');
    const healthMeta = [
      { key: 'Healthy', color: 'var(--green)', icon: 'ph-check-circle' },
      { key: 'At risk', color: 'var(--yellow)', icon: 'ph-warning' },
      { key: 'Cold', color: 'var(--red)', icon: 'ph-snowflake' },
    ];
    healthMeta.forEach(({ key, color, icon: iconName }) => {
      const item = el('div', 'insights-health-item');
      const count = healthDist[key] || 0;
      item.appendChild(el('div', 'insights-health-count', String(count)));
      const labelWrap = el('div', 'insights-health-label-wrap');
      const labelIcon = icon(iconName);
      labelIcon.style.color = color;
      labelWrap.appendChild(labelIcon);
      labelWrap.appendChild(el('span', '', key));
      item.appendChild(labelWrap);
      healthGrid.appendChild(item);
    });
    healthCard.appendChild(healthGrid);
    grid.appendChild(healthCard);

    container.appendChild(grid);
    return container;
  }

  function renderAgentSessionList() {
    const col = el('div', 'agent-workspace-col agent-session-list-col');

    const header = el('div', 'agent-col-header');
    header.appendChild(el('span', '', 'Sessions'));
    const newBtn = el('button', 'icon-btn agent-new-session-btn');
    newBtn.title = 'New session';
    newBtn.appendChild(icon('ph-plus'));
    newBtn.addEventListener('click', () => { createAgentSession('freeform', null, null); renderMain(); });
    header.appendChild(newBtn);
    col.appendChild(header);

    const searchWrap = el('div', 'agent-session-search');
    const searchInput = el('input', '');
    searchInput.placeholder = 'Search sessions...';
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      list.querySelectorAll('.agent-session-list-item').forEach(item => {
        const title = item.dataset.title || '';
        item.style.display = title.includes(q) ? '' : 'none';
      });
    });
    searchWrap.appendChild(icon('ph-magnifying-glass'));
    searchWrap.appendChild(searchInput);
    col.appendChild(searchWrap);

    const list = el('div', 'agent-session-list');

    const pinned = state.agentSessions.filter(s => s.status === 'pinned');
    const active = state.agentSessions.filter(s => s.status === 'active' || s.status === 'idle');
    const archived = state.agentSessions.filter(s => s.status === 'archived');

    const renderGroup = (sessions, container, emptyText) => {
      if (!sessions.length && emptyText) return;
      sessions.forEach(s => {
        const item = el('div', 'agent-session-list-item' + (s.id === state.currentAgentSessionId ? ' active' : ''));
        item.dataset.title = s.title.toLowerCase();
        item.dataset.id = s.id;
        item.appendChild(icon(agentContextKindIcon(s.context.kind)));
        const info = el('div', 'agent-session-list-info');
        info.appendChild(el('div', 'agent-session-list-title', s.title));
        const last = s.messages[s.messages.length - 1];
        info.appendChild(el('div', 'agent-session-list-preview', last ? last.text.slice(0, 36) : ''));
        item.appendChild(info);
        const meta = el('div', 'agent-session-list-meta');
        meta.appendChild(el('span', '', formatTimeAgo(s.updatedAt)));
        if (s.status === 'pinned') meta.appendChild(icon('ph-push-pin'));
        item.appendChild(meta);

        item.addEventListener('click', () => { switchAgentSession(s.id); renderMain(); });
        item.addEventListener('contextmenu', (e) => showSessionContextMenu(e, s));
        container.appendChild(item);
      });
    };

    renderGroup(pinned, list, null);
    renderGroup(active, list, null);

    if (archived.length) {
      const archiveToggle = el('button', 'agent-archive-toggle', 'Archived (' + archived.length + ')');
      let expanded = false;
      const archiveList = el('div', 'agent-archive-list hidden');
      renderGroup(archived, archiveList, null);
      archiveToggle.addEventListener('click', () => {
        expanded = !expanded;
        archiveList.classList.toggle('hidden', !expanded);
      });
      list.appendChild(archiveToggle);
      list.appendChild(archiveList);
    }

    col.appendChild(list);
    return col;
  }

  function showSessionContextMenu(e, session) {
    e.preventDefault();
    const existing = document.querySelector('.agent-session-context-menu');
    if (existing) existing.remove();

    const menu = el('div', 'agent-session-context-menu');
    const items = [
      { label: session.status === 'pinned' ? 'Unpin' : 'Pin', icon: 'ph-push-pin', action: () => { pinAgentSession(session.id); renderMain(); } },
      { label: 'Rename', icon: 'ph-pencil-simple', action: () => {
        const newTitle = prompt('Rename session', session.title);
        if (newTitle) { updateAgentSessionTitle(session.id, newTitle); renderMain(); }
      }},
      { label: session.status === 'archived' ? 'Restore' : 'Archive', icon: 'ph-archive', action: () => { archiveAgentSession(session.id); renderMain(); } },
    ];
    items.forEach(item => {
      const row = el('div', 'agent-context-menu-item');
      row.appendChild(icon(item.icon));
      row.appendChild(el('span', '', item.label));
      row.addEventListener('click', () => { item.action(); menu.remove(); });
      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  }

  function renderAgentMessage(m, session) {
    const row = el('div', 'agent-message agent-message-' + m.role);
    const bubble = el('div', 'agent-message-bubble');
    bubble.textContent = m.text;
    row.appendChild(bubble);

    if (m.role === 'agent' && m.actions && m.actions.length) {
      const actions = el('div', 'agent-message-actions');
      m.actions.forEach(a => {
        const btn = el('button', 'agent-message-action-btn', actionLabel(a));
        btn.addEventListener('click', (e) => { e.stopPropagation(); handleAgentMessageAction(a, m, session); });
        actions.appendChild(btn);
      });
      row.appendChild(actions);
    }
    return row;
  }

  function renderAgentConversation() {
    const col = el('div', 'agent-workspace-col agent-conversation-col');
    const session = getCurrentAgentSession();

    const header = el('div', 'agent-col-header');
    header.appendChild(el('span', '', session ? session.title : 'Conversation'));
    if (session && session.context?.kind) {
      const ctxLink = el('button', 'agent-context-link');
      ctxLink.appendChild(icon(agentContextKindIcon(session.context.kind)));
      ctxLink.appendChild(el('span', '', session.context.preview));
      ctxLink.addEventListener('click', () => {
        if (session.context.kind === 'message') {
          const m = D._msgs.find(x => x.id === session.context.id);
          if (m) { openMessage(m); return; }
        } else if (session.context.kind === 'contact') {
          const c = D.getP(session.context.id);
          if (c) { openContact(session.context.id); return; }
        } else if (session.context.kind === 'meeting') {
          const m = D._meetings.find(x => x.id === session.context.id);
          if (m) { openMeeting(m); return; }
        } else if (session.context.kind === 'file') {
          const f = D._files.find(f => f.id === session.context.id);
          if (f) { openFile(f); return; }
        }
        showToast('Context no longer available');
      });
      header.appendChild(ctxLink);
    }
    col.appendChild(header);

    const body = el('div', 'agent-conversation-body');
    if (session && session.messages.length) {
      session.messages.forEach(m => body.appendChild(renderAgentMessage(m, session)));
    } else {
      body.appendChild(el('div', 'agent-empty-messages', 'Start a conversation with SendPalm Agent.'));
    }
    col.appendChild(body);

    const inputWrap = el('div', 'agent-workspace-input-wrap');
    const input = el('input', 'agent-workspace-input');
    input.placeholder = 'Ask SendPalm...';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        runAgentAction(input.value.trim());
        input.value = '';
      }
    });
    inputWrap.appendChild(input);
    col.appendChild(inputWrap);

    return col;
  }

  function renderAgentRightPanel() {
    const col = el('div', 'agent-workspace-col agent-right-col');

    const header = el('div', 'agent-col-header');
    header.appendChild(el('div', '', 'Tasks & Memory'));
    const newTaskBtn = el('button', 'btn btn-primary btn-xs');
    newTaskBtn.appendChild(icon('ph-plus'));
    newTaskBtn.appendChild(el('span', '', 'New task'));
    newTaskBtn.addEventListener('click', () => openTaskModal());
    header.appendChild(newTaskBtn);
    col.appendChild(header);

    const body = el('div', 'agent-right-body');

    // In Progress
    const inProgress = (D.agentTasks || []).filter(t => t.status === 'go');
    if (inProgress.length) {
      body.appendChild(el('div', 'agent-right-section-title', 'In Progress'));
      inProgress.forEach(t => {
        const doneSteps = t.steps.filter(s => s.d).length;
        const totalSteps = t.steps.length;
        const card = el('div', 'agent-task-card');
        const info = el('div', 'agent-task-card-info');
        info.appendChild(el('div', 'agent-task-card-name', t.name));
        const progress = el('div', 'agent-task-card-progress', doneSteps + '/' + totalSteps + ' done');
        progress.title = t.steps.map(s => (s.d ? '✓ ' : '○ ') + s.l).join('\n');
        info.appendChild(progress);
        card.appendChild(info);
        const right = el('div', 'agent-task-card-right');
        if (t.eta) right.appendChild(el('div', 'agent-task-card-eta', t.eta));
        const status = el('span', 'agent-task-card-status agent-task-card-status--' + (t.status === 'go' ? 'go' : 'wt'), t.status === 'go' ? 'Running' : 'Waiting');
        right.appendChild(status);
        card.appendChild(right);
        card.addEventListener('click', () => {
          if (t.sessionId) { switchAgentSession(t.sessionId); renderMain(); }
        });
        body.appendChild(card);
      });
    }

    // Drafts
    const drafts = D.agentDrafts || [];
    if (drafts.length) {
      body.appendChild(el('div', 'agent-right-section-title', 'Drafts (' + drafts.length + ')'));
      drafts.slice(0, 5).forEach(d => {
        const card = el('div', 'agent-draft-card');
        card.appendChild(el('div', 'agent-draft-card-to', d.to));
        card.appendChild(el('div', 'agent-draft-card-preview', d.preview));
        const actions = el('div', 'agent-draft-card-actions');
        const edit = el('button', 'agent-draft-card-action', 'Edit');
        edit.addEventListener('click', (e) => { e.stopPropagation(); editAgentDraft(d); });
        const manual = el('button', 'agent-draft-card-action', 'Edit manually');
        manual.addEventListener('click', (e) => { e.stopPropagation(); editAgentDraftManually(d); });
        actions.appendChild(edit);
        actions.appendChild(manual);
        card.appendChild(actions);
        body.appendChild(card);
      });
    }

    // Memory
    const memory = state.agentMemory.global;
    if (memory && Object.keys(memory).length) {
      body.appendChild(el('div', 'agent-right-section-title', 'Memory'));
      Object.entries(memory).forEach(([k, v]) => {
        const chip = el('div', 'agent-memory-chip');
        chip.appendChild(el('span', 'agent-memory-key', k));
        chip.appendChild(el('span', 'agent-memory-value', String(v)));
        body.appendChild(chip);
      });
    }

    col.appendChild(body);
    return col;
  }

  function renderAgentView() {
    const container = el('div', 'view agent-view');

    const searchBar = el('div', 'agent-search-bar');
    const searchInput = el('input', 'agent-search-input');
    searchInput.placeholder = 'Search sessions, drafts, tasks...';
    searchBar.appendChild(icon('ph-magnifying-glass'));
    searchBar.appendChild(searchInput);
    container.appendChild(searchBar);

    const resultsWrap = el('div', 'agent-search-results hidden');
    container.appendChild(resultsWrap);

    const workspace = el('div', 'agent-workspace');
    workspace.appendChild(renderAgentSessionList());
    workspace.appendChild(renderAgentConversation());
    workspace.appendChild(renderAgentRightPanel());
    container.appendChild(workspace);

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        resultsWrap.classList.add('hidden');
        workspace.classList.remove('hidden');
        return;
      }
      workspace.classList.add('hidden');
      resultsWrap.classList.remove('hidden');
      resultsWrap.innerHTML = '';
      resultsWrap.appendChild(renderAgentSearchResults(q));
    });

    return container;
  }

  function renderAgentSearchResults(q) {
    const wrap = el('div', 'agent-search-results-inner');

    const sessions = state.agentSessions.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.messages.some(m => m.text.toLowerCase().includes(q))
    );
    if (sessions.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Sessions'));
      sessions.forEach(s => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon(agentContextKindIcon(s.context.kind)));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', s.title));
        const last = s.messages[s.messages.length - 1];
        info.appendChild(el('div', 'agent-search-result-preview', last ? last.text.slice(0, 60) : ''));
        row.appendChild(info);
        row.addEventListener('click', () => {
          switchAgentSession(s.id);
          renderMain();
        });
        wrap.appendChild(row);
      });
    }

    const drafts = (D.agentDrafts || []).filter(d =>
      d.to.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q)
    );
    if (drafts.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Drafts'));
      drafts.forEach(d => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon('ph-pencil-simple'));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', d.to));
        info.appendChild(el('div', 'agent-search-result-preview', d.preview));
        row.appendChild(info);
        row.addEventListener('click', () => editAgentDraft(d));
        wrap.appendChild(row);
      });
    }

    const tasks = (D.agentTasks || []).filter(t => t.name.toLowerCase().includes(q));
    if (tasks.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Tasks'));
      tasks.forEach(t => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon('ph-check-circle'));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', t.name));
        info.appendChild(el('div', 'agent-search-result-preview', t.steps.map(s => s.l).join(' → ')));
        row.appendChild(info);
        row.addEventListener('click', () => { if (t.sessionId) { switchAgentSession(t.sessionId); renderMain(); } });
        wrap.appendChild(row);
      });
    }

    if (!sessions.length && !drafts.length && !tasks.length) {
      wrap.appendChild(el('div', 'agent-search-empty', 'No results for "' + q + '"'));
    }

    return wrap;
  }

  function filterFiles(files) {
    let result = files;
    if (state.filesFilter && state.filesFilter !== 'all') {
      result = result.filter(f => f.tp === state.filesFilter || (state.filesFilter === 'spreadsheet' && f.tp === 'sheet'));
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(f => {
        const contact = D.getP(f.pid);
        return (f.name && f.name.toLowerCase().includes(q)) ||
          (contact && contact.name.toLowerCase().includes(q));
      });
    }
    result = applyFilesAdvancedFilters(result);
    return result;
  }

  function openFile(f) {
    state.selectedFileId = f.id;
    renderMain();
    openDetailPanel(renderFilePanel(f));
  }

  function renderFilePanel(f) {
    const contact = D.getP(f.pid);
    const wrapper = el('div', 'panel-wrapper file-preview-panel');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const copyBtn = el('button', 'btn btn-secondary btn-sm', 'Copy context');
    copyBtn.addEventListener('click', () => copyFileContext(f));

    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'File'));
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    const content = el('div', 'panel-content');

    const previewHeader = el('div', 'file-preview-header');
    const iconBox = el('div', 'file-preview-icon');
    iconBox.appendChild(icon(fileIconName(f.tp)));
    const titleBox = el('div', '');
    titleBox.appendChild(el('div', 'file-preview-title', f.name));
    titleBox.appendChild(el('div', 'file-preview-subtitle', contact ? 'From ' + contact.name + ' · ' + contact.co : ''));
    previewHeader.appendChild(iconBox);
    previewHeader.appendChild(titleBox);
    content.appendChild(previewHeader);

    const meta = el('div', 'file-preview-meta');
    const rows = [
      { label: 'Type', value: fileTypeLabel(f.tp) },
      { label: 'Size', value: f.sz },
      { label: 'Date', value: f.dt },
      { label: 'Channel', value: f.ch || 'Gmail' },
      { label: 'Contact', value: contact ? contact.name + ' <' + contact.em + '>' : 'Unknown' },
    ];
    rows.forEach(r => {
      const row = el('div', 'file-preview-row');
      row.appendChild(el('span', 'file-preview-label', r.label));
      row.appendChild(el('span', 'file-preview-value', r.value));
      meta.appendChild(row);
    });
    content.appendChild(meta);

    if (f.md) {
      const extractSection = el('div', 'file-extract-section');
      const extractHeader = el('div', 'file-extract-header');
      extractHeader.appendChild(icon('ph-markdown-logo'));
      extractHeader.appendChild(el('span', '', 'Markdown extract'));
      extractSection.appendChild(extractHeader);
      const extractBody = el('pre', 'file-extract-body');
      extractBody.textContent = f.md;
      extractSection.appendChild(extractBody);
      content.appendChild(extractSection);
    }

    const actions = el('div', 'file-preview-actions');
    const openBtn = el('button', 'btn btn-primary');
    openBtn.appendChild(icon('ph-arrow-square-out'));
    openBtn.appendChild(el('span', '', 'Open'));
    const contextBtn = el('button', 'btn btn-secondary');
    contextBtn.appendChild(icon('ph-copy'));
    contextBtn.appendChild(el('span', '', 'Copy Markdown'));
    openBtn.addEventListener('click', () => showToast('Opening ' + f.name));
    contextBtn.addEventListener('click', () => copyFileContext(f));
    actions.appendChild(openBtn);
    actions.appendChild(contextBtn);
    content.appendChild(actions);

    wrapper.appendChild(content);
    return wrapper;
  }

  function copyFileContext(f) {
    const contact = D.getP(f.pid);
    let md = `# File: ${f.name}

## Metadata
- Type: ${fileTypeLabel(f.tp)}
- Size: ${f.sz}
- Date: ${f.dt}
- Channel: ${f.ch || 'Gmail'}

## Contact
${contact ? contact.name + ' (' + contact.co + ')' : 'Unknown'}

`;
    if (f.md) {
      md += `## Extract\n\n${f.md}\n\n`;
    }
    md += `## Use\nAttach this file when discussing ${contact ? contact.topics.slice(0, 2).join(' / ') : 'related topics'}.\n`;
    copyToClipboard(md, 'File context');
  }

  function renderDrafts() {
    const container = el('div', 'view drafts-view');
    const list = el('div', 'drafts-list');
    const manual = filterDrafts(D.drafts || []);
    const agent = filterDrafts((D.agentDrafts || []).map(d => ({ ...d, source: d.source || 'agent' })));

    function renderGroup(title, drafts, isManual) {
      if (!drafts.length) return;
      list.appendChild(el('div', 'drafts-group-title', title));
      drafts.forEach(d => {
        const card = el('div', 'draft-card');
        card.appendChild(el('div', 'draft-header-title', d.to));
        card.appendChild(el('div', 'draft-subject', d.subj));
        const preview = isManual ? (d.body || '').slice(0, 140) : d.preview;
        card.appendChild(el('div', 'draft-preview', preview));
        const actions = el('div', 'draft-actions');
        if (isManual) {
          const editBtn = el('button', 'btn btn-secondary btn-sm', 'Edit');
          const delBtn = el('button', 'btn btn-danger btn-sm', 'Delete');
          editBtn.addEventListener('click', () => openDraftModal(d.id));
          delBtn.addEventListener('click', () => confirmDestructive(
            `Delete draft to "${d.to || 'unsaved'}"? This cannot be undone.`,
            () => {
              const idx = D.drafts.indexOf(d);
              if (idx > -1) D.drafts.splice(idx, 1);
              renderMain();
              showToast('Draft deleted');
            }
          ));
          actions.appendChild(editBtn);
          actions.appendChild(delBtn);
        } else {
          const sendBtn = el('button', 'btn btn-primary btn-sm', 'Send');
          const editBtn = el('button', 'btn btn-secondary btn-sm', 'Edit');
          const manualBtn = el('button', 'btn btn-text btn-sm', 'Edit manually');
          sendBtn.addEventListener('click', () => sendAgentDraft(d.id));
          editBtn.addEventListener('click', () => editAgentDraft(d));
          manualBtn.addEventListener('click', () => editAgentDraftManually(d));
          actions.appendChild(sendBtn);
          actions.appendChild(editBtn);
          actions.appendChild(manualBtn);
        }
        card.appendChild(actions);
        list.appendChild(card);
      });
    }

    renderGroup('Manual drafts', manual, true);
    renderGroup('Agent drafts', agent, false);

    if (manual.length === 0 && agent.length === 0) {
      list.appendChild(renderEmpty('No drafts match your search.', 'ph-pencil-simple'));
    }
    container.appendChild(list);
    return container;
  }

  function filterDrafts(drafts) {
    if (!state.searchQuery) return drafts || [];
    const q = state.searchQuery.toLowerCase();
    return (drafts || []).filter(d => {
      const bodyText = ((d.body || '') + ' ' + (d.preview || '')).toLowerCase();
      return (d.to && d.to.toLowerCase().includes(q)) ||
        (d.subj && d.subj.toLowerCase().includes(q)) ||
        bodyText.includes(q);
    });
  }

  function toggleNotifications() {
    state.notificationsOpen = !state.notificationsOpen;
    const panel = document.getElementById('notification-panel');
    if (state.notificationsOpen) {
      renderNotifications();
      panel.classList.remove('hidden');
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }

  function renderNotifications() {
    const panel = document.getElementById('notification-panel');
    panel.innerHTML = '';

    const header = el('div', 'notification-header');
    header.appendChild(el('div', 'notification-title', 'Notifications'));
    const close = el('button', 'icon-btn');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleNotifications);
    header.appendChild(close);
    panel.appendChild(header);

    const list = el('div', 'notification-list');
    if (D.notifications.length === 0) {
      list.appendChild(renderEmpty('No notifications', 'ph-bell-slash'));
    } else {
      D.notifications.forEach((n, idx) => {
        const row = el('div', 'notification-row' + (n.read ? '' : ' unread'));
        const dot = el('div', 'notification-dot' + (n.read ? ' read' : ''));
        row.appendChild(dot);
        const body = el('div', 'notification-body');
        const text = el('div', 'notification-text');
        text.innerHTML = n.txt;
        body.appendChild(text);
        body.appendChild(el('div', 'notification-time', n.tm));
        row.appendChild(body);
        row.addEventListener('click', () => {
          n.read = true;
          renderTopBar();
          renderNotifications();
        });
        list.appendChild(row);
      });
    }
    panel.appendChild(list);
  }

  function openCompose(context) {
    state.composeOpen = true;
    state.composeMinimized = false;
    state.composeContext = context || {};
    const modal = document.getElementById('compose-modal');
    modal.innerHTML = '';
    modal.classList.remove('hidden', 'minimized');
    modal.classList.add('open');
    modal.appendChild(renderComposeWindow(context || {}));
    modal.onclick = (e) => {
      if (state.composeMinimized && !e.target.closest('button')) {
        expandCompose();
      }
    };
  }

  function openEventModal(opts) {
    opts = opts || {};
    const existing = opts.eventId ? D.events.find(e => e.id === opts.eventId) : null;
    const isNew = !existing;
    const eventId = existing ? existing.id : 'e' + Date.now();
    const slot = opts.slot || null;

    const colors = ['mint', 'sky', 'peach', 'canary', 'lavender', 'rose'];
    const contacts = (D.contacts || []).map(c => ({ id: c.id, name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed' }));
    const tasks = D.tasks || [];

    // Mutable form state (no DOM mutation until save).
    const values = {
      title: '',
      location: '',
      video: '',
      allDay: false,
      date: dateKey(state.calendarSelected),
      start: '10:00',
      end: '11:00',
      people: [],
      color: 'mint',
      reminder: 'none',
      description: '',
      linkedTask: null,
    };

    if (existing) {
      values.title = existing.title || '';
      values.location = existing.location || '';
      values.video = existing.video || '';
      values.allDay = !!existing.allDay;
      values.date = existing.date || (existing.dt ? dateKey(parseMeetingDate(existing.dt)) : dateKey(state.calendarSelected));
      const t = parseMeetingTime(existing);
      if (t) {
        values.start = formatMinutes(t.start);
        values.end = formatMinutes(t.end);
      }
      values.people = Array.isArray(existing.pids) ? existing.pids.slice() : [];
      values.color = existing.color || 'mint';
      values.reminder = existing.reminder || 'none';
      values.description = existing.description || existing.notes || '';
      values.linkedTask = existing.linkedTask || null;
    } else if (slot) {
      values.date = dateKey(state.calendarSelected);
      values.start = formatMinutes(slot.start);
      values.end = formatMinutes(slot.end);
    }

    let bodyEl;

    function renderBody(body) {
      bodyEl = body;
      body.innerHTML = '';
      const stack = el('div', 'form-stack');

      const titleInput = elAttr('input', '', { type: 'text', value: values.title, placeholder: '和谁、做什么…' });
      titleInput.addEventListener('input', () => values.title = titleInput.value);
      stack.appendChild(renderFormGroup('Title', titleInput));

      const locInput = elAttr('input', '', { type: 'text', value: values.location, placeholder: '会议室或地址' });
      locInput.addEventListener('input', () => values.location = locInput.value);
      stack.appendChild(renderFormGroup('Location', locInput));

      const vidInput = elAttr('input', '', { type: 'url', value: values.video, placeholder: 'https://meet.example.com/…' });
      vidInput.addEventListener('input', () => values.video = vidInput.value);
      stack.appendChild(renderFormGroup('Video link', vidInput));

      const allDayToggle = renderToggle('All day', values.allDay, (checked) => {
        values.allDay = checked;
        timeRow.style.display = checked ? 'none' : 'flex';
      });
      stack.appendChild(renderFormGroup('', allDayToggle));

      const dateInput = elAttr('input', '', { type: 'date', value: values.date });
      dateInput.addEventListener('input', () => values.date = dateInput.value);
      stack.appendChild(renderFormGroup('Date', dateInput));

      const timeRow = el('div', 'form-row');
      const startInput = elAttr('input', '', { type: 'time', value: values.start });
      startInput.addEventListener('input', () => values.start = startInput.value);
      const endInput = elAttr('input', '', { type: 'time', value: values.end });
      endInput.addEventListener('input', () => values.end = endInput.value);
      timeRow.appendChild(renderFormGroup('Start', startInput));
      timeRow.appendChild(renderFormGroup('End', endInput));
      timeRow.style.display = values.allDay ? 'none' : 'flex';
      stack.appendChild(timeRow);

      const peoplePills = renderPillInput(values.people, contacts, (vals) => values.people = vals);
      stack.appendChild(renderFormGroup('People', peoplePills));

      const colorWrap = el('div', 'event-modal-colors');
      colors.forEach(c => {
        const dot = el('button', 'event-modal-color event-modal-color-' + c + (values.color === c ? ' active' : ''));
        dot.type = 'button';
        dot.addEventListener('click', () => {
          values.color = c;
          colorWrap.querySelectorAll('.event-modal-color').forEach(d => d.classList.remove('active'));
          dot.classList.add('active');
        });
        colorWrap.appendChild(dot);
      });
      stack.appendChild(renderFormGroup('Color', colorWrap));

      const reminderSel = el('select', '');
      [
        { id: 'none', name: 'None' },
        { id: '5min', name: '5 minutes before' },
        { id: '15min', name: '15 minutes before' },
        { id: '30min', name: '30 minutes before' },
        { id: '1h', name: '1 hour before' },
        { id: '1d', name: '1 day before' },
      ].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (values.reminder === r.id) opt.selected = true;
        reminderSel.appendChild(opt);
      });
      reminderSel.addEventListener('change', () => values.reminder = reminderSel.value);
      stack.appendChild(renderFormGroup('Reminder', reminderSel));

      const descInput = el('textarea', '');
      descInput.value = values.description;
      descInput.placeholder = '议题、链接、上下文…';
      descInput.addEventListener('input', () => values.description = descInput.value);
      stack.appendChild(renderFormGroup('Description', descInput));

      const taskSel = el('select', '');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = 'None';
      taskSel.appendChild(noneOpt);
      tasks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title || 'Untitled task';
        if (values.linkedTask === t.id) opt.selected = true;
        taskSel.appendChild(opt);
      });
      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = '+ Create new task';
      taskSel.appendChild(newOpt);
      taskSel.addEventListener('change', () => {
        if (taskSel.value === '__new__') {
          openTaskModal(null, { relatedType: 'event', relatedId: eventId, onSave: (newTask) => {
            values.linkedTask = newTask.id;
            renderBody(body);
          }});
          // Reset the selector until a task is actually saved.
          taskSel.value = values.linkedTask || '';
        } else {
          values.linkedTask = taskSel.value || null;
        }
      });
      stack.appendChild(renderFormGroup('Linked task', taskSel));

      body.appendChild(stack);
      setTimeout(() => titleInput.focus(), 50);
    }

    openModalCard({
      title: isNew ? 'New event' : 'Edit event',
      renderBody,
      renderActions: (actions) => {
        if (!isNew) {
          const del = el('button', 'btn btn-danger', 'Delete');
          del.addEventListener('click', () => confirmDestructive(
            `Delete “${values.title || 'this event'}”? This cannot be undone.`,
            () => {
              const idx = D.events.indexOf(existing);
              if (idx > -1) D.events.splice(idx, 1);
              (D.tasks || []).forEach(t => { if (t.relatedType === 'event' && t.relatedId === existing.id) { t.relatedType = 'none'; t.relatedId = null; t.linkedEvent = null; } });
              if (state.selectedMeetingId === existing.id) state.selectedMeetingId = null;
              closeCompose();
              renderMain();
              showToast('Event deleted');
            }
          ));
          actions.appendChild(del);
        } else {
          actions.appendChild(el('span', ''));
        }

        const cancel = el('button', 'btn btn-secondary', 'Cancel');
        cancel.addEventListener('click', closeCompose);
        actions.appendChild(cancel);

        const save = el('button', 'btn btn-primary', 'Save');
        save.addEventListener('click', () => {
          if (!values.title.trim()) {
            showToast('给事件起个名字吧');
            return;
          }

          const [y, m, d] = values.date.split('-').map(n => parseInt(n, 10));
          const dtLabel = `${m}/${d}`;
          const timeLabel = values.allDay ? '00:00-23:59' : `${values.start}-${values.end}`;
          const selectedPeople = contacts.filter(c => values.people.includes(c.id));
          const pplLabel = selectedPeople.map(c => c.name).join('、') || '—';

          const payload = {
            id: eventId,
            title: values.title.trim(),
            location: values.location.trim(),
            video: values.video.trim(),
            allDay: values.allDay,
            date: values.date,
            dt: dtLabel,
            start: values.allDay ? '00:00' : values.start,
            end: values.allDay ? '23:59' : values.end,
            tm: timeLabel,
            pids: values.people.slice(),
            ppl: pplLabel,
            color: values.color,
            reminder: values.reminder,
            description: values.description,
            notes: values.description,
            linkedTask: values.linkedTask,
            br: isNew ? false : (existing.br || false),
            prep: isNew ? [] : (existing.prep || []),
            post: isNew ? '' : (existing.post || ''),
          };

          if (isNew) {
            D.events.push(payload);
          } else {
            Object.assign(existing, payload);
          }

          closeCompose();
          renderMain();
          showToast(isNew ? 'Event created' : 'Event saved');
        });
        actions.appendChild(save);
      }
    });
  }

  function closeEventModal() {
    closeCompose();
  }

  function openTaskModal(taskId, defaults) {
    defaults = defaults || {};
    const isNew = !taskId;
    const existing = isNew ? null : D.tasks.find(t => t.id === taskId);
    const task = isNew ? {
      id: 't' + Date.now(),
      title: '',
      relatedType: defaults.relatedType || 'none',
      relatedId: defaults.relatedId || null,
      dueDate: defaults.dueDate || '',
      dueTime: defaults.dueTime || '',
      priority: 'medium',
      status: 'todo',
      recurrence: 'none',
      description: ''
    } : existing;
    if (!task) return;

    // Backward-compatible migration: mirror legacy link fields into the new relatedType/relatedId shape.
    if (!task.relatedType && task.linkedEvent) { task.relatedType = 'event'; task.relatedId = task.linkedEvent; }
    if (!task.relatedType && task.linkedContact) { task.relatedType = 'contact'; task.relatedId = task.linkedContact; }

    const values = {
      title: task.title || '',
      relatedType: task.relatedType || 'none',
      relatedId: task.relatedId || null,
      dueDate: task.dueDate || '',
      dueTime: task.dueTime || '',
      priority: task.priority || 'medium',
      status: task.status || 'todo',
      recurrence: task.recurrence || 'none',
      description: task.description || ''
    };

    let typeSel, entitySel;

    function entityOptionsFor(type) {
      if (type === 'contact') {
        return (D.contacts || []).map(c => ({ id: c.id, name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed' }));
      }
      if (type === 'event') {
        return (D.events || []).map(e => ({ id: e.id, name: (e.title || 'Untitled') + (e.dt ? ' · ' + e.dt : '') }));
      }
      if (type === 'message') {
        return (D._msgs || []).map((m, idx) => {
          const c = getContact(m.pid);
          return { id: m.id || ('msg-' + idx), name: (c ? c.name : 'Unknown') + ' · ' + (m.subj || 'No subject') };
        });
      }
      return [];
    }

    function renderEntitySelect() {
      entitySel.innerHTML = '';
      const opts = entityOptionsFor(values.relatedType);
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = values.relatedType === 'none' ? '—' : 'Select…';
      entitySel.appendChild(noneOpt);
      opts.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name;
        if (values.relatedId === o.id) opt.selected = true;
        entitySel.appendChild(opt);
      });
      entitySel.disabled = values.relatedType === 'none';
      entitySel.value = values.relatedId || '';
    }

    function renderBody(body) {
      body.innerHTML = '';
      const stack = el('div', 'form-stack');

      const titleInput = elAttr('input', '', { type: 'text', value: values.title, placeholder: 'Task title' });
      titleInput.addEventListener('input', () => values.title = titleInput.value);
      stack.appendChild(renderFormGroup('Title', titleInput));

      const relationRow = el('div', 'form-row');
      typeSel = el('select', '');
      [
        { id: 'none', name: 'None' },
        { id: 'contact', name: 'Contact' },
        { id: 'event', name: 'Meeting' },
        { id: 'message', name: 'Message' },
      ].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name;
        if (values.relatedType === o.id) opt.selected = true;
        typeSel.appendChild(opt);
      });
      typeSel.addEventListener('change', () => {
        values.relatedType = typeSel.value;
        values.relatedId = null;
        renderEntitySelect();
      });
      relationRow.appendChild(renderFormGroup('Related to', typeSel));

      entitySel = el('select', '');
      entitySel.addEventListener('change', () => values.relatedId = entitySel.value || null);
      relationRow.appendChild(renderFormGroup('Entity', entitySel));
      renderEntitySelect();
      stack.appendChild(relationRow);

      const dateRow = el('div', 'form-row');
      const dateInput = elAttr('input', '', { type: 'date', value: values.dueDate });
      dateInput.addEventListener('input', () => values.dueDate = dateInput.value);
      dateRow.appendChild(renderFormGroup('Due date', dateInput));

      const timeInput = elAttr('input', '', { type: 'time', value: values.dueTime });
      timeInput.addEventListener('input', () => values.dueTime = timeInput.value);
      dateRow.appendChild(renderFormGroup('Due time', timeInput));
      stack.appendChild(dateRow);

      const metaRow = el('div', 'form-row');
      const prioritySel = el('select', '');
      ['low', 'medium', 'high'].forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        if (values.priority === p) opt.selected = true;
        prioritySel.appendChild(opt);
      });
      prioritySel.addEventListener('change', () => values.priority = prioritySel.value);
      metaRow.appendChild(renderFormGroup('Priority', prioritySel));

      const statusSel = el('select', '');
      const statusLabels = {
        todo: 'To do',
        'in-progress': 'In progress',
        waiting: 'Waiting',
        done: 'Done'
      };
      ['todo', 'in-progress', 'waiting', 'done'].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = statusLabels[s];
        if (values.status === s) opt.selected = true;
        statusSel.appendChild(opt);
      });
      statusSel.addEventListener('change', () => values.status = statusSel.value);
      metaRow.appendChild(renderFormGroup('Status', statusSel));

      const recurrenceSel = el('select', '');
      ['none', 'daily', 'weekly', 'monthly'].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r === 'none' ? 'None' : r.charAt(0).toUpperCase() + r.slice(1);
        if (values.recurrence === r) opt.selected = true;
        recurrenceSel.appendChild(opt);
      });
      recurrenceSel.addEventListener('change', () => values.recurrence = recurrenceSel.value);
      metaRow.appendChild(renderFormGroup('Recurrence', recurrenceSel));
      stack.appendChild(metaRow);

      const descInput = el('textarea', '');
      descInput.value = values.description;
      descInput.placeholder = 'Notes, links, context…';
      descInput.addEventListener('input', () => values.description = descInput.value);
      stack.appendChild(renderFormGroup('Description', descInput));

      body.appendChild(stack);
      setTimeout(() => titleInput.focus(), 50);
    }

    openModalCard({
      title: isNew ? 'New task' : 'Edit task',
      renderBody,
      renderActions: (actions) => {
        if (!isNew) {
          const del = el('button', 'btn btn-danger', 'Delete');
          del.addEventListener('click', () => confirmDestructive(
            `Delete "${values.title || 'this task'}"? This cannot be undone.`,
            () => {
              const idx = D.tasks.indexOf(task);
              if (idx > -1) D.tasks.splice(idx, 1);
              D.events.forEach(e => { if (e.linkedTask === task.id) e.linkedTask = null; });
              closeCompose();
              renderMain();
              showToast('Task deleted');
            }
          ));
          actions.appendChild(del);
        } else {
          actions.appendChild(el('span', ''));
        }

        const cancel = el('button', 'btn btn-secondary', 'Cancel');
        cancel.addEventListener('click', closeCompose);
        actions.appendChild(cancel);

        const save = el('button', 'btn-primary', 'Save');
        save.addEventListener('click', () => {
          if (!values.title.trim()) {
            showToast('给任务起个名字吧');
            return;
          }

          task.title = values.title.trim();
          task.relatedType = values.relatedType;
          task.relatedId = values.relatedId;
          task.dueDate = values.dueDate;
          task.dueTime = values.dueTime;
          task.priority = values.priority;
          task.status = values.status;
          task.recurrence = values.recurrence;
          task.description = values.description;

          // Keep legacy link fields in sync so older views keep working.
          task.linkedEvent = task.relatedType === 'event' ? task.relatedId : null;
          task.linkedContact = task.relatedType === 'contact' ? task.relatedId : null;

          if (isNew) D.tasks.unshift(task);
          closeCompose();
          renderMain();
          showToast(isNew ? 'Task created' : 'Task saved');
          if (defaults.onSave) defaults.onSave(task);
        });
        actions.appendChild(save);
      }
    });
  }

  function closeCompose() {
    state.composeOpen = false;
    state.composeMinimized = false;
    state.composeContext = null;
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('open', 'minimized');
    setTimeout(() => modal.classList.add('hidden'), 250);
  }

  function minimizeCompose() {
    state.composeMinimized = true;
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('open');
    modal.classList.add('minimized');
  }

  function expandCompose() {
    state.composeMinimized = false;
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('minimized');
    modal.classList.add('open');
  }

  function openDraftModal(draftId) {
    const isNew = !draftId;
    const existing = isNew ? null : D.drafts.find(d => d.id === draftId);
    const draft = isNew ? {
      id: 'md-' + Date.now(),
      from: 'gmail-w',
      to: '',
      cc: '',
      bcc: '',
      subj: '',
      body: '',
      at: [],
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedSession: null,
      linkedTask: null
    } : existing;
    if (!draft) return;

    const values = {
      from: draft.from || 'gmail-w',
      to: draft.to || '',
      cc: draft.cc || '',
      bcc: draft.bcc || '',
      subj: draft.subj || '',
      body: draft.body || '',
      at: (draft.at || []).slice(),
      linkedSession: draft.linkedSession || null,
      linkedTask: draft.linkedTask || null
    };

    let bodyEl, toField, ccField, bccField, subjInput, bodyInput;

    function renderAttachmentRow(name, idx, list, container) {
      const row = el('div', 'dynamic-field-row');
      const span = el('span', '', name);
      const remove = el('button', 'btn-icon', '×');
      remove.addEventListener('click', () => { list.splice(idx, 1); renderBody(); });
      row.appendChild(span); row.appendChild(remove);
      container.appendChild(row);
    }

    function renderBody() {
      bodyEl.innerHTML = '';
      const stack = el('div', 'form-stack');

      const fromSelect = el('select', '');
      accounts.filter(a => a.type === 'email').forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.email + ' (' + a.label + ')';
        if (values.from === a.id) opt.selected = true;
        fromSelect.appendChild(opt);
      });
      fromSelect.addEventListener('change', () => values.from = fromSelect.value);
      stack.appendChild(renderFormGroup('From', fromSelect));

      toField = createRecipientField(values.to, 'Recipient');
      toField.hidden.addEventListener('input', () => values.to = toField.hidden.value);
      stack.appendChild(renderFormGroup('To', toField.wrap));

      const metaRow = el('div', 'form-row');
      ccField = createRecipientField(values.cc, 'Cc');
      ccField.hidden.addEventListener('input', () => values.cc = ccField.hidden.value);
      metaRow.appendChild(renderFormGroup('Cc', ccField.wrap));
      bccField = createRecipientField(values.bcc, 'Bcc');
      bccField.hidden.addEventListener('input', () => values.bcc = bccField.hidden.value);
      metaRow.appendChild(renderFormGroup('Bcc', bccField.wrap));
      stack.appendChild(metaRow);

      subjInput = elAttr('input', '', { type: 'text', value: values.subj, placeholder: 'Subject' });
      subjInput.addEventListener('input', () => values.subj = subjInput.value);
      stack.appendChild(renderFormGroup('Subject', subjInput));

      const toolbar = el('div', 'compose-toolbar');
      const groups = [
        ['ph-text-b', 'ph-text-italic', 'ph-text-underline'],
        ['ph-list-bullets', 'ph-list-numbers'],
        ['ph-link', 'ph-image'],
        ['ph-text-align-left']
      ];
      groups.forEach(g => {
        const gEl = el('div', 'compose-toolbar-group');
        g.forEach(ic => {
          const btn = el('button', 'icon-btn');
          btn.appendChild(icon(ic));
          btn.addEventListener('click', () => showToast(ic.replace('ph-', '') + ' clicked'));
          gEl.appendChild(btn);
        });
        toolbar.appendChild(gEl);
      });
      stack.appendChild(toolbar);

      bodyInput = el('textarea', '');
      bodyInput.placeholder = 'Write your draft...';
      bodyInput.value = values.body;
      bodyInput.addEventListener('input', () => values.body = bodyInput.value);
      stack.appendChild(renderFormGroup('Body', bodyInput));

      const atGroup = el('div', 'form-group');
      atGroup.appendChild(el('label', 'form-label', 'Attachments'));
      const atList = el('div', 'dynamic-list');
      values.at.forEach((name, i) => renderAttachmentRow(name, i, values.at, atList));
      const addAt = el('button', 'btn-text', '+ Add attachment');
      addAt.addEventListener('click', () => {
        const name = prompt('Attachment name');
        if (name && name.trim()) { values.at.push(name.trim()); renderBody(); }
      });
      atGroup.appendChild(atList); atGroup.appendChild(addAt);
      stack.appendChild(atGroup);

      const sessions = state.agentSessions || [];
      const tasks = D.tasks || [];
      const linkRow = el('div', 'form-row');
      const sessionSel = el('select', '');
      const noneSession = document.createElement('option');
      noneSession.value = ''; noneSession.textContent = 'None';
      sessionSel.appendChild(noneSession);
      sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.title || 'Untitled session';
        if (values.linkedSession === s.id) opt.selected = true;
        sessionSel.appendChild(opt);
      });
      sessionSel.addEventListener('change', () => values.linkedSession = sessionSel.value || null);
      linkRow.appendChild(renderFormGroup('Linked session', sessionSel));

      const taskSel = el('select', '');
      const noneTask = document.createElement('option');
      noneTask.value = ''; noneTask.textContent = 'None';
      taskSel.appendChild(noneTask);
      tasks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title || 'Untitled task';
        if (values.linkedTask === t.id) opt.selected = true;
        taskSel.appendChild(opt);
      });
      taskSel.addEventListener('change', () => values.linkedTask = taskSel.value || null);
      linkRow.appendChild(renderFormGroup('Linked task', taskSel));
      stack.appendChild(linkRow);

      bodyEl.appendChild(stack);
      setTimeout(() => (values.subj ? bodyInput : subjInput).focus(), 50);
    }

    openModalCard({
      title: isNew ? 'New draft' : 'Edit draft',
      renderBody: (b) => { bodyEl = b; renderBody(); },
      renderActions: (actions) => {
        if (!isNew) {
          const del = el('button', 'btn btn-danger', 'Delete');
          del.addEventListener('click', () => confirmDestructive(
            `Delete draft to "${values.to || 'unsaved'}"? This cannot be undone.`,
            () => {
              const idx = D.drafts.indexOf(draft);
              if (idx > -1) D.drafts.splice(idx, 1);
              closeCompose();
              renderMain();
              showToast('Draft deleted');
            }
          ));
          actions.appendChild(del);
        } else {
          actions.appendChild(el('span', ''));
        }
        const cancel = el('button', 'btn btn-secondary', 'Cancel');
        cancel.addEventListener('click', closeCompose);
        actions.appendChild(cancel);
        const save = el('button', 'btn btn-primary', 'Save');
        save.addEventListener('click', () => {
          draft.from = values.from;
          draft.to = values.to;
          draft.cc = values.cc;
          draft.bcc = values.bcc;
          draft.subj = values.subj;
          draft.body = values.body;
          draft.at = values.at;
          draft.linkedSession = values.linkedSession;
          draft.linkedTask = values.linkedTask;
          draft.updatedAt = Date.now();
          if (isNew) {
            draft.createdAt = Date.now();
            draft.source = 'manual';
            D.drafts.unshift(draft);
          }
          closeCompose();
          renderMain();
          showToast(isNew ? 'Draft created' : 'Draft saved');
        });
        actions.appendChild(save);
      }
    });
  }

  function findContactByNameOrEmail(query) {
    if (!query) return null;
    const q = query.toLowerCase();
    return D.contacts.find(c =>
      c.name.toLowerCase() === q ||
      c.em.toLowerCase() === q ||
      c.name.toLowerCase().includes(q)
    );
  }

  function sendMessage(payload) {
    const { to, cc, bcc, subject, body, mode, originalMsg } = payload;
    if (!to.trim()) {
      showToast('Please enter a recipient');
      return false;
    }

    const contact = findContactByNameOrEmail(to);
    const pid = contact ? contact.id : 'unknown';
    const now = new Date();
    const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    // ChatGPT-style auto-title: when subject is empty in new-mode but body
    // has content, let the assistant extract a thread title from the body.
    let finalSubject = subject;
    let autoTitled = false;
    if (!finalSubject && mode === 'new' && body.trim()) {
      const generated = generateConversationTitle(body);
      if (generated) {
        finalSubject = generated;
        autoTitled = true;
      }
    }

    const newMsg = {
      pid: pid,
      accountId: 'gmail-w',
      ic: '',
      fm: '你',
      tag: '邮件',
      subj: finalSubject || (mode === 'reply' ? 'Re: ' + (originalMsg ? originalMsg.subj : '') : ''),
      prev: body.trim() || (mode === 'reply' ? '已回复' : '已发送'),
      tm: timeStr,
      st: now.toISOString(),
      ch: 'Gmail',
      at: [],
      fl: '',
      ctx: { topic: '', people: [] }
    };

    D._msgs.unshift(newMsg);

    if (mode === 'reply' && originalMsg) {
      originalMsg.fl = 'done';
    }

    const label = mode === 'reply' ? 'Reply sent' : mode === 'forward' ? 'Message forwarded' : 'Message sent';
    if (autoTitled) {
      showToast(label + ' · Auto-titled: "' + finalSubject + '"');
    } else {
      showToast(label);
    }
    renderMain();
    return true;
  }

  function createRecipientField(initialValue, placeholder) {
    const wrap = el('div', 'compose-recipient-pills');
    const hidden = el('input', 'compose-recipient-hidden');
    hidden.type = 'hidden';
    const input = el('input', 'compose-recipient-input');
    input.placeholder = placeholder || 'Recipient';
    const recipients = [];

    function updateHidden() {
      hidden.value = recipients.join(', ');
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function removePill(value) {
      const idx = recipients.indexOf(value);
      if (idx >= 0) recipients.splice(idx, 1);
      const pills = wrap.querySelectorAll('.compose-recipient-pill');
      pills.forEach(p => { if (p.dataset.value === value) wrap.removeChild(p); });
      updateHidden();
    }

    function addRecipient(name) {
      const value = name.trim();
      if (!value || recipients.includes(value)) return;
      recipients.push(value);
      const pill = el('div', 'compose-recipient-pill');
      pill.dataset.value = value;
      pill.appendChild(el('span', '', value));
      const remove = el('button');
      remove.appendChild(icon('ph-x'));
      remove.addEventListener('click', (e) => { e.preventDefault(); removePill(value); input.focus(); });
      pill.appendChild(remove);
      wrap.insertBefore(pill, input);
      updateHidden();
    }

    input.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && input.value.trim()) {
        e.preventDefault();
        addRecipient(input.value);
        input.value = '';
      } else if (e.key === 'Backspace' && input.value === '' && recipients.length) {
        const last = recipients[recipients.length - 1];
        removePill(last);
      }
    });

    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        addRecipient(input.value);
        input.value = '';
      }
    });

    wrap.appendChild(input);
    wrap.appendChild(hidden);

    if (initialValue) {
      initialValue.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(addRecipient);
    }

    return { wrap, hidden, addRecipient };
  }

  function renderComposeWindow(context) {
    const mode = context.mode || 'new';
    const title = mode === 'reply' ? 'Reply' : mode === 'forward' ? 'Forward' : 'New message';

    const win = el('div', 'compose-window');

    const header = el('div', 'compose-header');
    header.appendChild(el('div', 'compose-title', title));
    const headerActions = el('div', 'compose-header-actions');

    const minBtn = el('button', 'icon-btn');
    minBtn.appendChild(icon('ph-minus'));
    minBtn.title = 'Minimize';
    minBtn.addEventListener('click', minimizeCompose);

    const expandBtn = el('button', 'icon-btn');
    expandBtn.appendChild(icon('ph-corners-out'));
    expandBtn.title = 'Full screen';
    expandBtn.addEventListener('click', () => showToast('Full screen mode'));

    const discardBtn = el('button', 'icon-btn');
    discardBtn.appendChild(icon('ph-x'));
    discardBtn.title = 'Discard';
    discardBtn.addEventListener('click', closeCompose);

    headerActions.appendChild(minBtn);
    headerActions.appendChild(expandBtn);
    headerActions.appendChild(discardBtn);
    header.appendChild(headerActions);
    win.appendChild(header);

    const fields = el('div', 'compose-fields');

    // Create the body textarea early so auto-title listeners can attach
    // before the element is appended to the DOM.
    const bodyInput = el('textarea');
    bodyInput.placeholder = mode === 'reply' ? 'Write your reply...' : 'Write your message...';
    bodyInput.value = context.body || '';

    // From row
    const fromRow = el('div', 'compose-row');
    fromRow.appendChild(el('label', '', 'From'));
    const fromWrap = el('div', 'compose-from');
    const fromSelect = el('select', 'compose-from-select');
    accounts.filter(a => a.type === 'email').forEach(a => {
      const opt = el('option', '', a.email + ' (' + a.label + ')');
      opt.value = a.id;
      fromSelect.appendChild(opt);
    });
    fromWrap.appendChild(fromSelect);
    fromRow.appendChild(fromWrap);
    fields.appendChild(fromRow);

    // To row
    const toRow = el('div', 'compose-row');
    toRow.appendChild(el('label', '', 'To'));
    const recipientField = createRecipientField(context.to || '', 'Recipient');
    const toInput = recipientField.hidden;
    toRow.appendChild(recipientField.wrap);

    const ccToggle = el('span', 'compose-cc-toggle', 'Cc');
    const bccToggle = el('span', 'compose-cc-toggle', 'Bcc');
    toRow.appendChild(ccToggle);
    toRow.appendChild(bccToggle);
    fields.appendChild(toRow);

    // Cc row (hidden by default)
    const ccRow = el('div', 'compose-row');
    ccRow.style.display = 'none';
    ccRow.appendChild(el('label', '', 'Cc'));
    const ccInput = el('input');
    ccInput.placeholder = 'Cc';
    ccRow.appendChild(ccInput);
    fields.appendChild(ccRow);

    // Bcc row (hidden by default)
    const bccRow = el('div', 'compose-row');
    bccRow.style.display = 'none';
    bccRow.appendChild(el('label', '', 'Bcc'));
    const bccInput = el('input');
    bccInput.placeholder = 'Bcc';
    bccRow.appendChild(bccInput);
    fields.appendChild(bccRow);

    ccToggle.addEventListener('click', () => {
      ccRow.style.display = ccRow.style.display === 'none' ? 'flex' : 'none';
    });
    bccToggle.addEventListener('click', () => {
      bccRow.style.display = bccRow.style.display === 'none' ? 'flex' : 'none';
    });

    // Subject row (with ChatGPT-style auto-title suggestion preview)
    const subjRow = el('div', 'compose-row');
    subjRow.appendChild(el('label', '', 'Subject'));
    const subjInput = el('input');
    subjInput.placeholder = mode === 'new' ? 'Subject · auto-generated from content' : 'Subject';
    subjInput.value = context.subject || '';
    subjRow.appendChild(subjInput);
    fields.appendChild(subjRow);

    // Live auto-title preview — only in new-mode while the subject is empty.
    const autoTitleHint = el('div', 'compose-auto-title');
    // These are referenced by updateAutoTitle, so they must be in function scope.
    let autoTitleText = null;
    let applyBtn = null;
    if (mode === 'new') {
      autoTitleHint.appendChild(icon('ph-sparkle'));
      autoTitleHint.appendChild(el('span', 'compose-auto-title-label', 'Auto-title'));
      autoTitleText = el('span', 'compose-auto-title-text', '');
      autoTitleHint.appendChild(autoTitleText);
      applyBtn = el('button', 'compose-auto-title-apply', 'Use');
      autoTitleHint.appendChild(applyBtn);
      fields.appendChild(autoTitleHint);
      updateAutoTitle();

      subjInput.addEventListener('input', updateAutoTitle);
      bodyInput.addEventListener('input', updateAutoTitle);
      applyBtn.addEventListener('click', () => {
        if (autoTitleText.textContent && autoTitleText.textContent !== 'Will be generated from your message…') {
          subjInput.value = autoTitleText.textContent;
          subjInput.dispatchEvent(new Event('input'));
        }
      });
    }

    function updateAutoTitle() {
      if (!autoTitleHint || !autoTitleText || !applyBtn) return;
      if (subjInput.value.trim()) {
        autoTitleHint.classList.add('dismissed');
        return;
      }
      autoTitleHint.classList.remove('dismissed');
      const hint = bodyInput.value.trim()
        ? generateConversationTitle(bodyInput.value)
        : 'Will be generated from your message…';
      autoTitleText.textContent = hint;
      applyBtn.style.display = bodyInput.value.trim() ? '' : 'none';
    }

    win.appendChild(fields);

    // Toolbar
    const toolbar = el('div', 'compose-toolbar');
    const groups = [
      ['ph-text-b', 'ph-text-italic', 'ph-text-underline'],
      ['ph-list-bullets', 'ph-list-numbers'],
      ['ph-link', 'ph-image'],
      ['ph-text-align-left']
    ];
    groups.forEach(g => {
      const gEl = el('div', 'compose-toolbar-group');
      g.forEach(ic => {
        const btn = el('button', 'icon-btn');
        btn.appendChild(icon(ic));
        btn.addEventListener('click', () => showToast(ic.replace('ph-', '') + ' clicked'));
        gEl.appendChild(btn);
      });
      toolbar.appendChild(gEl);
    });
    win.appendChild(toolbar);

    // Body
    const bodyRow = el('div', 'compose-body');
    bodyRow.appendChild(bodyInput);

    if (context.quote) {
      const quote = el('div', 'compose-quote');
      const quoteHeader = el('div', 'compose-quote-header', context.quoteHeader || 'On ' + new Date().toLocaleString() + ', wrote:');
      quote.appendChild(quoteHeader);
      quote.appendChild(el('div', '', context.quote));
      bodyRow.appendChild(quote);
    }

    win.appendChild(bodyRow);

    // Footer
    const footer = el('div', 'compose-footer');
    const leftActions = el('div', 'compose-actions');

    const attachBtn = el('button', 'icon-btn');
    attachBtn.appendChild(icon('ph-paperclip'));
    attachBtn.title = 'Attach file';
    attachBtn.addEventListener('click', () => showToast('Attach file clicked'));

    const aiBtn = el('button', 'icon-btn');
    aiBtn.appendChild(icon('ph-sparkle'));
    aiBtn.title = 'Ask Agent';
    aiBtn.addEventListener('click', () => showToast('Agent drafting...'));

    const snippetBtn = el('button', 'icon-btn');
    snippetBtn.appendChild(icon('ph-quotes'));
    snippetBtn.title = 'Insert snippet';
    snippetBtn.addEventListener('click', () => {
      const snippets = [
        { label: 'Quick follow-up', text: 'Hi, just following up on this. Let me know if you have any updates.\n\nThanks!' },
        { label: 'Thanks', text: 'Thanks for the update. Looks good to me.\n\nBest,' },
        { label: 'Schedule call', text: 'Would you be available for a quick call this week? I\'m flexible on time.\n\nThanks,' },
      ];
      openContextMenuFromElement(snippetBtn, snippets.map(s => ({
        label: s.label,
        action: () => {
          const start = bodyInput.selectionStart;
          const end = bodyInput.selectionEnd;
          const before = bodyInput.value.substring(0, start);
          const after = bodyInput.value.substring(end);
          bodyInput.value = before + s.text + after;
          bodyInput.focus();
          bodyInput.selectionStart = bodyInput.selectionEnd = start + s.text.length;
        }
      })));
    });

    leftActions.appendChild(attachBtn);
    leftActions.appendChild(aiBtn);
    leftActions.appendChild(snippetBtn);

    const rightActions = el('div', 'compose-actions');
    const draftStatus = el('span', 'compose-draft-status', 'Draft saved');
    const sendBtn = el('button', 'btn btn-primary btn-sm');
    sendBtn.appendChild(icon('ph-paper-plane-right'));
    sendBtn.appendChild(el('span', '', mode === 'reply' ? 'Reply' : mode === 'forward' ? 'Forward' : 'Send'));

    function doSend() {
      const ok = sendMessage({
        to: toInput.value,
        cc: ccInput.value,
        bcc: bccInput.value,
        subject: subjInput.value,
        body: bodyInput.value,
        mode: mode,
        originalMsg: context.originalMsg
      });
      if (ok) closeCompose();
    }

    sendBtn.addEventListener('click', doSend);
    bodyInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doSend();
      }
    });

    rightActions.appendChild(draftStatus);
    rightActions.appendChild(sendBtn);

    footer.appendChild(leftActions);
    footer.appendChild(rightActions);
    win.appendChild(footer);

    // Simulate draft autosave
    let draftTimeout;
    const updateDraftStatus = () => {
      draftStatus.textContent = 'Saving...';
      clearTimeout(draftTimeout);
      draftTimeout = setTimeout(() => {
        draftStatus.textContent = 'Draft saved';
      }, 800);
    };
    toInput.addEventListener('input', updateDraftStatus);
    subjInput.addEventListener('input', updateDraftStatus);
    bodyInput.addEventListener('input', updateDraftStatus);

    return win;
  }

  function renderSettings() {
    const container = el('div', 'view settings-view');
    container.appendChild(el('div', 'settings-section-title', 'Settings'));

    const tabs = ['profile', 'accounts', 'preferences', 'agent', 'labels', 'data', 'shortcuts'];
    const tabLabels = { profile: 'Profile', accounts: 'Accounts', preferences: 'Preferences', agent: 'Agent', labels: 'Labels', data: 'Data', shortcuts: 'Shortcuts' };
    const tabBar = el('div', 'settings-tabs');
    tabs.forEach(tab => {
      const isP2 = ['data', 'shortcuts'].includes(tab);
      const btn = el('button', 'settings-tab' + (state.settingsTab === tab ? ' active' : '') + (isP2 ? ' disabled' : ''), tabLabels[tab]);
      btn.addEventListener('click', () => {
        if (isP2) {
          showToast(tabLabels[tab] + ' settings coming soon');
          return;
        }
        state.settingsTab = tab;
        renderMain();
      });
      tabBar.appendChild(btn);
    });
    container.appendChild(tabBar);

    const content = el('div', 'settings-tab-content');
    switch (state.settingsTab) {
      case 'accounts': content.appendChild(renderAccountsSection()); break;
      case 'preferences': content.appendChild(renderPreferencesSection()); break;
      case 'agent': content.appendChild(renderAgentSection()); break;
      case 'labels': content.appendChild(renderLabelsSection()); break;
      case 'profile':
      default: content.appendChild(renderProfileSection()); break;
    }
    container.appendChild(content);

    return container;
  }

  // Task 8: global search
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, q) {
    if (!q) return document.createTextNode(text || '');
    const lower = q.toLowerCase();
    const str = String(text || '');
    const idx = str.toLowerCase().indexOf(lower);
    if (idx === -1) return document.createTextNode(str);
    const frag = document.createDocumentFragment();
    if (idx > 0) frag.appendChild(document.createTextNode(str.slice(0, idx)));
    const mark = el('mark', 'search-highlight', str.slice(idx, idx + q.length));
    frag.appendChild(mark);
    const rest = str.slice(idx + q.length);
    if (rest) frag.appendChild(highlightText(rest, q));
    return frag;
  }

  function searchContacts(q) {
    const qq = q.toLowerCase();
    return (D.contacts || []).filter(c => {
      const hay = [
        c.name, c.firstName, c.lastName, c.nickname, c.company, c.title,
        c.notes, c.em, c.ph,
        ...(c.topics || []),
        ...(c.emails || []).map(e => e.value),
        ...(c.phones || []).map(p => p.value)
      ].join(' ');
      return hay.toLowerCase().includes(qq);
    });
  }

  function searchMessages(q) {
    const qq = q.toLowerCase();
    return (D._msgs || []).filter(m => {
      const c = getContact(m.pid);
      const hay = [
        m.subj, m.prev, m.body, m.fm, m.tag, m.ch,
        c ? c.name : '',
        ...(m.at || [])
      ].join(' ');
      return hay.toLowerCase().includes(qq);
    });
  }

  function searchFiles(q) {
    const qq = q.toLowerCase();
    return (D._files || []).filter(f => {
      const c = getContact(f.pid);
      const hay = [f.name, f.tp, f.ch, f.md, c ? c.name : ''].join(' ');
      return hay.toLowerCase().includes(qq);
    });
  }

  function searchMeetings(q) {
    const qq = q.toLowerCase();
    return (D.events || D._meetings || []).filter(m => {
      const hay = [
        m.title, m.ppl, m.dt, m.tm, m.notes, m.post,
        ...(m.prep || [])
      ].join(' ');
      return hay.toLowerCase().includes(qq);
    });
  }

  function searchTasks(q) {
    const qq = q.toLowerCase();
    return (D.tasks || []).filter(t => {
      const hay = [t.title, t.description, t.status, t.priority, t.dueDate].join(' ');
      return hay.toLowerCase().includes(qq);
    });
  }

  function renderSearchResultRow(opts) {
    const { type, iconName, title, meta, preview, onClick, selected } = opts;
    const row = el('div', 'search-result' + (selected ? ' selected' : ''));
    row.appendChild(icon(iconName));
    const body = el('div', 'search-result-body');
    const top = el('div', 'search-result-top');
    const titleEl = el('div', 'search-result-title');
    titleEl.appendChild(highlightText(title, state.searchQuery));
    top.appendChild(titleEl);
    if (meta) {
      const metaEl = el('div', 'search-result-meta');
      if (typeof meta === 'string') metaEl.textContent = meta;
      else metaEl.appendChild(meta);
      top.appendChild(metaEl);
    }
    body.appendChild(top);
    if (preview) {
      const previewEl = el('div', 'search-result-preview');
      if (typeof preview === 'string') previewEl.appendChild(highlightText(preview, state.searchQuery));
      else previewEl.appendChild(preview);
      body.appendChild(previewEl);
    }
    row.appendChild(body);
    row.addEventListener('click', () => {
      state.selectedSearchResult = { type, id: opts.id };
      onClick();
      renderMain();
    });
    return row;
  }

  function renderSearchEmpty(text) {
    return el('div', 'search-empty', text);
  }

  function renderTaskPanel(task) {
    const wrapper = el('div', 'panel-wrapper');
    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);
    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'Task'));
    wrapper.appendChild(header);

    const content = el('div', 'panel-content');
    content.appendChild(el('h2', 'meeting-title', task.title || 'Untitled task'));
    const rows = [
      { icon: 'ph-check-circle', label: 'Status', value: (task.status || 'todo') },
      { icon: 'ph-flag', label: 'Priority', value: (task.priority || 'medium') },
      { icon: 'ph-calendar-blank', label: 'Due', value: [task.dueDate, task.dueTime].filter(Boolean).join(' ') || 'No due date' },
    ];
    if (task.description) {
      rows.push({ icon: 'ph-note', label: 'Notes', value: task.description });
    }
    const info = el('div', 'meeting-info-list');
    rows.forEach(r => {
      const row = el('div', 'meeting-info-row');
      const labelWrap = el('div', 'meeting-info-label');
      labelWrap.appendChild(icon(r.icon));
      labelWrap.appendChild(el('span', '', r.label));
      row.appendChild(labelWrap);
      row.appendChild(el('div', 'meeting-info-value', r.value));
      info.appendChild(row);
    });
    content.appendChild(info);

    const actions = el('div', 'panel-actions');
    const editBtn = el('button', 'btn btn-primary btn-sm');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.appendChild(el('span', '', 'Edit'));
    editBtn.addEventListener('click', () => openTaskModal(task.id));
    actions.appendChild(editBtn);
    content.appendChild(actions);

    wrapper.appendChild(content);
    return wrapper;
  }

  function renderSearchView() {
    const container = el('div', 'view search-view');
    const q = (state.searchQuery || '').trim();

    const header = el('div', 'view-header');
    const headerLeft = el('div', 'view-header-left');
    headerLeft.appendChild(el('h1', 'view-title', 'Search'));
    headerLeft.appendChild(el('div', 'view-subtitle', 'Results across people, messages, files, meetings, and tasks.'));
    header.appendChild(headerLeft);
    container.appendChild(header);

    const layout = el('div', 'search-layout');

    // Left filters
    const filters = [
      { id: 'all', label: 'All', icon: 'ph-magnifying-glass' },
      { id: 'people', label: 'People', icon: 'ph-users' },
      { id: 'messages', label: 'Messages', icon: 'ph-envelope-simple' },
      { id: 'files', label: 'Files', icon: 'ph-files' },
      { id: 'meetings', label: 'Meetings', icon: 'ph-calendar-blank' },
      { id: 'tasks', label: 'Tasks', icon: 'ph-check-circle' },
    ];

    const counts = {
      all: 0,
      people: searchContacts(q).length,
      messages: searchMessages(q).length,
      files: searchFiles(q).length,
      meetings: searchMeetings(q).length,
      tasks: searchTasks(q).length,
    };
    counts.all = counts.people + counts.messages + counts.files + counts.meetings + counts.tasks;

    const sidebar = el('div', 'search-filters');
    filters.forEach(f => {
      const active = state.searchFilter === f.id;
      const btn = el('button', 'search-filter' + (active ? ' active' : ''));
      btn.appendChild(icon(f.icon));
      const text = el('span', '', f.label);
      btn.appendChild(text);
      const count = el('span', 'search-filter-count', String(counts[f.id] || 0));
      btn.appendChild(count);
      btn.addEventListener('click', () => {
        state.searchFilter = f.id;
        state.selectedSearchResult = null;
        renderMain();
      });
      sidebar.appendChild(btn);
    });

    // Center results
    const results = el('div', 'search-results');

    if (!q) {
      results.appendChild(renderSearchEmpty('Type a query and press Enter to search across people, messages, files, meetings, and tasks.'));
    } else if (counts[state.searchFilter] === 0) {
      results.appendChild(renderSearchEmpty('No results for “' + q + '” in ' + state.searchFilter + '.'));
    } else {
      const activeFilter = state.searchFilter;
      const sections = [];

      if (activeFilter === 'all' || activeFilter === 'people') {
        const items = activeFilter === 'people' ? searchContacts(q) : searchContacts(q).slice(0, 4);
        if (items.length) sections.push({ type: 'people', label: 'People', items });
      }
      if (activeFilter === 'all' || activeFilter === 'messages') {
        const items = activeFilter === 'messages' ? searchMessages(q) : searchMessages(q).slice(0, 5);
        if (items.length) sections.push({ type: 'messages', label: 'Messages', items });
      }
      if (activeFilter === 'all' || activeFilter === 'files') {
        const items = activeFilter === 'files' ? searchFiles(q) : searchFiles(q).slice(0, 4);
        if (items.length) sections.push({ type: 'files', label: 'Files', items });
      }
      if (activeFilter === 'all' || activeFilter === 'meetings') {
        const items = activeFilter === 'meetings' ? searchMeetings(q) : searchMeetings(q).slice(0, 4);
        if (items.length) sections.push({ type: 'meetings', label: 'Meetings', items });
      }
      if (activeFilter === 'all' || activeFilter === 'tasks') {
        const items = activeFilter === 'tasks' ? searchTasks(q) : searchTasks(q).slice(0, 4);
        if (items.length) sections.push({ type: 'tasks', label: 'Tasks', items });
      }

      sections.forEach(section => {
        const sectionEl = el('div', 'search-section');
        const headerEl = el('div', 'search-section-header');
        headerEl.appendChild(el('h3', '', section.label));
        if (activeFilter === 'all') {
          const seeAll = el('button', 'btn-text', 'See all');
          seeAll.addEventListener('click', () => {
            state.searchFilter = section.type;
            state.selectedSearchResult = null;
            renderMain();
          });
          headerEl.appendChild(seeAll);
        }
        sectionEl.appendChild(headerEl);

        section.items.forEach(item => {
          const selected = state.selectedSearchResult &&
            state.selectedSearchResult.type === section.type &&
            state.selectedSearchResult.id === item.id;

          if (section.type === 'people') {
            const c = item;
            sectionEl.appendChild(renderSearchResultRow({
              type: 'people', id: c.id, iconName: 'ph-user',
              title: c.name,
              meta: [c.company, c.title].filter(Boolean).join(' · ') || c.em || '',
              preview: c.notes ? c.notes.slice(0, 120) : '',
              selected,
              onClick: () => openContact(c.id)
            }));
          } else if (section.type === 'messages') {
            const m = item;
            const c = getContact(m.pid);
            sectionEl.appendChild(renderSearchResultRow({
              type: 'messages', id: m.id, iconName: channelIconName(m.ch),
              title: m.subj || 'No subject',
              meta: (c ? c.name : m.fm || 'Unknown') + ' · ' + (m.tm || ''),
              preview: m.prev || m.body || '',
              selected,
              onClick: () => openMessage(m)
            }));
          } else if (section.type === 'files') {
            const f = item;
            const c = getContact(f.pid);
            sectionEl.appendChild(renderSearchResultRow({
              type: 'files', id: f.id, iconName: fileIconForName(f.name),
              title: f.name,
              meta: (c ? c.name : 'Unknown') + ' · ' + (f.sz || '') + ' · ' + (f.dt || ''),
              preview: f.md ? f.md.slice(0, 140) : '',
              selected,
              onClick: () => openFile(f)
            }));
          } else if (section.type === 'meetings') {
            const m = item;
            sectionEl.appendChild(renderSearchResultRow({
              type: 'meetings', id: m.id, iconName: 'ph-calendar-blank',
              title: m.title,
              meta: [m.dt, m.tm].filter(Boolean).join(' · '),
              preview: m.ppl || '',
              selected,
              onClick: () => openMeeting(m)
            }));
          } else if (section.type === 'tasks') {
            const t = item;
            sectionEl.appendChild(renderSearchResultRow({
              type: 'tasks', id: t.id, iconName: 'ph-check-circle',
              title: t.title,
              meta: [t.status, t.priority, t.dueDate].filter(Boolean).join(' · '),
              preview: t.description ? t.description.slice(0, 140) : '',
              selected,
              onClick: () => openDetailPanel(renderTaskPanel(t))
            }));
          }
        });

        results.appendChild(sectionEl);
      });
    }

    layout.appendChild(sidebar);
    layout.appendChild(results);
    container.appendChild(layout);

    return container;
  }

  function renderProfileSection() {
    const section = el('div', 'settings-section');
    section.appendChild(el('div', 'settings-section-title', 'Profile'));
    const card = el('div', 'settings-card');

    D.user = D.user || {};

    const nameInput = elAttr('input', '', { type: 'text', value: D.user.displayName || '' });
    nameInput.addEventListener('change', () => { D.user.displayName = nameInput.value; showToast('Display name saved'); });
    card.appendChild(renderFormGroup('Display name', nameInput));

    const avatarInput = elAttr('input', '', { type: 'text', value: D.user.avatar || '' });
    avatarInput.addEventListener('change', () => { D.user.avatar = avatarInput.value; renderTopBar(); showToast('Avatar updated'); });
    card.appendChild(renderFormGroup('Avatar URL', avatarInput));

    const tzSelect = el('select', '');
    ['Asia/Shanghai', 'UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London'].forEach(tz => {
      const opt = document.createElement('option'); opt.value = tz; opt.text = tz;
      if ((D.user.timezone || 'Asia/Shanghai') === tz) opt.selected = true;
      tzSelect.appendChild(opt);
    });
    tzSelect.addEventListener('change', () => { D.user.timezone = tzSelect.value; showToast('Timezone saved'); });
    card.appendChild(renderFormGroup('Timezone', tzSelect));

    const langSelect = el('select', '');
    [{ value: 'zh-CN', label: '简体中文' }, { value: 'en-US', label: 'English' }].forEach(l => {
      const opt = document.createElement('option'); opt.value = l.value; opt.text = l.label;
      if ((D.user.language || 'zh-CN') === l.value) opt.selected = true;
      langSelect.appendChild(opt);
    });
    langSelect.addEventListener('change', () => { D.user.language = langSelect.value; showToast('Language saved'); });
    card.appendChild(renderFormGroup('Language', langSelect));

    const sigInput = el('textarea', '');
    sigInput.value = D.user.signature || '';
    sigInput.addEventListener('change', () => { D.user.signature = sigInput.value; showToast('Signature saved'); });
    card.appendChild(renderFormGroup('Signature', sigInput));

    const replayRow = el('div', 'settings-row');
    replayRow.appendChild(el('span', 'settings-label', 'Onboarding'));
    const replay = el('button', 'btn btn-secondary btn-sm', 'Replay onboarding');
    replay.addEventListener('click', () => {
      state.view = 'imbox';
      startOnboarding();
    });
    replayRow.appendChild(replay);
    card.appendChild(replayRow);

    section.appendChild(card);
    return section;
  }

  function renderAccountsSection() {
    const section = el('div', 'settings-section');
    const header = el('div', 'settings-section-header');
    header.appendChild(el('div', 'settings-section-title', 'Connected accounts'));
    const addBtn = el('button', 'btn btn-primary btn-sm', '+ Add account');
    addBtn.addEventListener('click', openAddAccountModal);
    header.appendChild(addBtn);
    section.appendChild(header);

    const grid = el('div', 'account-cards');
    (D.accounts || []).forEach(a => {
      const card = el('div', 'account-card');

      const top = el('div', 'account-card-top');
      const avatar = el('div', 'account-avatar', a.avatar || '?');
      avatar.style.background = a.color || '#999';
      top.appendChild(avatar);

      const info = el('div', 'account-info');
      info.appendChild(el('div', 'account-label', a.label));
      info.appendChild(el('div', 'account-detail', a.email || a.workspace || a.provider));
      info.appendChild(el('div', 'account-meta', 'Last sync: ' + (a.lastSync || '-')));
      top.appendChild(info);

      const status = el('span', 'account-status account-status-' + a.status, a.status);
      top.appendChild(status);
      card.appendChild(top);

      const actions = el('div', 'account-card-actions');
      if (a.status === 'error') {
        const reconnect = el('button', 'btn btn-secondary btn-sm', 'Reconnect');
        reconnect.addEventListener('click', () => { a.status = 'connected'; a.lastSync = '刚刚'; showToast(a.label + ' reconnected'); renderMain(); });
        actions.appendChild(reconnect);
      }
      if (a.status === 'connected' || a.status === 'syncing') {
        const sync = el('button', 'btn btn-secondary btn-sm', a.status === 'syncing' ? 'Syncing…' : 'Sync now');
        sync.addEventListener('click', () => { a.status = 'syncing'; a.lastSync = '同步中'; showToast('Syncing ' + a.label); renderMain(); });
        actions.appendChild(sync);
      }
      const disconnect = el('button', 'btn btn-danger btn-sm', 'Disconnect');
      disconnect.addEventListener('click', () => confirmDestructive('Disconnect ' + a.label + '?', () => { D.accounts = D.accounts.filter(x => x.id !== a.id); renderMain(); showToast(a.label + ' disconnected'); }));
      actions.appendChild(disconnect);
      card.appendChild(actions);

      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  }

  function openAddAccountModal() {
    const modal = el('div', 'modal-overlay');
    const content = el('div', 'modal agent-memory-modal');
    let step = 1;
    let selectedProvider = null;

    const providers = [
      { id: 'gmail', name: 'Gmail', color: '#ea4335', icon: 'ph-envelope-simple' },
      { id: 'outlook', name: 'Outlook', color: '#0078d4', icon: 'ph-envelope-simple' },
      { id: 'slack', name: 'Slack', color: '#4a154b', icon: 'ph-slack-logo' },
      { id: 'wechat', name: 'WeChat', color: '#22c55e', icon: 'ph-chat-circle' },
      { id: 'google-calendar', name: 'Google Calendar', color: '#a78bfa', icon: 'ph-calendar' },
    ];

    function closeModal() { modal.remove(); document.removeEventListener('keydown', onKeyDown); }
    function onKeyDown(e) { if (e.key === 'Escape') closeModal(); }
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', onKeyDown);

    const header = el('div', 'modal-header');
    const title = el('h3', 'modal-title', 'Add account');
    const closeBtn = el('button', 'icon-btn');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(title);
    header.appendChild(closeBtn);
    content.appendChild(header);

    const body = el('div', 'modal-body');
    const actions = el('div', 'modal-card-actions');
    content.appendChild(body);
    content.appendChild(actions);

    function renderBody() {
      body.innerHTML = '';
      actions.innerHTML = '';
      if (step === 1) {
        body.appendChild(el('p', '', 'Select a service to connect:'));
        const grid = el('div', 'oauth-provider-grid');
        providers.forEach(p => {
          const btn = el('button', 'oauth-provider-btn');
          const av = el('span', 'oauth-provider-icon');
          av.style.background = p.color;
          av.appendChild(icon(p.icon));
          btn.appendChild(av);
          btn.appendChild(el('span', '', p.name));
          btn.addEventListener('click', () => { selectedProvider = p; step = 2; renderBody(); });
          grid.appendChild(btn);
        });
        body.appendChild(grid);
        const cancel = el('button', 'btn-secondary', 'Cancel');
        cancel.addEventListener('click', closeModal);
        actions.appendChild(cancel);
      } else if (step === 2) {
        body.appendChild(el('p', '', 'Authorize SendPalm to access your ' + selectedProvider.name + ' account.'));
        const spinner = el('div', 'oauth-spinner');
        spinner.appendChild(icon('ph-spinner'));
        spinner.appendChild(el('span', '', 'Waiting for authorization…'));
        body.appendChild(spinner);
        setTimeout(() => { step = 3; renderBody(); }, 1200);
        const cancel = el('button', 'btn-secondary', 'Cancel');
        cancel.addEventListener('click', closeModal);
        actions.appendChild(cancel);
      } else {
        body.appendChild(el('div', 'oauth-success', '✓ ' + selectedProvider.name + ' connected successfully'));
        body.appendChild(el('p', '', 'Your messages and events will start syncing shortly.'));
        const done = el('button', 'btn-primary', 'Done');
        done.addEventListener('click', () => {
          const p = selectedProvider;
          const newAccount = {
            id: p.id + '-' + Date.now(),
            type: p.id === 'google-calendar' ? 'calendar' : (p.id === 'slack' || p.id === 'wechat') ? 'im' : 'email',
            provider: p.id,
            label: p.name,
            status: 'connected',
            synced: 0,
            total: 0,
            privacy: 'unified',
            color: p.color,
            avatar: p.name.charAt(0),
            lastSync: '刚刚'
          };
          if (p.id === 'gmail') newAccount.email = 'user@gmail.com';
          if (p.id === 'outlook') newAccount.email = 'user@outlook.com';
          if (p.id === 'slack') newAccount.workspace = 'new-workspace';
          D.accounts.unshift(newAccount);
          closeModal(); renderMain(); showToast(p.name + ' account added');
        });
        actions.appendChild(done);
      }
    }

    renderBody();
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  function renderPreferencesSection() {
    const wrapper = el('div', '');

    const notifSection = el('div', 'settings-section');
    notifSection.appendChild(el('div', 'settings-section-title', 'Notifications'));
    const notifCard = el('div', 'settings-card');
    notifCard.appendChild(renderToggle('Desktop notifications', state.settings.notifications.desktop, v => { state.settings.notifications.desktop = v; showToast('Desktop notifications ' + (v ? 'enabled' : 'disabled')); }, 'Show alerts for important messages'));
    notifCard.appendChild(renderToggle('Weekly digest', state.settings.notifications.weeklyDigest, v => { state.settings.notifications.weeklyDigest = v; showToast('Weekly digest ' + (v ? 'enabled' : 'disabled')); }, 'Send a summary every Monday'));
    notifCard.appendChild(renderToggle('Quiet hours', state.settings.notifications.quietHours.enabled || false, v => { state.settings.notifications.quietHours.enabled = v; renderMain(); }, 'Pause notifications during selected hours'));
    notifSection.appendChild(notifCard);
    wrapper.appendChild(notifSection);

    const quietSection = el('div', 'settings-section');
    quietSection.appendChild(el('div', 'settings-section-title', 'Quiet hours'));
    const quietCard = el('div', 'settings-card');
    const quietRow = el('div', 'settings-row');
    quietRow.appendChild(el('span', 'settings-label', 'From'));
    const startSelect = el('select', 'settings-select');
    const endSelect = el('select', 'settings-select');
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    hours.forEach(h => {
      const o = document.createElement('option'); o.value = h; o.text = h;
      if (h === (state.settings.notifications.quietHours.start || '22:00')) o.selected = true;
      startSelect.appendChild(o);
    });
    hours.forEach(h => {
      const o = document.createElement('option'); o.value = h; o.text = h;
      if (h === (state.settings.notifications.quietHours.end || '08:00')) o.selected = true;
      endSelect.appendChild(o);
    });
    startSelect.addEventListener('change', () => { state.settings.notifications.quietHours.start = startSelect.value; });
    endSelect.addEventListener('change', () => { state.settings.notifications.quietHours.end = endSelect.value; });
    quietRow.appendChild(startSelect);
    quietRow.appendChild(el('span', 'settings-label', 'To'));
    quietRow.appendChild(endSelect);
    quietCard.appendChild(quietRow);
    quietSection.appendChild(quietCard);
    wrapper.appendChild(quietSection);

    const securitySection = el('div', 'settings-section');
    securitySection.appendChild(el('div', 'settings-section-title', 'Security & Privacy'));
    const securityCard = el('div', 'settings-card');
    securityCard.appendChild(renderToggle('App lock', state.settings.security.lockEnabled, v => { state.settings.security.lockEnabled = v; renderMain(); }, 'Require PIN to open SendPalm'));
    securityCard.appendChild(renderToggle('Screenshot protection', state.settings.security.screenshot, v => { state.settings.security.screenshot = v; renderMain(); }, 'Blur sensitive content in app switcher'));
    securityCard.appendChild(renderToggle('Clear clipboard', state.settings.security.clipboardClear, v => { state.settings.security.clipboardClear = v; renderMain(); }, 'Auto-clear copied content after 30s'));
    securitySection.appendChild(securityCard);
    wrapper.appendChild(securitySection);

    const syncSection = el('div', 'settings-section');
    syncSection.appendChild(el('div', 'settings-section-title', 'Sync & Storage'));
    const syncCard = el('div', 'settings-card');
    const syncRow = el('div', 'settings-row');
    const syncLeft = el('div', '');
    syncLeft.appendChild(el('div', 'settings-label', 'Default sync format'));
    syncLeft.appendChild(el('div', 'settings-desc', 'Store incoming emails as Markdown for agent context'));
    syncRow.appendChild(syncLeft);
    const syncSelect = el('select', 'settings-select');
    [{ value: 'markdown', label: 'Markdown' }, { value: 'original', label: 'Original' }, { value: 'both', label: 'Both (Markdown + HTML backup)' }].forEach(opt => {
      const o = el('option', '', opt.label);
      o.value = opt.value;
      if (state.settings.syncFormat === opt.value) o.selected = true;
      syncSelect.appendChild(o);
    });
    syncSelect.addEventListener('change', () => { state.settings.syncFormat = syncSelect.value; showToast('Sync format updated to ' + syncSelect.value); });
    syncRow.appendChild(syncSelect);
    syncCard.appendChild(syncRow);
    syncSection.appendChild(syncCard);
    wrapper.appendChild(syncSection);

    return wrapper;
  }

  function renderAgentSection() {
    const wrapper = el('div', '');

    const behaviorSection = el('div', 'settings-section');
    behaviorSection.appendChild(el('div', 'settings-section-title', 'Agent behavior'));
    const card = el('div', 'settings-card');

    D.agentMemory = D.agentMemory || { global: {}, contacts: {} };
    const mem = D.agentMemory.global;

    const toneRow = el('div', 'settings-row');
    const toneLeft = el('div', '');
    toneLeft.appendChild(el('div', 'settings-label', 'Default tone'));
    toneLeft.appendChild(el('div', 'settings-desc', 'How the agent writes by default'));
    toneRow.appendChild(toneLeft);
    const toneSelect = el('select', 'settings-select');
    [{ value: 'formal', label: 'Formal' }, { value: 'casual', label: 'Casual' }, { value: 'friendly', label: 'Friendly' }, { value: 'direct', label: 'Direct' }].forEach(o => {
      const opt = document.createElement('option'); opt.value = o.value; opt.text = o.label;
      if ((mem.tone || 'formal') === o.value) opt.selected = true;
      toneSelect.appendChild(opt);
    });
    toneSelect.addEventListener('change', () => { mem.tone = toneSelect.value; showToast('Default tone saved'); });
    toneRow.appendChild(toneSelect);
    card.appendChild(toneRow);

    const lengthRow = el('div', 'settings-row');
    const lengthLeft = el('div', '');
    lengthLeft.appendChild(el('div', 'settings-label', 'Default length'));
    lengthLeft.appendChild(el('div', 'settings-desc', 'Preferred reply length'));
    lengthRow.appendChild(lengthLeft);
    const lengthSelect = el('select', 'settings-select');
    [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }].forEach(o => {
      const opt = document.createElement('option'); opt.value = o.value; opt.text = o.label;
      if ((mem.defaultLength || 'medium') === o.value) opt.selected = true;
      lengthSelect.appendChild(opt);
    });
    lengthSelect.addEventListener('change', () => { mem.defaultLength = lengthSelect.value; showToast('Default length saved'); });
    lengthRow.appendChild(lengthSelect);
    card.appendChild(lengthRow);

    const taskRow = el('div', 'settings-row');
    const taskLeft = el('div', '');
    taskLeft.appendChild(el('div', 'settings-label', 'Auto-task level'));
    taskLeft.appendChild(el('div', 'settings-desc', 'How much the agent can do without approval'));
    taskRow.appendChild(taskLeft);
    const taskSelect = el('select', 'settings-select');
    const taskOptions = [
      { value: 'none', label: 'None — always ask' },
      { value: 'low', label: 'Low — safe actions only' },
      { value: 'medium', label: 'Medium — include drafts' },
      { value: 'high', label: 'High — run automatically' }
    ];
    const currentTask = mem.autoTask || (state.settings.agent.autoApproval === 'all' ? 'high' : state.settings.agent.autoApproval === 'none' ? 'none' : 'low');
    taskOptions.forEach(o => {
      const opt = document.createElement('option'); opt.value = o.value; opt.text = o.label;
      if (currentTask === o.value) opt.selected = true;
      taskSelect.appendChild(opt);
    });
    taskSelect.addEventListener('change', () => {
      mem.autoTask = taskSelect.value;
      state.settings.agent.autoApproval = taskSelect.value === 'none' ? 'none' : taskSelect.value === 'high' ? 'all' : 'low-risk';
      showToast('Auto-task level saved');
    });
    taskRow.appendChild(taskSelect);
    card.appendChild(taskRow);

    behaviorSection.appendChild(card);
    wrapper.appendChild(behaviorSection);

    const memorySection = el('div', 'settings-section');
    memorySection.appendChild(el('div', 'settings-section-title', 'Memory'));
    const memoryCard = el('div', 'settings-card');
    const memoryRow = el('div', 'settings-row');
    memoryRow.appendChild(el('span', 'settings-label', 'Manage agent memory'));
    const manageMemoryBtn = el('button', 'btn btn-secondary btn-sm', 'Manage');
    manageMemoryBtn.addEventListener('click', renderAgentMemoryModal);
    memoryRow.appendChild(manageMemoryBtn);
    memoryCard.appendChild(memoryRow);
    memorySection.appendChild(memoryCard);
    wrapper.appendChild(memorySection);

    return wrapper;
  }

  const LABEL_PRESET_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4',
    '#ec4899', '#f97316', '#eab308', '#14b8a6', '#6366f1', '#84cc16'
  ];

  function labelUsageCount(labelId) {
    return (D.contacts || []).filter(c =>
      (c.labels || []).includes(labelId) || (c.autoLabel || []).includes(labelId)
    ).length;
  }

  function slugifyLabelId(name) {
    return 'l-' + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function renderLabelsSection() {
    const section = el('div', 'settings-section');
    const header = el('div', 'settings-section-header');
    header.appendChild(el('div', 'settings-section-title', 'Labels'));
    const addBtn = el('button', 'btn btn-primary btn-sm', '+ New label');
    addBtn.addEventListener('click', () => openLabelModal());
    header.appendChild(addBtn);
    section.appendChild(header);

    const list = el('div', 'label-list');
    (D.labels || []).forEach(label => {
      const row = el('div', 'label-row');
      row.addEventListener('click', () => openLabelModal(label.id));

      const dot = el('span', 'label-dot');
      dot.style.backgroundColor = label.color || '#999';

      const info = el('div', 'label-info');
      info.appendChild(el('span', 'label-name', label.name));
      const count = labelUsageCount(label.id);
      info.appendChild(el('span', 'label-count', count + ' contact' + (count === 1 ? '' : 's')));

      const actions = el('div', 'label-actions');
      const editBtn = el('button', 'btn-icon label-action-btn');
      editBtn.type = 'button';
      editBtn.title = 'Edit label';
      editBtn.appendChild(icon('ph-pencil-simple'));
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); openLabelModal(label.id); });
      actions.appendChild(editBtn);

      row.appendChild(dot);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function openLabelModal(labelId) {
    const isNew = !labelId;
    const label = isNew
      ? { id: '', name: '', color: LABEL_PRESET_COLORS[0] }
      : (D.labels || []).find(l => l.id === labelId);
    if (!label) return;

    let name = label.name || '';
    let color = label.color || LABEL_PRESET_COLORS[0];
    const originalId = label.id;

    openModalCard({
      title: isNew ? 'New label' : 'Edit label',
      renderBody: (body) => {
        const stack = el('div', 'form-stack');
        const nameInput = elAttr('input', '', { type: 'text', value: name, placeholder: 'Label name' });
        nameInput.addEventListener('input', () => { name = nameInput.value; });
        stack.appendChild(renderFormGroup('Name', nameInput));

        const colorGroup = el('div', 'form-group');
        colorGroup.appendChild(el('label', 'form-label', 'Color'));
        const picker = el('div', 'color-picker');
        LABEL_PRESET_COLORS.forEach(c => {
          const swatch = el('button', 'color-swatch' + (c === color ? ' selected' : ''));
          swatch.type = 'button';
          swatch.dataset.color = c;
          swatch.style.backgroundColor = c;
          swatch.title = c;
          swatch.addEventListener('click', () => {
            color = c;
            Array.from(picker.children).forEach(child => {
              child.classList.toggle('selected', child.dataset.color === c);
            });
          });
          picker.appendChild(swatch);
        });
        colorGroup.appendChild(picker);
        stack.appendChild(colorGroup);
        body.appendChild(stack);
      },
      renderActions: (actions) => {
        if (!isNew) {
          const del = el('button', 'btn-danger', 'Delete');
          del.addEventListener('click', () => confirmDestructive(
            `Delete label "${label.name}"? This will remove it from all contacts.`,
            () => {
              D.labels = (D.labels || []).filter(l => l.id !== originalId);
              (D.contacts || []).forEach(c => {
                c.labels = (c.labels || []).filter(id => id !== originalId);
                c.autoLabel = (c.autoLabel || []).filter(id => id !== originalId);
              });
              closeCompose();
              renderMain();
              showToast('Label deleted');
            }
          ));
          actions.appendChild(del);
        } else {
          actions.appendChild(el('span', ''));
        }

        const cancel = el('button', 'btn-secondary', 'Cancel');
        cancel.addEventListener('click', () => closeCompose());
        const save = el('button', 'btn-primary', 'Save');
        save.addEventListener('click', () => {
          const trimmed = name.trim();
          if (!trimmed) {
            showToast('Label name is required');
            return;
          }
          const newId = slugifyLabelId(trimmed) || ('l-' + Date.now());
          const existing = (D.labels || []).find(l => l.id === newId);
          if (isNew) {
            if (existing) {
              showToast('A label with that name already exists');
              return;
            }
            D.labels = D.labels || [];
            D.labels.push({ id: newId, name: trimmed, color });
          } else {
            if (existing && existing.id !== originalId) {
              showToast('A label with that name already exists');
              return;
            }
            const target = (D.labels || []).find(l => l.id === originalId);
            if (target) {
              if (originalId && originalId !== newId) {
                (D.contacts || []).forEach(c => {
                  const idx = (c.labels || []).indexOf(originalId);
                  if (idx !== -1) c.labels[idx] = newId;
                  const autoIdx = (c.autoLabel || []).indexOf(originalId);
                  if (autoIdx !== -1) c.autoLabel[autoIdx] = newId;
                });
              }
              target.id = newId;
              target.name = trimmed;
              target.color = color;
            }
          }
          closeCompose();
          renderMain();
          showToast(isNew ? 'Label created' : 'Label saved');
        });
        actions.appendChild(cancel);
        actions.appendChild(save);
      }
    });
  }

  function renderAgentMemoryModal() {
    const modal = el('div', 'modal-overlay');
    const content = el('div', 'modal agent-memory-modal');

    D.agentMemory = D.agentMemory || { global: {}, contacts: {} };

    function onMemoryChange() {
      renderMain();
    }

    function closeModal() {
      modal.remove();
      document.removeEventListener('keydown', onKeyDown);
      renderMain();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal();
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', onKeyDown);

    const header = el('div', 'modal-header');
    header.appendChild(el('h3', 'modal-title', 'Agent Memory'));
    const close = el('button', 'icon-btn');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', closeModal);
    header.appendChild(close);
    content.appendChild(header);

    const body = el('div', 'modal-body');
    body.appendChild(el('div', 'agent-memory-section-title', 'Global preferences'));
    const memoryFields = [
      { key: 'tone', label: 'Tone', placeholder: 'formal / casual / friendly' },
      { key: 'defaultLength', label: 'Default length', placeholder: 'short / medium / long' },
      { key: 'signature', label: 'Signature', placeholder: 'Your default sign-off' },
      { key: 'language', label: 'Language', placeholder: 'zh-CN / en-US' }
    ];
    memoryFields.forEach(f => {
      const row = el('div', 'settings-row');
      row.appendChild(el('span', 'settings-label', f.label));
      const input = el('input', 'settings-input');
      input.value = D.agentMemory.global[f.key] || '';
      input.placeholder = f.placeholder;
      input.addEventListener('change', () => {
        D.agentMemory.global[f.key] = input.value;
        onMemoryChange();
      });
      row.appendChild(input);
      body.appendChild(row);
    });

    body.appendChild(el('div', 'agent-memory-section-title', 'Contact memory'));
    Object.entries(D.agentMemory.contacts).forEach(([pid, mem]) => {
      const c = D.getP(pid);
      const card = el('div', 'agent-memory-contact-card');
      card.appendChild(el('div', 'agent-memory-contact-name', c ? c.name : pid));
      const topics = el('input', 'settings-input');
      topics.value = (mem.topics || []).join(', ');
      topics.placeholder = 'Topics';
      topics.addEventListener('change', () => {
        mem.topics = topics.value.split(',').map(s => s.trim()).filter(Boolean);
        onMemoryChange();
      });
      card.appendChild(topics);
      body.appendChild(card);
    });

    content.appendChild(body);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  function sendAgentDraft(id) {
    const idx = D.agentDrafts.findIndex(d => d.id === id);
    if (idx === -1) return;
    const d = D.agentDrafts[idx];
    showToast('Draft sent to ' + d.to);
    D.agentDrafts.splice(idx, 1);
    renderMain();
  }

  function editAgentDraft(d) {
    const updated = prompt('Editing draft for ' + d.to, d.preview);
    if (updated !== null) {
      d.preview = updated;
      showToast('Editing draft for ' + d.to);
      renderMain();
    }
  }

  function editAgentDraftManually(d) {
    const manualDraft = {
      id: 'md-' + Date.now(),
      from: 'gmail-w',
      to: d.to || '',
      cc: '',
      bcc: '',
      subj: d.subj || '',
      body: d.preview || '',
      at: [],
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedSession: d.sessionId || null,
      linkedTask: null
    };
    D.drafts.unshift(manualDraft);
    openDraftModal(manualDraft.id);
  }

  function openMessage(m) {
    state.selectedMessageId = m.pid + '-' + m.subj;
    state.selectedContactId = m.pid;
    state.selectedFileId = null;
    if (!m.seen) {
      m.seen = true;
    }
    renderMain();
    openDetailPanel(renderMessagePanel(m));
    renderAgentPanel();
  }

  function renderMessagePanel(m) {
    const c = getContact(m.pid);
    const wrapper = el('div', 'panel-wrapper');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon(isMobile() ? 'ph-arrow-left' : 'ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const copyBtn = el('button', 'btn btn-secondary btn-sm');
    copyBtn.appendChild(icon('ph-copy'));
    copyBtn.appendChild(el('span', '', 'Copy'));
    copyBtn.addEventListener('click', () => copyMessageContext(m, c));

    const downloadBtn = el('button', 'btn btn-secondary btn-sm');
    downloadBtn.appendChild(icon('ph-download-simple'));
    downloadBtn.appendChild(el('span', '', 'Markdown'));
    downloadBtn.addEventListener('click', () => downloadMessageMarkdown(m));

    const summarizeBtn = el('button', 'btn btn-secondary btn-sm');
    summarizeBtn.appendChild(icon('ph-sparkle'));
    summarizeBtn.appendChild(el('span', '', 'Summarize'));
    summarizeBtn.addEventListener('click', () => {
      m.summary = generateMessageSummary(m);
      renderMain();
      showToast('AI summary generated');
    });

    const headerActions = el('div', 'panel-actions');
    headerActions.appendChild(summarizeBtn);
    headerActions.appendChild(copyBtn);
    headerActions.appendChild(downloadBtn);

    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'Thread'));
    header.appendChild(headerActions);
    wrapper.appendChild(header);

    const thread = getMessageThread(m);
    const threadEl = el('div', 'msg-thread');

    const threadHeader = el('div', 'msg-thread-header');
    const subjectRow = el('div', 'msg-thread-subject-row');
    const subject = el('h1', 'msg-thread-subject', baseSubject(m.subj));
    subjectRow.appendChild(subject);

    threadHeader.appendChild(subjectRow);

    const participants = el('div', 'msg-thread-participants');
    const uniqueSenders = new Map();
    thread.forEach(msg => {
      const s = getMessageSender(msg);
      if (!uniqueSenders.has(s.name)) uniqueSenders.set(s.name, s);
    });
    uniqueSenders.forEach(s => {
      const chip = el('span', 'msg-participant-chip', s.name);
      participants.appendChild(chip);
    });
    threadHeader.appendChild(participants);
    threadEl.appendChild(threadHeader);

    if (m.summary) {
      const summaryCard = el('div', 'msg-summary-card');
      const summaryHeader = el('div', 'msg-summary-header');
      summaryHeader.appendChild(icon('ph-sparkle'));
      summaryHeader.appendChild(el('span', '', 'AI Summary'));
      summaryCard.appendChild(summaryHeader);
      const summaryBody = el('div', 'msg-summary-body');
      m.summary.split('\n').forEach(line => {
        if (!line.trim()) return;
        const p = el('div', 'msg-summary-line', line.replace(/^- /, ''));
        summaryBody.appendChild(p);
      });
      summaryCard.appendChild(summaryBody);
      threadEl.appendChild(summaryCard);
    }

    if (state.messageViewMode === 'source') {
      const sourceBlock = el('pre', 'msg-thread-source');
      sourceBlock.textContent = buildMessageMarkdown(m);
      threadEl.appendChild(sourceBlock);
    }

    thread.forEach((msg, idx) => {
      if (state.messageViewMode === 'source') return;
      const s = getMessageSender(msg);
      const isSelected = msg === m;
      const isLastTwo = idx >= thread.length - 2;
      const isExpanded = thread.length <= 3 || isSelected || isLastTwo || state.expandedThreadMessages.has(msg);
      const isCollapsed = !isExpanded;
      const msgEl = el('div', 'thread-message' + (isSelected ? ' selected' : '') + (isCollapsed ? ' collapsed' : ''));

      const meta = el('div', 'msg-thread-meta');
      let avatar;
      if (s.isMe) {
        avatar = el('div', 'msg-thread-avatar', s.initial);
        avatar.style.background = 'linear-gradient(135deg, #0A8F63, #0CB87D)';
      } else if (s.contact) {
        avatar = renderAvatar(s.contact, 'msg-thread-avatar', s.initial, () => openContact(s.contact.id));
      } else {
        avatar = el('div', 'msg-thread-avatar', s.initial);
        avatar.style.background = '#8e8e93';
      }

      const sender = el('div', 'msg-thread-sender');
      const nameEl = el('div', 'msg-thread-name' + (s.contact ? ' contact-name-link' : ''), s.name);
      if (s.contact) {
        nameEl.title = 'View contact';
        nameEl.addEventListener('click', (e) => { e.stopPropagation(); openContact(s.contact.id); });
      }
      sender.appendChild(nameEl);
      sender.appendChild(el('div', 'msg-thread-email', s.email || (s.contact ? s.contact.co : '')));

      const time = el('span', 'msg-thread-time', msg.tm);

      meta.appendChild(avatar);
      meta.appendChild(sender);
      meta.appendChild(time);
      msgEl.appendChild(meta);

      if (isCollapsed) {
        const previewText = formatMessageBody(msg).replace(/\s+/g, ' ').trim();
        const preview = previewText.slice(0, 110) + (previewText.length > 110 ? '...' : '');
        const previewEl = el('div', 'msg-thread-preview', preview);
        msgEl.appendChild(previewEl);
        msgEl.addEventListener('click', () => {
          if (state.expandedThreadMessages.has(msg)) {
            state.expandedThreadMessages.delete(msg);
          } else {
            state.expandedThreadMessages.add(msg);
          }
          renderMain();
        });
      } else {
        const bodyEl = el('div', 'msg-thread-body');
        const bodyText = formatMessageBody(msg);
        const signature = getMessageSignature(msg);
        bodyText.split(/\n\s*\n/).forEach(p => {
          const trimmed = p.trim();
          if (!trimmed) return;
          bodyEl.appendChild(el('p', '', trimmed));
        });
        if (signature) {
          bodyEl.appendChild(el('div', 'msg-signature', signature));
        }
        msgEl.appendChild(bodyEl);

        if (msg.at && msg.at.length) {
          const att = el('div', 'msg-attachments');
          msg.at.forEach(a => {
            const card = el('div', 'attachment-card');
            card.appendChild(icon(fileIconForName(a)));
            card.appendChild(el('span', 'attachment-card-name', a));
            card.addEventListener('click', () => showToast('Opening ' + a));
            att.appendChild(card);
          });
          msgEl.appendChild(att);
        }
      }

      threadEl.appendChild(msgEl);

      if (idx < thread.length - 1) {
        threadEl.appendChild(el('div', 'thread-divider'));
      }
    });

    const content = el('div', 'panel-content msg-panel-content');
    content.appendChild(threadEl);
    wrapper.appendChild(content);

    const actions = el('div', 'msg-actions');

    function makeActionBtn(iconName, label, primary, iconOnly, title) {
      const btn = el('button', 'msg-action-btn' + (primary ? ' msg-action-primary' : '') + (iconOnly ? ' msg-action-icon-only' : ''));
      btn.appendChild(icon(iconName));
      btn.appendChild(el('span', '', label));
      btn.title = title || label;
      return btn;
    }

    const replyBtn = makeActionBtn('ph-arrow-u-up-left', 'Reply', true, false, 'Reply (r)');
    const replyLaterBtn = makeActionBtn('ph-clock', 'Pending', false, true, 'Pending (l)');
    const setAsideBtn = makeActionBtn('ph-push-pin', 'Saved', false, true, 'Saved (s)');
    const bubbleUpBtn = makeActionBtn('ph-arrow-fat-line-up', 'Remind', false, true, 'Remind (b)');
    const unreadBtn = makeActionBtn(m.seen ? 'ph-eye-slash' : 'ph-eye', 'Unread', false, true, m.seen ? 'Mark as unread' : 'Mark as read');
    const moreBtn = makeActionBtn('ph-dots-three', 'More', false, true, 'More actions');

    replyBtn.addEventListener('click', () => {
      const subject = baseSubject(m.subj);
      const quoteHeader = 'On ' + m.tm + ', ' + (c ? c.name : m.fm) + ' <' + (c ? c.em : '') + '> wrote:';
      openComposeWithContext(c ? c.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader);
    });
    replyLaterBtn.addEventListener('click', () => replyLaterMessage(m));
    setAsideBtn.addEventListener('click', () => setAsideMessage(m));
    bubbleUpBtn.addEventListener('click', () => {
      const now = new Date();
      const fmt = (d) => {
        const days = ['周日','周一','周二','周三','周四','周五','周六'];
        return days[d.getDay()] + ' ' + d.getHours() + ':00';
      };
      const laterToday = new Date(now); laterToday.setHours(18, 0, 0, 0);
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8, 0, 0, 0);
      const weekend = new Date(now);
      while (weekend.getDay() !== 6) weekend.setDate(weekend.getDate() + 1);
      weekend.setHours(8, 0, 0, 0);
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7));
      nextWeek.setHours(8, 0, 0, 0);

      const choices = [
        { label: 'Now', sub: '马上提醒', action: () => bubbleUpMessage(m, 'now') },
        { label: 'Later today', sub: fmt(laterToday), action: () => bubbleUpMessage(m, 'later') },
        { label: 'Tomorrow', sub: fmt(tomorrow), action: () => bubbleUpMessage(m, 'tomorrow') },
        { label: 'This weekend', sub: fmt(weekend), action: () => bubbleUpMessage(m, 'weekend') },
        { label: 'Next week', sub: fmt(nextWeek), action: () => bubbleUpMessage(m, 'week') },
        { label: 'Pick a date…', action: () => showToast('Date picker') },
      ];
      openContextMenuFromElement(bubbleUpBtn, choices);
    });
    unreadBtn.addEventListener('click', () => {
      toggleUnreadMessage(m);
      renderMain();
    });
    moreBtn.addEventListener('click', () => {
      const contact = getContact(m.pid);
      const items = [
        { label: 'Reply All', icon: 'ph-users', action: () => { const subject = baseSubject(m.subj); const quoteHeader = 'On ' + m.tm + ', ' + (c ? c.name : m.fm) + ' wrote:'; openComposeWithContext(c ? c.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader); showToast('Reply All: other recipients added in Cc'); } },
        { label: 'Forward', icon: 'ph-share', action: () => { const quoteHeader = '---------- Forwarded message ----------\nFrom: ' + (c ? c.name : m.fm) + '\nSubject: ' + m.subj + '\nDate: ' + m.tm; openComposeWithContext('', 'Fwd: ' + baseSubject(m.subj), '', 'forward', m, quoteHeader); } },
        { label: 'Save as draft', icon: 'ph-pencil-simple', action: () => {
          const manualDraft = {
            id: 'md-' + Date.now(),
            from: 'gmail-w',
            to: c ? c.name : m.fm,
            cc: '',
            bcc: '',
            subj: m.subj || '',
            body: (m.body || m.prev || ''),
            at: (m.at || []).slice(),
            source: 'manual',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            linkedSession: null,
            linkedTask: null
          };
          D.drafts.unshift(manualDraft);
          showToast('Saved as draft');
          renderMain();
        } },
        { type: 'divider' },
        { label: 'Move to Inbox', icon: 'ph-tray', action: () => moveMessageToBucket(m, 'imbox') },
        { label: 'Move to Stream', icon: 'ph-newspaper', action: () => moveMessageToBucket(m, 'feed') },
        { label: 'Move to Records', icon: 'ph-receipt', action: () => moveMessageToBucket(m, 'paperTrail') },
        { type: 'divider' },
        { label: 'Mark as spam', icon: 'ph-warning-circle', hint: '!', action: () => spamMessage(m) },
        { label: 'Move to Trash', icon: 'ph-trash', hint: '#', action: () => trashMessage(m) },
        { type: 'divider' },
        { label: 'Ask Agent', icon: 'ph-sparkle', action: () => openAgentWithContext('Draft a reply to ' + (contact ? contact.name : 'this email')) },
        { label: contact && contact.blocked ? 'Unblock sender' : 'Block sender', icon: 'ph-prohibit', action: () => { contact.blocked = !contact.blocked; renderMain(); showToast(contact.blocked ? 'Sender blocked' : 'Sender unblocked'); } },
      ];
      openContextMenuFromElement(moreBtn, items);
    });

    actions.appendChild(replyBtn);
    actions.appendChild(replyLaterBtn);
    actions.appendChild(setAsideBtn);
    actions.appendChild(bubbleUpBtn);
    actions.appendChild(unreadBtn);
    actions.appendChild(moreBtn);
    wrapper.appendChild(actions);

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
      wrapper.appendChild(bottomActions);
    }

    return wrapper;
  }

  function openComposeWithContext(to, subj, body, mode, originalMsg, quoteHeader) {
    openCompose({
      to: to,
      subject: subj,
      body: body,
      mode: mode || 'new',
      originalMsg: originalMsg,
      quote: originalMsg ? originalMsg.prev : '',
      quoteHeader: quoteHeader
    });
  }

  function generateBrief(m) {
    m.br = true;
    showToast('简报已生成：' + m.title);
    renderMain();
  }

  function openMeeting(m) {
    state.selectedMeetingId = m.id;
    state.selectedContactId = m.pids && m.pids[0] ? m.pids[0] : null;
    state.selectedFileId = null;
    openDetailPanel(renderMeetingPanel(m));
    renderAgentPanel();
  }

  function renderMeetingPanel(m) {
    const wrapper = el('div', 'panel-wrapper');
    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const editBtn = el('button', 'btn btn-primary btn-sm');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.appendChild(el('span', '', 'Edit'));
    editBtn.addEventListener('click', () => openEventModal({ eventId: m.id }));

    const followUpBtn = el('button', 'btn btn-secondary btn-sm');
    followUpBtn.appendChild(icon('ph-check-circle'));
    followUpBtn.appendChild(el('span', '', 'Add follow-up'));
    followUpBtn.addEventListener('click', () => openTaskModal(null, { relatedType: 'event', relatedId: m.id }));

    const copyBtn = el('button', 'btn btn-secondary btn-sm');
    copyBtn.appendChild(icon('ph-copy'));
    copyBtn.appendChild(el('span', '', 'Copy'));
    copyBtn.addEventListener('click', () => copyMeetingContext(m));

    const downloadBtn = el('button', 'btn btn-secondary btn-sm');
    downloadBtn.appendChild(icon('ph-download-simple'));
    downloadBtn.appendChild(el('span', '', 'Markdown'));
    downloadBtn.addEventListener('click', () => downloadMeetingMarkdown(m));

    const headerActions = el('div', 'panel-actions');
    headerActions.appendChild(editBtn);
    headerActions.appendChild(followUpBtn);
    headerActions.appendChild(copyBtn);
    headerActions.appendChild(downloadBtn);

    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'Meeting'));
    header.appendChild(headerActions);
    wrapper.appendChild(header);

    const content = el('div', 'panel-content meeting-panel-content');

    const title = el('h1', 'meeting-title', m.title);
    content.appendChild(title);

    const info = el('div', 'meeting-info-list');
    const infoRows = [
      { icon: 'ph-calendar-blank', label: 'Time', value: m.dt + ' ' + m.tm },
      { icon: 'ph-users', label: 'People', value: m.ppl },
      { icon: 'ph-notepad', label: 'Notes', value: m.notes },
    ];
    infoRows.forEach(r => {
      const row = el('div', 'meeting-info-row');
      const labelWrap = el('div', 'meeting-info-label');
      labelWrap.appendChild(icon(r.icon));
      labelWrap.appendChild(el('span', '', r.label));
      row.appendChild(labelWrap);
      row.appendChild(el('div', 'meeting-info-value', r.value));
      info.appendChild(row);
    });
    content.appendChild(info);

    if (m.prep && m.prep.length) {
      const prepSection = el('div', 'meeting-section');
      prepSection.appendChild(el('div', 'meeting-section-title', 'Preparation'));
      const prepList = el('div', 'meeting-prep-list');
      m.prep.forEach((p, idx) => {
        const key = m.id + '-prep-' + idx;
        const check = el('label', 'prep-check');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!state.prepChecked[key];
        cb.addEventListener('change', () => {
          state.prepChecked[key] = cb.checked;
          renderMain();
        });
        check.appendChild(cb);
        check.appendChild(el('span', '', p));
        prepList.appendChild(check);
      });
      prepSection.appendChild(prepList);
      content.appendChild(prepSection);
    }

    if (m.post) {
      const postSection = el('div', 'meeting-section');
      postSection.appendChild(el('div', 'meeting-section-title', 'Post-meeting'));
      postSection.appendChild(el('div', 'meeting-post', m.post));
      content.appendChild(postSection);
    }

    wrapper.appendChild(content);
    return wrapper;
  }

  function channelIconName(ch) {
    if (ch === 'Gmail') return 'ph-envelope-simple';
    if (ch === 'Slack') return 'ph-slack-logo';
    if (ch === 'WeChat') return 'ph-chat-circle';
    if (ch === 'Calendar') return 'ph-calendar-blank';
    return 'ph-chat-circle';
  }

  function renderFeedItem(ev, view, index) {
    if (ev.type === 'message') {
      const m = ev.data;
      const contact = getContact(m.pid);

      const pScore = priorityScore(ev);
      const pClass = pScore >= 80 ? ' priority-high' : pScore >= 50 ? ' priority-medium' : '';
      const isCursor = index === state.cursorIndex;
      const isSelected = state.selectedIds.has(m.id);
      const card = el('div', 'feed-card' + pClass + (isCursor ? ' cursor' : '') + (isSelected ? ' selected' : '') + (m.seen ? '' : ' unread'));
      card.dataset.index = index;
      card.addEventListener('click', () => openMessage(m));
      card.addEventListener('contextmenu', (e) => showContextMenuForMessage(e, m));
      addLongPressListener(card, (e) => {
        const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
        const x = touch ? touch.clientX : 0;
        const y = touch ? touch.clientY : 0;
        showContextMenuForMessage({ clientX: x, clientY: y, preventDefault: () => {} }, m);
      });

      const left = renderAvatar(contact, 'feed-avatar', contact ? contact.name[0] : '?', contact ? () => openContact(contact.id) : null);

      const body = el('div', 'feed-body');
      const topRow = el('div', 'feed-top-row');
      const name = el('span', 'feed-name' + (contact ? ' contact-name-link' : ''), contact ? contact.name : 'Unknown');
      if (contact) {
        name.title = 'View contact';
        name.addEventListener('click', (e) => { e.stopPropagation(); openContact(contact.id); });
      }
      const time = el('span', 'feed-time', m.tm);
      topRow.appendChild(name);

      const status = messageStatusInfo(m.fl);
      if (status) {
        const dot = el('span', 'feed-status-dot');
        dot.style.background = status.color;
        dot.title = status.label;
        topRow.appendChild(dot);
      }

      // Draft-ready badge: only shown when user has explicitly generated a draft
      if (m.aiDraft && state.view === 'imbox') {
        const draftBadge = el('span', 'feed-draft-badge');
        draftBadge.appendChild(icon('ph-sparkle'));
        draftBadge.title = 'AI draft ready — click sparkle to view';
        draftBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          expandDraftPanel(m);
        });
        topRow.appendChild(draftBadge);
      }

      topRow.appendChild(el('span', 'feed-spacer'));
      topRow.appendChild(time);

      const bottomRow = el('div', 'feed-bottom-row');
      const subjRow = el('div', 'feed-subject-row');
      subjRow.appendChild(el('span', 'feed-subject', m.subj));
      const prev = el('span', 'feed-preview', m.prev);
      bottomRow.appendChild(subjRow);
      bottomRow.appendChild(prev);

      body.appendChild(topRow);
      body.appendChild(bottomRow);

      card.appendChild(left);
      card.appendChild(body);

      const hoverActions = el('div', 'feed-card-actions');
      const isTrashView = state.view === 'trash';
      const isSpamView = state.view === 'spam';
      const actionConfigs = isTrashView || isSpamView ? [
        { icon: 'ph-arrow-u-up-left', title: 'Restore', action: () => restoreMessageFromTrash(m) },
      ] : [
        // Sparkle draft button — user-triggered AI draft
        ...(view === 'imbox' && !m.aiDraft ? [{
          icon: 'ph-sparkle',
          title: 'Draft reply with AI',
          action: () => requestAiDraft(m),
        }] : []),
        { icon: 'ph-clock', title: 'Pending (l)', action: () => replyLaterMessage(m) },
        { icon: 'ph-push-pin', title: 'Saved (s)', action: () => setAsideMessage(m) },
        { icon: 'ph-arrow-fat-line-up', title: 'Remind (b)', action: () => bubbleUpMessage(m, 'tomorrow') },
        { icon: 'ph-archive', title: 'Archive (e)', action: () => archiveMessage(m) },
        { icon: 'ph-trash', title: 'Trash (#)', action: () => trashMessage(m) },
      ];
      actionConfigs.forEach(cfg => {
        const btn = el('button', 'icon-btn feed-card-action-btn');
        btn.title = cfg.title;
        btn.appendChild(icon(cfg.icon));
        btn.addEventListener('click', (e) => { e.stopPropagation(); cfg.action(); });
        hoverActions.appendChild(btn);
      });
      // Add unread toggle on hover for imbox items
      if (view === 'imbox' && !isTrashView && !isSpamView) {
        const unreadBtn = el('button', 'icon-btn feed-card-action-btn');
        const isUnread = !m.seen;
        unreadBtn.title = isUnread ? 'Mark as Read' : 'Mark as Unread';
        unreadBtn.appendChild(icon(isUnread ? 'ph-eye' : 'ph-eye-slash'));
        unreadBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleUnreadMessage(m); });
        hoverActions.appendChild(unreadBtn);
      }
      card.appendChild(hoverActions);

      if (view === 'screener') {
        card.classList.add('screener-card');
        const actions = el('div', 'screener-actions');
        const yesImbox = el('button', 'btn btn-primary btn-xs', 'Inbox');
        const yesFeed = el('button', 'btn btn-secondary btn-xs', 'Stream');
        const yesPaper = el('button', 'btn btn-secondary btn-xs', 'Records');
        const noBtn = el('button', 'btn btn-ghost btn-xs', 'Block');
        yesImbox.addEventListener('click', (e) => { e.stopPropagation(); screenSender(m.pid, 'imbox'); });
        yesFeed.addEventListener('click', (e) => { e.stopPropagation(); screenSender(m.pid, 'feed'); });
        yesPaper.addEventListener('click', (e) => { e.stopPropagation(); screenSender(m.pid, 'paperTrail'); });
        noBtn.addEventListener('click', (e) => { e.stopPropagation(); blockSender(m.pid); });
        actions.appendChild(yesImbox);
        actions.appendChild(yesFeed);
        actions.appendChild(yesPaper);
        actions.appendChild(noBtn);
        card.appendChild(actions);
        return wrapSwipeActions(card, () => blockSender(m.pid), () => screenSender(m.pid, 'imbox'), {
          leftLabel: 'Block',
          leftIcon: 'ph-prohibit',
          leftColor: 'red',
          rightLabel: 'Inbox',
          rightIcon: 'ph-check',
          rightColor: 'blue',
          threshold: isMobile() ? 60 : 80
        });
      }

      const wrapped = wrapSwipeActions(card, () => setAsideMessage(m), () => replyLaterMessage(m), {
        leftLabel: 'Saved',
        leftIcon: 'ph-push-pin',
        leftColor: 'green',
        rightLabel: 'Pending',
        rightIcon: 'ph-clock',
        rightColor: 'yellow',
        threshold: isMobile() ? 60 : 80
      });
      wrapped.setAttribute('draggable', 'true');
      wrapped.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', m.id);
        e.dataTransfer.effectAllowed = 'move';
        wrapped.classList.add('dragging');
        showDropBar();
      });
      wrapped.addEventListener('dragend', () => {
        wrapped.classList.remove('dragging');
        hideDropBar();
      });

      // If this message has an open draft, render the panel below the card.
      if (state.expandedDraftId === m.id && m.aiDraft) {
        const group = el('div', 'feed-card-group');
        group.appendChild(wrapped);
        group.appendChild(renderInlineDraftPanel(m, contact));
        return group;
      }
      return wrapped;
    }

    if (ev.type === 'meeting') {
      const m = ev.data;
      const card = el('div', 'feed-card meeting-card');
      card.addEventListener('click', () => openMeeting(m));

      const left = el('div', 'feed-avatar meeting-avatar');
      left.appendChild(icon('ph-calendar-blank'));

      const body = el('div', 'feed-body');
      const topRow = el('div', 'feed-top-row');
      topRow.appendChild(el('span', 'feed-name', '📅 ' + (m.title.length > 32 ? m.title.slice(0, 31) + '…' : m.title)));
      topRow.appendChild(el('span', 'feed-spacer'));
      topRow.appendChild(el('span', 'feed-time', m.dt + ' · ' + m.tm));

      const bottomRow = el('div', 'feed-bottom-row');
      const subjRow = el('div', 'feed-subject-row');
      subjRow.appendChild(el('span', 'feed-subject', 'Meeting'));
      bottomRow.appendChild(subjRow);
      bottomRow.appendChild(el('span', 'feed-preview', m.ppl));

      body.appendChild(topRow);
      body.appendChild(bottomRow);

      card.appendChild(left);
      card.appendChild(body);
      return wrapSwipeActions(card, () => snoozeMeeting(m), () => archiveMeeting(m), {
        leftLabel: 'Snooze',
        leftIcon: 'ph-clock',
        leftColor: 'yellow',
        rightLabel: 'Archive',
        rightIcon: 'ph-archive',
        rightColor: 'red',
        threshold: isMobile() ? 60 : 80
      });
    }

    return el('div');
  }

  function findDraftForMessage(m) {
    // Only matches messages that the user has explicitly requested a draft for
    // (those have m.aiDraft set). Kept as a lookup for legacy callers.
    if (!m || !m.aiDraft) return null;
    return { preview: m.aiDraft };
  }

  // User-triggered AI drafting flow. Sets the active draft state, simulates
  // a 1.2s agent call that uses thread context, then expands the inline panel.
  function requestAiDraft(m) {
    const contact = getContact(m.pid);
    if (state.draftingMessageId === m.id) return;
    state.draftingMessageId = m.id;
    state.expandedDraftId = m.id;
    renderMain();

    setTimeout(() => {
      const thread = getMessageThread(m);
      m.aiDraft = generateAiDraft(m, contact, thread);
      state.draftingMessageId = null;
      renderMain();
    }, 1200);
  }

  // Re-open an already-generated draft inline.
  function expandDraftPanel(m) {
    state.expandedDraftId = m.id;
    renderMain();
  }

  // The inline panel that lives directly below the feed card.
  function renderInlineDraftPanel(m, contact) {
    const panel = el('div', 'feed-draft-panel');
    if (state.draftingMessageId === m.id) {
      // loading state — agent is still "thinking"
      const status = el('div', 'feed-draft-status');
      const spinner = el('div', 'feed-draft-spinner');
      status.appendChild(spinner);
      const label = el('div', 'feed-draft-status-text');
      label.appendChild(el('strong', '', 'Drafting reply with context…'));
      label.appendChild(el('div', 'feed-draft-context-hint',
        'Reading the thread with ' + (contact ? contact.name : m.fm) +
        ' · last ' + Math.min(3, getMessageThread(m).length) + ' messages · ' + m.subj));
      status.appendChild(label);
      panel.appendChild(status);
      return panel;
    }

    const header = el('div', 'feed-draft-header');
    header.appendChild(icon('ph-sparkle'));
    header.appendChild(el('span', '', 'AI draft · reply to ' + (contact ? contact.name : m.fm)));
    const closeBtn = el('button', 'icon-btn feed-draft-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.title = 'Discard draft';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.expandedDraftId = null;
      m.aiDraft = null;
      renderMain();
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    if (m.aiDraft) {
      const body = el('div', 'feed-draft-body');
      body.appendChild(el('div', 'feed-draft-subj-row',
        'Re: ' + baseSubject(m.subj)));
      const textarea = el('textarea', 'feed-draft-text');
      textarea.value = m.aiDraft;
      textarea.rows = Math.min(6, Math.max(2, (m.aiDraft.match(/\n/g) || []).length + 2));
      textarea.addEventListener('input', (e) => { m.aiDraft = e.target.value; });
      body.appendChild(textarea);
      panel.appendChild(body);
    }

    const actions = el('div', 'feed-draft-actions');
    const meta = el('span', 'feed-draft-meta', 'Tokens used: ~' + Math.ceil(((m.aiDraft || m.prev || '').length) / 4));
    actions.appendChild(meta);

    const cancelBtn = el('button', 'btn btn-ghost btn-sm', 'Discard');
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.expandedDraftId = null;
      m.aiDraft = null;
      renderMain();
    });
    actions.appendChild(cancelBtn);

    const sendBtn = el('button', 'btn btn-primary btn-sm');
    sendBtn.appendChild(icon('ph-paper-plane-right'));
    sendBtn.appendChild(el('span', '', 'Send reply'));
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = sendMessage({
        to: contact ? contact.name : '',
        cc: '', bcc: '',
        subject: 'Re: ' + baseSubject(m.subj),
        body: m.aiDraft,
        mode: 'reply',
        originalMsg: m,
      });
      if (ok) {
        state.expandedDraftId = null;
        m.aiDraft = null;
      }
    });
    actions.appendChild(sendBtn);

    panel.appendChild(actions);
    return panel;
  }

  function showToast(text, options) {
    options = options || {};
    const toast = document.getElementById('toast');
    toast.innerHTML = '';
    const textSpan = el('span', 'toast-text', text);
    toast.appendChild(textSpan);
    if (typeof options.undo === 'function') {
      const undoBtn = el('button', 'toast-action', options.undoLabel || 'Undo');
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.undo();
        hideToast();
      });
      toast.appendChild(undoBtn);
    }
    toast.classList.add('show');
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), options.duration || 3200);
  }

  function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
  }

  function copyToClipboard(text, label) {
    if (!navigator.clipboard) {
      showToast(label + ' not copied (clipboard unavailable)');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => showToast(label + ' copied'))
      .catch(() => showToast(label + ' copy failed'));
  }

  function markdownEscape(text) {
    return String(text || '').replace(/([\\`*_{}#[\]()<>.!|])/g, '\\$1');
  }

  function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_\. ]/g, '_').replace(/\s+/g, '_') + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function baseSubject(subj) {
    return String(subj || '').replace(/^(Re:|Fwd:|FW:|RE:)\s*/i, '').trim();
  }

  // Auto-generate a conversational thread title from body content (ChatGPT-style).
  // Strips greetings/sign-offs, keeps the semantic kernel, caps at 32 chars.
  function generateConversationTitle(body) {
    const text = String(body || '').trim();
    if (!text) return '';

    // Drop trailing sign-off blocks (Best/Regards/Thanks/此致敬礼/谢谢 etc.)
    let stripped = text
      .replace(/\n*(Best|Regards|Thanks|Thank you|Cheers|此致|敬礼|谢谢|此致敬礼)[,.\s!]*\n*[\s\S]*$/i, '')
      .replace(/^\s*[-—]+\s*/gm, '')
      .trim();

    // Drop greeting + "name," prefix (e.g. "Hi 张磊," / "Hey 王洋," / "你好，" / "Hi all,")
    const greetingWithNameRe = /^(Hi|Hello|Hey|Dear|你好|您好|嗨)\s+([^\n,.。!！:：\n]{1,20})[,。.！!]\s*/i;
    const greetingOnlyRe = /^(Hi|Hello|Hey|Dear|你好|您好|嗨)[,!。，：:]\s*/i;
    if (greetingWithNameRe.test(stripped)) {
      stripped = stripped.replace(greetingWithNameRe, '');
    } else if (greetingOnlyRe.test(stripped)) {
      stripped = stripped.replace(greetingOnlyRe, '');
    }

    // Take the first meaningful paragraph → line → sentence
    const firstPara = stripped.split(/\n\s*\n/)[0] || stripped;
    const firstLine = firstPara.split(/\n/)[0] || firstPara;
    const sentence = firstLine.split(/[。！.!?]\s/)[0].trim() || firstLine;

    let title = sentence.replace(/\s+/g, ' ').trim();

    // Cap at 32 chars with ellipsis (Unicode-aware)
    if ([...title].length > 32) {
      title = [...title].slice(0, 31).join('') + '…';
    }

    return title || 'Untitled';
  }

  function generateMessageSummary(m) {
    const c = getContact(m.pid);
    const subject = baseSubject(m.subj);
    const preview = m.prev || '';
    const bullets = [];
    bullets.push('**Topic:** ' + subject);
    if (c) bullets.push('**From:** ' + c.name + ' (' + c.co + ')');
    if (m.fl === 'wait') bullets.push('**Action needed:** Reply requested');
    else if (m.fl === 'todo') bullets.push('**Action needed:** Follow up');
    else if (m.fl === 'done') bullets.push('**Status:** Resolved');
    const sentences = preview.split(/[。！？.!?]/).filter(s => s.trim().length > 5);
    if (sentences.length) bullets.push('**Key point:** ' + sentences[0].trim());
    if (m.at && m.at.length) bullets.push('**Attachments:** ' + m.at.length + ' file(s)');
    return bullets.map(b => '- ' + b).join('\n');
  }

  function getMessageThread(m) {
    const contact = getContact(m.pid);
    if (!contact) return [m];
    const subject = baseSubject(m.subj);
    const thread = D._msgs.filter(x => {
      if (x.pid !== m.pid) return false;
      return baseSubject(x.subj) === subject;
    });
    thread.sort((a, b) => new Date(a.st) - new Date(b.st));
    return thread.length ? thread : [m];
  }

  function getMessageSender(m) {
    if (m.fm === '你') {
      return { name: 'You', email: 'edwin@sendpalm.com', isMe: true, initial: 'Y' };
    }
    const c = getContact(m.pid);
    if (c && c.name === m.fm) {
      return { name: c.name, email: c.em, isMe: false, initial: c.name[0], contact: c };
    }
    return { name: m.fm || 'Unknown', email: '', isMe: false, initial: (m.fm || '?')[0] };
  }

  function formatMessageBody(m) {
    let body = m.body || m.prev || '';
    if (!body.trim()) body = '(No content)';
    const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim());
    if (paragraphs.length === 1) {
      body = body.replace(/\n/g, '\n\n');
    }
    return body;
  }

  function getMessageSignature(m) {
    const sender = getMessageSender(m);
    if (!sender.isMe && sender.contact) {
      return sender.name + ' | ' + sender.contact.tl + ' · ' + sender.contact.co;
    }
    return '';
  }

  function buildContactMarkdown(c) {
    const msgs = D.getMsgs(c.id);
    const meetings = D.getMeetings(c.id);
    return `# ${c.name}

## Basic Info
- Company: ${c.co}
- Title: ${c.tl}
- Email: ${c.em}
- Phone: ${c.ph}
- Health: ${c.sc}/100 (${c.scL})
- Stage: ${D.stageLabel[c.stage] || c.stage}

## Recent Communication
${msgs.slice(0, 5).map(m => `- ${m.tm} · ${m.tag} · ${markdownEscape(m.subj)}`).join('\n') || 'None'}

## Upcoming Meetings
${meetings.slice(0, 3).map(m => `- ${m.dt} ${m.tm}: ${markdownEscape(m.title)}`).join('\n') || 'None'}

## Topics
${c.topics.join(' · ')}

## Pattern
${c.pattern}

## Suggested Action
${D.stageSuggest[c.stage] || ''}
`;
  }

  function buildMessageMarkdown(m) {
    const c = getContact(m.pid);
    const thread = getMessageThread(m);
    const subject = baseSubject(m.subj);
    let md = `# ${markdownEscape(subject)}\n\n`;
    md += `**Contact:** ${c ? c.name + ' (' + c.co + ')' : m.fm}  \n`;
    md += `**Channel:** ${m.ch}  \n`;
    md += `**Participants:** ${[...new Set(thread.map(msg => getMessageSender(msg).name))].join(', ')}\n\n`;
    md += `## Thread\n\n`;
    thread.forEach(msg => {
      const s = getMessageSender(msg);
      md += `### ${s.name} · ${msg.tm}\n\n`;
      md += formatMessageBody(msg) + '\n\n';
      const sig = getMessageSignature(msg);
      if (sig) md += '_' + sig + '_\n\n';
      if (msg.at && msg.at.length) {
        md += `**Attachments:** ${msg.at.map(a => markdownEscape(a)).join(', ')}\n\n`;
      }
      md += '---\n\n';
    });
    return md;
  }

  function buildMeetingMarkdown(m) {
    let md = `# Meeting: ${markdownEscape(m.title)}\n\n`;
    md += `- **Time:** ${m.dt} ${m.tm}\n`;
    md += `- **Participants:** ${m.ppl}\n`;
    md += `- **Notes:** ${m.notes}\n\n`;
    if (m.prep && m.prep.length) {
      md += `## Preparation\n\n`;
      md += m.prep.map(p => `- [ ] ${p}`).join('\n') + '\n\n';
    }
    if (m.post) {
      md += `## Post-meeting\n\n${m.post}\n\n`;
    }
    return md;
  }

  function copyContactContext(c) {
    copyToClipboard(buildContactMarkdown(c), 'Contact context');
  }

  function copyMessageContext(m, c) {
    copyToClipboard(buildMessageMarkdown(m), 'Message context');
  }

  function copyMeetingContext(m) {
    copyToClipboard(buildMeetingMarkdown(m), 'Meeting context');
  }

  function downloadContactMarkdown(c) {
    downloadMarkdown(c.name + '_context', buildContactMarkdown(c));
  }

  function downloadMessageMarkdown(m) {
    downloadMarkdown(baseSubject(m.subj) + '_thread', buildMessageMarkdown(m));
  }

  function downloadMeetingMarkdown(m) {
    downloadMarkdown(m.title + '_meeting', buildMeetingMarkdown(m));
  }

  function runAgentAction(text) {
    const isTaskIntent = /帮我|帮我做|请帮我|帮我.*并.*|draft.*and.*send|generate.*and.*send/i.test(text);
    let session = getCurrentAgentSession();

    if (!session) {
      session = createAgentSession(isTaskIntent ? 'task' : 'freeform', null, text.slice(0, 30));
    }

    addAgentMessage(session.id, 'user', text, []);

    if (isTaskIntent) {
      const taskId = generateId('at');
      session.type = 'task';
      session.taskId = taskId;
      D.agentTasks.push({
        id: taskId,
        name: text.slice(0, 40),
        sessionId: session.id,
        status: 'go',
        steps: [
          { l: '分析请求', d: true },
          { l: '收集上下文', d: false },
          { l: '生成结果', d: false },
          { l: '等待确认', d: false }
        ],
        eta: '2 min',
        createdAt: Date.now()
      });
    }

    showToast('Agent is thinking...');
    setTimeout(() => {
      const reply = generateAgentReply(text, session);
      const actions = session.type === 'task' ? ['copy', 'create-task'] : ['copy', 'regenerate', 'use-draft'];
      addAgentMessage(session.id, 'agent', reply, actions);
      if (session.type === 'task') {
        const task = D.agentTasks.find(t => t.sessionId === session.id);
        if (task) {
          task.steps[1].d = true;
          task.steps[2].d = true;
        }
      }
      renderAgentPanel();
      renderMain();
    }, 600);
  }

  function generateAgentReply(text, session) {
    if (text.includes('总结')) return '这是当前内容的摘要：...';
    if (text.includes('草稿') || text.includes('回复')) return '已为你草拟回复：\n\n您好，...';
    return '收到。我已记录你的请求，接下来可以帮你继续处理。';
  }

  function createAgentTaskFromMessage(message, session) {
    const taskId = generateId('at');
    const taskSession = createAgentSession('task', session ? session.context : null, 'Task: ' + message.text.slice(0, 30));
    taskSession.taskId = taskId;

    const task = {
      id: taskId,
      name: message.text.slice(0, 40),
      sessionId: taskSession.id,
      status: 'go',
      steps: [
        { l: '分析请求', d: true },
        { l: '收集上下文', d: false },
        { l: '生成结果', d: false },
        { l: '等待确认', d: false }
      ],
      eta: '2 min',
      createdAt: Date.now()
    };
    D.agentTasks.push(task);

    addAgentMessage(taskSession.id, 'agent', '已创建任务：' + task.name + '\n\n我将分步执行，你可以随时在这个会话中调整方向。', []);
    switchAgentSession(taskSession.id);
    renderAgentPanel();
    renderMain();
  }

  function openAgentWithContext(context) {
    state.agentOpen = true;
    document.getElementById('agent-panel').classList.add('open');
    renderAgentPanel();
    const input = document.querySelector('#agent-panel .agent-input');
    if (input) input.value = context;
  }

  function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }

  function createAgentSession(type, context, title) {
    const session = {
      id: generateId('as'),
      type: type || 'freeform',
      title: title || (context && context.preview ? context.preview : 'New conversation'),
      context: context || { kind: null, id: null, preview: '' },
      messages: [],
      taskId: null,
      memoryTags: [],
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.agentSessions.unshift(session);
    state.currentAgentSessionId = session.id;
    return session;
  }

  function getCurrentAgentSession() {
    return state.agentSessions.find(s => s.id === state.currentAgentSessionId) || null;
  }

  function switchAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (!s) return;
    state.currentAgentSessionId = id;
    s.status = s.status === 'archived' ? 'active' : s.status;
    s.updatedAt = Date.now();
  }

  function archiveAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) {
      s.status = 'archived';
      if (state.currentAgentSessionId === id) {
        const next = state.agentSessions.find(x => x.status !== 'archived');
        state.currentAgentSessionId = next ? next.id : null;
      }
    }
  }

  function pinAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) s.status = s.status === 'pinned' ? 'active' : 'pinned';
  }

  function updateAgentSessionTitle(id, title) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) {
      s.title = title;
      s.updatedAt = Date.now();
    }
  }

  function addAgentMessage(sessionId, role, text, actions) {
    const s = state.agentSessions.find(x => x.id === sessionId);
    if (!s) return;
    s.messages.push({ role, text, actions: actions || [], ts: Date.now() });
    s.updatedAt = Date.now();
  }

  function agentContextKindIcon(kind) {
    const map = {
      message: 'ph-envelope',
      contact: 'ph-user',
      meeting: 'ph-calendar',
      file: 'ph-file'
    };
    return map[kind] || 'ph-sparkle';
  }

  window.createAgentSession = createAgentSession;
  window.getCurrentAgentSession = getCurrentAgentSession;
  window.switchAgentSession = switchAgentSession;
  window.archiveAgentSession = archiveAgentSession;
  window.pinAgentSession = pinAgentSession;
  window.updateAgentSessionTitle = updateAgentSessionTitle;
  window.addAgentMessage = addAgentMessage;
  window.agentContextKindIcon = agentContextKindIcon;

  function renderAgentFab() {
    const fab = document.getElementById('agent-fab');
    fab.innerHTML = '';
    const i = icon('ph-sparkle');
    fab.appendChild(i);
    // Add an accessible label and tooltip so users know what the sparkle icon does.
    fab.setAttribute('aria-label', 'Open SendPalm Agent');
    fab.title = 'Ask SendPalm Agent';
    fab.addEventListener('click', toggleAgent);

    fab.classList.toggle('has-tasks', (D.agentTasks || []).some(t => t.status === 'go'));
  }

  function toggleAgent() {
    state.agentOpen = !state.agentOpen;
    const panel = document.getElementById('agent-panel');
    if (state.agentOpen) panel.classList.add('open');
    else panel.classList.remove('open');
  }

  function buildAgentContext() {
    if (state.selectedMessageId && state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      const m = D._msgs.find(x => x.id === state.selectedMessageId);
      return {
        kind: 'message',
        id: state.selectedMessageId,
        preview: (c ? c.name + ' - ' : '') + (m ? (m.subj || 'No subject') : '')
      };
    }
    if (state.selectedMeetingId) {
      const m = D._meetings.find(x => x.id === state.selectedMeetingId);
      return { kind: 'meeting', id: state.selectedMeetingId, preview: m ? m.title : '' };
    }
    if (state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      return { kind: 'contact', id: state.selectedContactId, preview: c ? c.name : '' };
    }
    if (state.selectedFileId) {
      const f = D._files.find(x => x.id === state.selectedFileId);
      return { kind: 'file', id: state.selectedFileId, preview: f ? f.name : '' };
    }
    return { kind: null, id: null, preview: '' };
  }

  function agentSuggestionsForContext(kind) {
    const defaults = [
      { text: 'Morning briefing', action: () => runAgentAction('Give me a morning briefing') },
      { text: 'What needs attention?', action: () => runAgentAction('What needs my attention?') },
      { text: 'Draft weekly update', action: () => runAgentAction('Draft my weekly update') }
    ];
    const map = {
      message: [
        { text: 'Summarize', action: () => runAgentAction('Summarize this email') },
        { text: 'Draft reply', action: () => runAgentAction('Draft a reply to this email') },
        { text: 'Extract todos', action: () => runAgentAction('Extract todos from this email') },
        { text: 'Set follow-up', action: () => runAgentAction('Set a follow-up for this email') }
      ],
      contact: [
        { text: 'Relationship summary', action: () => runAgentAction('Summarize my relationship with this contact') },
        { text: 'Suggest next action', action: () => runAgentAction('What should I do next with this contact?') },
        { text: 'Draft catch-up', action: () => runAgentAction('Draft a catch-up message') }
      ],
      meeting: [
        { text: 'Generate briefing', action: () => runAgentAction('Generate a meeting briefing') },
        { text: 'Extract todos', action: () => runAgentAction('Extract todos from this meeting') },
        { text: 'Draft follow-up', action: () => runAgentAction('Draft a follow-up email') }
      ],
      file: [
        { text: 'Summarize file', action: () => runAgentAction('Summarize this file') },
        { text: 'Copy context', action: () => runAgentAction('Copy file context as markdown') },
        { text: 'Find related emails', action: () => runAgentAction('Find emails related to this file') }
      ]
    };
    return map[kind] || defaults;
  }

  function removeAgentSessionDropdown(dropdown) {
    if (dropdown._closeDropdown) {
      document.removeEventListener('click', dropdown._closeDropdown);
      dropdown._closeDropdown = null;
    }
    dropdown.remove();
  }

  function showAgentSessionDropdown(anchor) {
    const existing = document.querySelector('.agent-session-dropdown');
    if (existing) { removeAgentSessionDropdown(existing); return; }

    const dropdown = el('div', 'agent-session-dropdown');
    const activeSessions = state.agentSessions.filter(s => s.status !== 'archived');
    activeSessions.slice(0, 6).forEach(s => {
      const item = el('div', 'agent-session-dropdown-item' + (s.id === state.currentAgentSessionId ? ' active' : ''));
      item.appendChild(icon(agentContextKindIcon(s.context.kind)));
      const info = el('div', 'agent-session-dropdown-info');
      info.appendChild(el('div', 'agent-session-dropdown-title', s.title));
      const last = s.messages[s.messages.length - 1];
      info.appendChild(el('div', 'agent-session-dropdown-preview', last ? last.text.slice(0, 40) : ''));
      item.appendChild(info);
      item.addEventListener('click', () => {
        switchAgentSession(s.id);
        renderAgentPanel();
        removeAgentSessionDropdown(dropdown);
      });
      dropdown.appendChild(item);
    });

    const archived = state.agentSessions.filter(s => s.status === 'archived');
    if (archived.length) {
      dropdown.appendChild(el('div', 'agent-session-dropdown-divider', ''));
      archived.slice(0, 3).forEach(s => {
        const item = el('div', 'agent-session-dropdown-item');
        item.appendChild(icon('ph-archive'));
        item.appendChild(el('span', '', s.title));
        item.addEventListener('click', () => {
          switchAgentSession(s.id);
          renderAgentPanel();
          removeAgentSessionDropdown(dropdown);
        });
        dropdown.appendChild(item);
      });
    }

    document.body.appendChild(dropdown);
    const rect = anchor.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';

    const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor) {
        removeAgentSessionDropdown(dropdown);
      }
    };
    dropdown._closeDropdown = closeDropdown;
    setTimeout(() => document.addEventListener('click', closeDropdown), 0);
  }

  function actionLabel(action) {
    const labels = {
      copy: 'Copy',
      regenerate: 'Regenerate',
      'use-draft': 'Use as draft',
      'create-task': 'Create task'
    };
    return labels[action] || action;
  }

  function handleAgentMessageAction(action, message, session) {
    if (action === 'copy') {
      copyToClipboard(message.text, 'Message');
    } else if (action === 'regenerate') {
      showToast('Regenerating...');
      setTimeout(() => {
        message.text = generateAgentReply('regenerate', session);
        renderAgentPanel();
      }, 600);
    } else if (action === 'use-draft') {
      openCompose({ body: message.text, mode: 'new' });
    } else if (action === 'create-task') {
      createAgentTaskFromMessage(message, session);
    }
  }

  function renderAgentPanel() {
    const panel = document.getElementById('agent-panel');
    panel.innerHTML = '';

    const header = el('div', 'agent-header');

    const sessionSelectWrap = el('div', 'agent-session-select-wrap');
    const currentSession = getCurrentAgentSession();
    const sessionBtn = el('button', 'agent-session-select');
    sessionBtn.appendChild(icon(agentContextKindIcon(currentSession && currentSession.context.kind)));
    sessionBtn.appendChild(el('span', '', currentSession ? currentSession.title : 'New conversation'));
    sessionBtn.appendChild(icon('ph-caret-down'));
    sessionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showAgentSessionDropdown(sessionBtn);
    });
    sessionSelectWrap.appendChild(sessionBtn);
    header.appendChild(sessionSelectWrap);

    const headerActions = el('div', 'agent-header-actions');
    const newSessionBtn = el('button', 'icon-btn agent-new-session-btn');
    newSessionBtn.title = 'New session';
    newSessionBtn.appendChild(icon('ph-plus'));
    newSessionBtn.addEventListener('click', () => {
      createAgentSession('freeform', null, null);
      renderAgentPanel();
    });
    headerActions.appendChild(newSessionBtn);

    const close = el('button', 'icon-btn agent-close');
    close.title = 'Close';
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleAgent);
    headerActions.appendChild(close);
    header.appendChild(headerActions);

    panel.appendChild(header);

    const ctx = buildAgentContext();
    if (ctx.kind) {
      const ctxWrap = el('div', 'agent-context');
      const ctxPill = el('button', 'agent-context-pill');
      ctxPill.appendChild(icon(agentContextKindIcon(ctx.kind)));
      ctxPill.appendChild(el('span', '', ctx.preview));
      ctxPill.title = 'Click to reference this context';
      ctxPill.addEventListener('click', () => {
        const input = panel.querySelector('.agent-input');
        if (input) {
          input.value = input.value ? input.value + ' [context:' + ctx.kind + ':' + ctx.id + ']' : '[context:' + ctx.kind + ':' + ctx.id + ']';
          input.focus();
        }
      });
      ctxWrap.appendChild(ctxPill);
      panel.appendChild(ctxWrap);
    }

    const suggestions = el('div', 'agent-suggestions');
    const suggestionActions = agentSuggestionsForContext(ctx.kind);
    suggestionActions.forEach(s => {
      const chip = el('button', 'agent-chip', s.text);
      chip.addEventListener('click', s.action);
      suggestions.appendChild(chip);
    });
    panel.appendChild(suggestions);

    const messagesWrap = el('div', 'agent-messages');
    const session = getCurrentAgentSession();
    if (session && session.messages && session.messages.length) {
      session.messages.forEach(m => messagesWrap.appendChild(renderAgentMessage(m, session)));
    } else {
      messagesWrap.appendChild(el('div', 'agent-empty-messages', 'Ask SendPalm anything about what you are viewing.'));
    }
    panel.appendChild(messagesWrap);

    const tasks = el('div', 'agent-tasks');
    if ((D.agentTasks || []).length) {
      tasks.appendChild(el('div', 'agent-section-title', 'In progress'));
      (D.agentTasks || []).forEach(t => {
        const row = el('div', 'agent-task');
        const doneSteps = t.steps.filter(s => s.d).length;
        const totalSteps = t.steps.length;
        row.appendChild(el('div', 'agent-task-name', t.name));
        const meta = el('div', 'agent-task-meta');
        const progress = el('span', 'agent-task-progress', doneSteps + '/' + totalSteps);
        progress.title = t.steps.map(s => (s.d ? '✓ ' : '○ ') + s.l).join('\n');
        meta.appendChild(progress);
        if (t.eta) meta.appendChild(el('span', 'agent-task-eta', t.eta));
        row.appendChild(meta);
        row.addEventListener('click', () => {
          if (t.sessionId) { switchAgentSession(t.sessionId); renderMain(); }
        });
        tasks.appendChild(row);
      });
    }
    panel.appendChild(tasks);

    const inputWrap = el('div', 'agent-input-wrap');
    const input = el('input', 'agent-input');
    input.placeholder = 'Ask SendPalm...';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        runAgentAction(input.value.trim());
        input.value = '';
      }
    });
    inputWrap.appendChild(input);
    panel.appendChild(inputWrap);
  }

  const commands = [
    { id: 'compose', label: 'Compose new message', section: 'Actions', icon: 'ph-pencil-simple', hint: '⌘N' },
    { id: 'search', label: 'Search', section: 'Actions', icon: 'ph-magnifying-glass', hint: '⌘K' },
    { id: 'goImbox', label: 'Go to Inbox', section: 'Views', icon: 'ph-tray', hint: '⌘2' },
    { id: 'goFeed', label: 'Go to Stream', section: 'Views', icon: 'ph-newspaper', hint: '⌘3' },
    { id: 'goPaperTrail', label: 'Go to Records', section: 'Views', icon: 'ph-receipt', hint: '⌘4' },
    { id: 'goScreener', label: 'Go to Gate', section: 'Views', icon: 'ph-funnel', hint: '⌘1' },
    { id: 'goScreenerHistory', label: 'Go to Gate History', section: 'Views', icon: 'ph-clock-counter-clockwise', hint: '' },
    { id: 'goContacts', label: 'Go to Contacts', section: 'Views', icon: 'ph-users', hint: '⌘5' },
    { id: 'goCalendar', label: 'Go to Calendar', section: 'Views', icon: 'ph-calendar', hint: '⌘6' },
    { id: 'goFiles', label: 'Go to Files', section: 'Views', icon: 'ph-files', hint: '⌘7' },
    { id: 'goDrafts', label: 'Go to Drafts', section: 'Views', icon: 'ph-pencil-simple', hint: '' },
    { id: 'openAgent', label: 'Open SendPalm Agent', section: 'Actions', icon: 'ph-sparkle', hint: '' },
    { id: 'markRead', label: 'Mark all notifications read', section: 'Actions', icon: 'ph-check', hint: '' },
  ];

  function renderCommandPalette() {
    const palette = document.getElementById('command-palette');
    palette.innerHTML = '';

    const windowEl = el('div', 'command-palette-window');
    const inputWrap = el('div', 'command-palette-input-wrap');
    inputWrap.appendChild(icon('ph-magnifying-glass'));
    const input = el('input', 'command-palette-input');
    input.placeholder = 'Search commands or jump to...';
    inputWrap.appendChild(input);
    windowEl.appendChild(inputWrap);

    const list = el('div', 'command-palette-list');
    let filtered = commands.slice();
    let selectedIndex = 0;

    function renderList(query) {
      list.innerHTML = '';
      const q = query.toLowerCase().trim();
      filtered = q ? commands.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q)
      ) : commands.slice();
      selectedIndex = 0;

      if (filtered.length === 0) {
        list.appendChild(el('div', 'command-palette-empty', 'No commands found'));
        return;
      }

      const sections = {};
      filtered.forEach((c, i) => {
        if (!sections[c.section]) sections[c.section] = [];
        sections[c.section].push({ cmd: c, index: i });
      });

      Object.keys(sections).forEach(section => {
        list.appendChild(el('div', 'command-palette-section', section));
        sections[section].forEach(({ cmd, index }) => {
          const item = el('div', 'command-palette-item' + (index === selectedIndex ? ' selected' : ''));
          item.appendChild(icon(cmd.icon));
          item.appendChild(el('span', 'command-palette-label', cmd.label));
          if (cmd.hint) item.appendChild(el('span', 'command-palette-hint', cmd.hint));
          item.addEventListener('click', () => { executeCommand(cmd.id); closeCommandPalette(); });
          item.addEventListener('mouseenter', () => { selectedIndex = index; updateSelection(); });
          list.appendChild(item);
        });
      });
    }

    function updateSelection() {
      const items = list.querySelectorAll('.command-palette-item');
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedIndex);
        if (i === selectedIndex) item.scrollIntoView({ block: 'nearest' });
      });
    }

    input.addEventListener('input', (e) => renderList(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1); updateSelection(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateSelection(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) { executeCommand(filtered[selectedIndex].id); closeCommandPalette(); }
      }
    });

    palette.appendChild(windowEl);
    renderList('');

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function openCommandPalette() {
    const palette = document.getElementById('command-palette');
    palette.classList.remove('hidden');
    requestAnimationFrame(() => palette.classList.add('open'));
    renderCommandPalette();
  }

  function closeCommandPalette() {
    const palette = document.getElementById('command-palette');
    palette.classList.remove('open');
    setTimeout(() => palette.classList.add('hidden'), 200);
  }

  function showShortcutsCheatsheet() {
    const existing = document.getElementById('shortcuts-cheatsheet');
    if (existing) { existing.remove(); return; }

    const overlay = el('div', 'shortcuts-overlay');
    overlay.id = 'shortcuts-cheatsheet';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const card = el('div', 'shortcuts-card');
    const header = el('div', 'shortcuts-header');
    header.appendChild(el('h2', '', 'Keyboard shortcuts'));
    const closeBtn = el('button', 'icon-btn');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    card.appendChild(header);

    const groups = [
      {
        title: 'Navigation',
        items: [
          { key: 'Cmd + 1 – 9', label: 'Gate / Inbox / Stream / Records / Contacts / Calendar / Files / Insights / Agent' },
          { key: 'j / k', label: 'Next / previous email' },
          { key: 'Enter', label: 'Open selected email' },
          { key: 'Esc', label: 'Close panel or overlay' },
        ]
      },
      {
        title: 'Calendar',
        items: [
          { key: 'd', label: 'Day view' },
          { key: 'w', label: 'Week view' },
          { key: 'y', label: 'Year view' },
          { key: 't', label: 'Jump to today' },
          { key: '← / →', label: 'Previous / next day' },
        ]
      },
      {
        title: 'Actions',
        items: [
          { key: 'Cmd + n', label: 'New message' },
          { key: 'r', label: 'Open / reply to selected' },
          { key: 'e', label: 'Archive' },
          { key: 'l', label: 'Move to Pending' },
          { key: 's', label: 'Save' },
          { key: 'b', label: 'Remind tomorrow' },
          { key: 'u', label: 'Toggle read / unread' },
          { key: '#', label: 'Move to Trash' },
          { key: '!', label: 'Mark as spam' },
          { key: 'x', label: 'Select / deselect' },
          { key: ';', label: 'Bulk actions' },
        ]
      },
      {
        title: 'General',
        items: [
          { key: 'Cmd + k', label: 'Command palette' },
          { key: '/', label: 'Search' },
          { key: '?', label: 'This cheatsheet' },
        ]
      }
    ];

    const body = el('div', 'shortcuts-body');
    groups.forEach(g => {
      const section = el('div', 'shortcuts-section');
      section.appendChild(el('h3', '', g.title));
      g.items.forEach(item => {
        const row = el('div', 'shortcuts-row');
        row.appendChild(el('kbd', 'shortcut-key', item.key));
        row.appendChild(el('span', 'shortcut-label', item.label));
        section.appendChild(row);
      });
      body.appendChild(section);
    });
    card.appendChild(body);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  function executeCommand(id) {
    if (id === 'compose') openCompose();
    if (id === 'search') {
      const searchInput = document.querySelector('.topbar-search input');
      if (searchInput) searchInput.focus();
    }
    if (id === 'goImbox') setView('imbox');
    if (id === 'goFeed') setView('feed');
    if (id === 'goPaperTrail') setView('paperTrail');
    if (id === 'goScreener') setView('screener');
    if (id === 'goScreenerHistory') setView('screenerHistory');
    if (id === 'goContacts') setView('contacts');
    if (id === 'goCalendar') setView('calendar');
    if (id === 'goFiles') setView('files');
    if (id === 'goDrafts') setView('drafts');
    if (id === 'openAgent') { if (!state.agentOpen) toggleAgent(); }
    if (id === 'markRead') { D.notifications.forEach(n => n.read = true); renderNav(); renderNotifications(); showToast('All notifications marked read'); }
  }

  function showContextMenuForMessage(e, m) {
    e.preventDefault();
    const contact = getContact(m.pid);
    const isTrash = m.trashed;
    const isSpam = m.spam;
    const items = [];
    if (isTrash || isSpam) {
      items.push({ label: 'Restore', icon: 'ph-arrow-u-up-left', hint: 'r', action: () => restoreMessageFromTrash(m) });
      items.push({ type: 'divider' });
      items.push({ label: isTrash ? 'Delete forever' : 'Move to Trash', icon: 'ph-trash', hint: isTrash ? '' : '#', action: () => { if (isTrash) { m.permanentlyDeleted = true; showToast('Deleted forever'); renderMain(); } else trashMessage(m); } });
    } else {
      items.push({ label: 'Reply', icon: 'ph-arrow-u-up-left', hint: 'r', action: () => { openMessage(m); showToast('Reply to ' + (contact ? contact.name : '')); } });
      items.push({ label: 'Reply all', icon: 'ph-arrows-out-line-horizontal', action: () => showToast('Reply all to thread') });
      items.push({ type: 'divider' });
      items.push({ label: 'Pending', icon: 'ph-clock', hint: 'l', action: () => replyLaterMessage(m) });
      items.push({ label: 'Saved', icon: 'ph-push-pin', hint: 's', action: () => setAsideMessage(m) });
      items.push({ label: 'Remind...', icon: 'ph-arrow-fat-line-up', hint: 'b', action: () => bubbleUpMessage(m, 'tomorrow') });
      items.push({ label: 'Mark as ' + (m.seen ? 'unread' : 'read'), icon: m.seen ? 'ph-eye-slash' : 'ph-eye', action: () => { toggleUnreadMessage(m); renderMain(); } });
      items.push({ type: 'divider' });
      items.push({ label: 'Move to Inbox', icon: 'ph-tray', action: () => moveMessageToBucket(m, 'imbox') });
      items.push({ label: 'Move to Stream', icon: 'ph-newspaper', action: () => moveMessageToBucket(m, 'feed') });
      items.push({ label: 'Move to Records', icon: 'ph-receipt', action: () => moveMessageToBucket(m, 'paperTrail') });
      items.push({ type: 'divider' });
      items.push({ label: 'Mark as spam', icon: 'ph-warning-circle', hint: '!', action: () => spamMessage(m) });
      items.push({ label: 'Move to Trash', icon: 'ph-trash', hint: '#', action: () => trashMessage(m) });
    }
    items.push({ type: 'divider' });
    items.push({ label: contact && contact.blocked ? 'Unblock sender' : 'Block sender', icon: 'ph-prohibit', action: () => { if (contact) { contact.blocked = !contact.blocked; renderMain(); showToast(contact.blocked ? 'Sender blocked' : 'Sender unblocked'); } } });
    openContextMenu(e.clientX, e.clientY, items);
  }

  function openContextMenu(x, y, items) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    menu.classList.remove('hidden');

    items.forEach(item => {
      if (item.type === 'divider') {
        menu.appendChild(el('div', 'context-menu-divider'));
      } else {
        const btn = el('button', 'context-menu-item');
        if (item.icon) btn.appendChild(icon(item.icon));
        const textWrap = el('div', 'context-menu-text');
        textWrap.appendChild(el('div', 'context-menu-label', item.label));
        if (item.sub) textWrap.appendChild(el('div', 'context-menu-sub', item.sub));
        btn.appendChild(textWrap);
        if (item.hint) {
          const hint = el('span', 'context-menu-hint', item.hint);
          btn.appendChild(hint);
        }
        btn.addEventListener('click', () => { closeContextMenu(); item.action(); });
        menu.appendChild(btn);
      }
    });

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let left = x;
      let top = y;
      if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8;
      if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.classList.add('open');
    });
  }

  function openContextMenuFromElement(element, items) {
    const rect = element.getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom + 4, items);
  }

  function closeContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.classList.remove('open');
    setTimeout(() => menu.classList.add('hidden'), 120);
  }

  function initDropBar() {
    const dropBar = document.getElementById('drop-bar');
    if (!dropBar) return;
    const zones = dropBar.querySelectorAll('.drop-zone');
    zones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const msgId = e.dataTransfer.getData('text/plain');
        const m = D._msgs.find(x => x.id === msgId);
        if (!m) return;
        const bucket = zone.dataset.bucket;
        const workflow = zone.dataset.workflow;
        if (bucket) {
          if (bucket === 'trash') trashMessage(m);
          else if (bucket === 'spam') spamMessage(m);
          else moveMessageToBucket(m, bucket);
        } else if (workflow === 'pending') {
          replyLaterMessage(m);
        } else if (workflow === 'saved') {
          setAsideMessage(m);
        } else if (workflow === 'remind') {
          bubbleUpMessage(m, 'tomorrow');
        }
        hideDropBar();
      });
    });
  }

  function showDropBar() {
    const dropBar = document.getElementById('drop-bar');
    if (!dropBar) return;
    dropBar.classList.remove('hidden');
    requestAnimationFrame(() => dropBar.classList.add('open'));
  }

  function hideDropBar() {
    const dropBar = document.getElementById('drop-bar');
    if (!dropBar) return;
    dropBar.classList.remove('open');
    setTimeout(() => dropBar.classList.add('hidden'), 200);
  }

  document.addEventListener('DOMContentLoaded', () => {
    D._msgs.forEach((m, idx) => { if (!m.id) m.id = 'msg-' + idx; });

    const hash = (window.location.hash || '').replace('#', '');
    if (hash === 'calendar' || hash === 'day' || hash === 'week' || hash === 'year') {
      state.view = 'calendar';
      if (hash === 'day') state.calendarView = 'day';
      if (hash === 'week') state.calendarView = 'week';
      if (hash === 'year') state.calendarView = 'year';
    }

    renderNav();
    renderTopBar();
    renderMain();
    renderAgentFab();
    renderAgentPanel();
    renderNotifications();
    initDropBar();

    setTimeout(() => {
      state.loading = false;
      renderMain();
    }, 450);

    document.querySelector('.traffic-close')?.addEventListener('click', () => showToast('Close window'));
    document.querySelector('.traffic-minimize')?.addEventListener('click', () => showToast('Minimize window'));
    document.querySelector('.traffic-zoom')?.addEventListener('click', () => showToast('Maximize window'));

    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if (e.key === 'Escape') {
        if (state.onboardingStep !== null) {
          skipOnboarding();
          return;
        }
        const palette = document.getElementById('command-palette');
        const menu = document.getElementById('context-menu');
        if (palette.classList.contains('open')) closeCommandPalette();
        else if (menu.classList.contains('open')) closeContextMenu();
        else if (state.composeOpen) closeCompose();
        else if (state.notificationsOpen) toggleNotifications();
        else if (state.agentOpen) toggleAgent();
        else if (!document.getElementById('detail-panel').classList.contains('hidden')) closePanel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        openCompose();
      }
      if (!isTyping && state.view === 'calendar' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'd') { e.preventDefault(); state.calendarView = 'day'; renderMain(); }
        else if (e.key === 'w') { e.preventDefault(); state.calendarView = 'week'; renderMain(); }
        else if (e.key === 'y') { e.preventDefault(); state.calendarView = 'year'; renderMain(); }
        else if (e.key === 't') { e.preventDefault(); goToToday(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); changeSelectedDate(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); changeSelectedDate(1); }
      }
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        showShortcutsCheatsheet();
      }
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        state.searchOpen = true;
        renderTopBar();
        renderMain();
        const input = document.querySelector('.topbar-search input');
        if (input) input.focus();
      }
      if (e.metaKey || e.ctrlKey) {
        const viewShortcuts = {
          '1': 'screener',
          '2': 'imbox',
          '3': 'feed',
          '4': 'paperTrail',
          '5': 'contacts',
          '6': 'calendar',
          '7': 'files',
          '8': 'insights',
          '9': 'agent',
        };
        if (viewShortcuts[e.key]) {
          e.preventDefault();
          setView(viewShortcuts[e.key]);
        }
      }

      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const listViews = ['imbox', 'feed', 'paperTrail', 'replyLater', 'setAside', 'bubbleUp'];
        const isOverlayOpen = () => {
          if (state.focusReplyOpen || state.composeOpen || state.agentOpen || state.notificationsOpen) return true;
          const palette = document.getElementById('command-palette');
          const menu = document.getElementById('context-menu');
          if (palette && palette.classList.contains('open')) return true;
          if (menu && menu.classList.contains('open')) return true;
          return false;
        };

        if (listViews.includes(state.view) && !isOverlayOpen()) {
          const events = getCurrentViewEvents();
          if (events.length > 0) {
            if (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const down = e.key === 'j' || e.key === 'ArrowDown';
              if (down) {
                state.cursorIndex = state.cursorIndex < 0 ? 0 : Math.min(state.cursorIndex + 1, events.length - 1);
              } else {
                state.cursorIndex = state.cursorIndex < 0 ? events.length - 1 : Math.max(state.cursorIndex - 1, 0);
              }
              renderMain();
              scrollCursorIntoView();
            } else if (e.key === 'x') {
              e.preventDefault();
              if (state.cursorIndex < 0) state.cursorIndex = 0;
              const ev = events[state.cursorIndex];
              if (ev && ev.data && ev.data.id) {
                if (state.selectedIds.has(ev.data.id)) state.selectedIds.delete(ev.data.id);
                else state.selectedIds.add(ev.data.id);
                renderMain();
                scrollCursorIntoView();
              }
            } else if (e.key === ';') {
              e.preventDefault();
              openBulkActionsMenu();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const ev = events[state.cursorIndex];
              if (ev) {
                if (ev.type === 'message') openMessage(ev.data);
                else if (ev.type === 'meeting') openMeeting(ev.data);
              }
            } else if (e.key === 'e' || e.key === 'r' || e.key === 'l' || e.key === 's' || e.key === 'b' || e.key === 'u' || e.key === '#' || e.key === '!') {
              e.preventDefault();
              if (state.cursorIndex < 0) state.cursorIndex = 0;
              const ev = events[state.cursorIndex];
              if (ev && ev.type === 'message') {
                const msg = ev.data;
                if (e.key === 'e') archiveMessage(msg);
                else if (e.key === 'r') openMessage(msg);
                else if (e.key === 'l') replyLaterMessage(msg);
                else if (e.key === 's') setAsideMessage(msg);
                else if (e.key === 'b') bubbleUpMessage(msg, 'tomorrow');
                else if (e.key === 'u') toggleUnreadMessage(msg);
                else if (e.key === '#') trashMessage(msg);
                else if (e.key === '!') spamMessage(msg);
              }
            }
          }
        }
      }
    });

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('context-menu');
      if (menu.classList.contains('open') && !menu.contains(e.target)) closeContextMenu();
    });

    document.getElementById('command-palette').addEventListener('click', (e) => {
      if (e.target.id === 'command-palette') closeCommandPalette();
    });
  });
})();
