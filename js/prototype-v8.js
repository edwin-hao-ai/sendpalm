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
    calendarMonth: new Date(2026, 6, 1),
    calendarSelected: new Date(2026, 6, 20),
    filesFilter: 'all',
    selectedFileId: null,
    prepChecked: {},
    settings: JSON.parse(JSON.stringify(D.appSettings)),
    feedOffset: 0,
    feedPageSize: 20,
    messageViewMode: 'rendered',
    expandedThreadMessages: new Set(),
    searchOpen: false,
  };

  const navSections = [
    {
      label: 'Mail',
      items: [
        { id: 'imbox', label: 'Imbox', icon: 'ph-tray' },
        { id: 'feed', label: 'The Feed', icon: 'ph-newspaper' },
        { id: 'paperTrail', label: 'Paper Trail', icon: 'ph-receipt' },
        { id: 'screener', label: 'Screener', icon: 'ph-funnel' },
      ]
    },
    {
      label: 'Workflow',
      items: [
        { id: 'replyLater', label: 'Reply Later', icon: 'ph-clock' },
        { id: 'setAside', label: 'Set Aside', icon: 'ph-push-pin' },
        { id: 'bubbleUp', label: 'Bubble Up', icon: 'ph-arrow-fat-line-up' },
      ]
    },
    {
      label: 'More',
      items: [
        { id: 'contacts', label: 'Contacts', icon: 'ph-users' },
        { id: 'calendar', label: 'Calendar', icon: 'ph-calendar' },
        { id: 'files', label: 'Files', icon: 'ph-files' },
        { id: 'drafts', label: 'Drafts', icon: 'ph-pencil-simple' },
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

  function wrapSwipeActions(card, leftAction, rightAction) {
    const wrap = el('div', 'feed-card-swipe-wrap');
    const leftBg = el('div', 'swipe-bg swipe-bg-left');
    leftBg.appendChild(icon('ph-clock'));
    leftBg.appendChild(el('span', '', 'Snooze'));
    const rightBg = el('div', 'swipe-bg swipe-bg-right');
    rightBg.appendChild(icon('ph-archive'));
    rightBg.appendChild(el('span', '', 'Archive'));

    wrap.appendChild(leftBg);
    wrap.appendChild(rightBg);
    wrap.appendChild(card);

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let moved = false;
    const threshold = 80;
    const maxDrag = 140;

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
      if (Math.abs(currentX) > 8) moved = true;
      const clamped = Math.max(-maxDrag, Math.min(maxDrag, currentX));
      card.style.transform = 'translateX(' + clamped + 'px)';
      if (clamped > 0) {
        rightBg.style.opacity = Math.min(clamped / threshold, 1);
        leftBg.style.opacity = 0;
      } else {
        leftBg.style.opacity = Math.min(Math.abs(clamped) / threshold, 1);
        rightBg.style.opacity = 0;
      }
    }

    function end() {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = 'transform 0.2s var(--ease-out)';
      if (currentX > threshold) {
        card.style.transform = 'translateX(100%)';
        wrap.style.height = wrap.offsetHeight + 'px';
        setTimeout(() => wrap.classList.add('removing'), 10);
        setTimeout(() => { if (rightAction) rightAction(); }, 280);
      } else if (currentX < -threshold) {
        card.style.transform = 'translateX(-100%)';
        wrap.style.height = wrap.offsetHeight + 'px';
        setTimeout(() => wrap.classList.add('removing'), 10);
        setTimeout(() => { if (leftAction) leftAction(); }, 280);
      } else {
        card.style.transform = 'translateX(0)';
        leftBg.style.opacity = 0;
        rightBg.style.opacity = 0;
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

  function renderEmpty(text, iconName) {
    const wrap = el('div', 'empty-state');
    if (iconName) {
      const i = el('i', 'ph ' + iconName);
      i.style.fontSize = '32px';
      i.style.marginBottom = '12px';
      i.style.color = 'var(--text-muted)';
      wrap.appendChild(i);
    }
    wrap.appendChild(el('span', '', text));
    return wrap;
  }

  function setView(view) {
    state.view = view;
    renderNav();
    renderTopBar();
    renderMain();
  }

  function renderNav() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';

    const composeBtn = el('button', 'sidebar-compose-btn');
    composeBtn.appendChild(icon('ph-pencil-simple'));
    composeBtn.appendChild(el('span', '', 'New message'));
    composeBtn.addEventListener('click', openCompose);
    sidebar.appendChild(composeBtn);

    navSections.forEach(section => {
      const sectionEl = el('div', 'nav-section');
      const sectionLabel = el('div', 'nav-section-label', section.label);
      sectionEl.appendChild(sectionLabel);

      section.items.forEach(item => {
        const btn = el('button', 'nav-item' + (state.view === item.id ? ' active' : ''));
        btn.appendChild(icon(item.icon));
        const labelWrap = el('div', 'nav-label-wrap');
        labelWrap.appendChild(el('span', 'nav-label', item.label));
        if (item.id === 'drafts' && D.agentDrafts.length > 0) {
          const badge = el('span', 'nav-badge', D.agentDrafts.length);
          labelWrap.appendChild(badge);
        }
        btn.appendChild(labelWrap);
        btn.addEventListener('click', () => setView(item.id));
        sectionEl.appendChild(btn);
      });

      sidebar.appendChild(sectionEl);
    });

    const settings = el('button', 'nav-item nav-bottom' + (state.view === 'settings' ? ' active' : ''));
    settings.appendChild(icon('ph-gear'));
    settings.appendChild(el('span', 'nav-label', 'Settings'));
    settings.addEventListener('click', () => setView('settings'));
    sidebar.appendChild(settings);
  }

  function renderTopBar() {
    const topbar = document.getElementById('topbar');
    topbar.innerHTML = '';

    const left = el('div', 'topbar-left');
    const searchToggle = el('button', 'icon-btn topbar-search-toggle');
    searchToggle.title = state.searchOpen ? 'Close search' : 'Search';
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
      });
      searchWrap.appendChild(icon('ph-magnifying-glass'));
      searchWrap.appendChild(searchInput);
      center.appendChild(searchWrap);
    } else {
      const title = el('span', 'topbar-title', viewTitle(state.view));
      center.appendChild(title);
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
      openContextMenuFromElement(avatarBtn, [
        { label: 'Profile', action: () => showToast('Profile opened') },
        { label: 'Settings', action: () => setView('settings') },
        { type: 'divider' },
        { label: 'Sign out', action: () => showToast('Signed out') },
      ]);
    });
    right.appendChild(avatarBtn);

    topbar.appendChild(left);
    topbar.appendChild(center);
    topbar.appendChild(right);
  }

  function viewTitle(view) {
    const map = {
      imbox: 'Imbox',
      feed: 'The Feed',
      paperTrail: 'Paper Trail',
      screener: 'Screener',
      screenerHistory: 'Screener History',
      replyLater: 'Reply Later',
      setAside: 'Set Aside',
      bubbleUp: 'Bubble Up',
      contacts: 'Contacts',
      calendar: 'Calendar',
      files: 'Files',
      drafts: 'Drafts',
      settings: 'Settings',
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
    m.archived = true;
    showToast('Archived');
    renderMain();
  }

  function snoozeMessage(m) {
    m.snoozed = true;
    showToast('Snoozed until tomorrow');
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
    m.bucket = bucket;
    m.replyLater = false;
    m.setAside = false;
    m.bubbleUpUntil = null;
    showToast('Moved to ' + bucket);
    renderMain();
  }

  function replyLaterMessage(m) {
    clearWorkflowFlags(m);
    m.replyLater = true;
    showToast('Added to Reply Later');
    renderMain();
  }

  function setAsideMessage(m) {
    clearWorkflowFlags(m);
    m.setAside = true;
    showToast('Set Aside');
    renderMain();
  }

  function bubbleUpMessage(m, duration) {
    clearWorkflowFlags(m);
    const until = new Date();
    if (duration === 'later') until.setHours(until.getHours() + 4);
    else if (duration === 'tomorrow') until.setDate(until.getDate() + 1);
    else if (duration === 'week') until.setDate(until.getDate() + 7);
    else until.setDate(until.getDate() + 1);
    m.bubbleUpUntil = until.toISOString();
    showToast('Bubbled up until ' + until.toLocaleDateString());
    renderMain();
  }

  function clearWorkflowFlags(m) {
    m.replyLater = false;
    m.setAside = false;
    m.bubbleUpUntil = null;
  }

  function renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    const bucketViews = ['feed', 'paperTrail', 'screener', 'replyLater', 'setAside', 'bubbleUp'];
    if (state.view === 'imbox') {
      main.appendChild(renderImbox());
    } else if (bucketViews.includes(state.view)) {
      main.appendChild(renderBucket(state.view));
    } else if (state.view === 'screenerHistory') {
      main.appendChild(renderScreenerHistory());
    } else if (state.view === 'contacts') {
      main.appendChild(renderPeople());
    } else if (state.view === 'calendar') {
      main.appendChild(renderCalendar());
    } else if (state.view === 'files') {
      main.appendChild(renderFiles());
    } else if (state.view === 'drafts') {
      main.appendChild(renderDrafts());
    } else if (state.view === 'settings') {
      main.appendChild(renderSettings());
    } else {
      main.innerHTML = '<div class="view-placeholder">' + viewTitle(state.view) + '</div>';
    }
  }

  function isInBucketView(ev, view) {
    if (ev.type === 'meeting') return view === 'imbox';
    const m = ev.data;
    const contact = getContact(m.pid);
    if (contact && contact.blocked) return false;
    if (m.blocked) return false;

    switch (view) {
      case 'imbox':
        return m.bucket === 'imbox' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened;
      case 'feed':
        return m.bucket === 'feed' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened;
      case 'paperTrail':
        return m.bucket === 'paperTrail' && !m.replyLater && !m.setAside && !m.bubbleUpUntil && m.screened;
      case 'screener':
        return contact && contact.firstSeen && !contact.screened;
      case 'replyLater':
        return m.replyLater === true;
      case 'setAside':
        return m.setAside === true;
      case 'bubbleUp':
        return m.bubbleUpUntil && new Date(m.bubbleUpUntil).getTime() > Date.now();
      default:
        return false;
    }
  }

  function bucketEmptyCopy(view) {
    const map = {
      imbox: 'Your Imbox is empty. Important conversations appear here.',
      feed: 'The Feed is empty. Newsletters and bulk reads land here.',
      paperTrail: 'Paper Trail is empty. Receipts and notifications go here.',
      screener: 'No new senders to screen. Everything is tidy.',
      replyLater: 'Reply Later is empty. Emails you need to reply to will wait here.',
      setAside: 'Set Aside is empty. Park emails here to handle later.',
      bubbleUp: 'Nothing bubbled up. Snoozed emails resurface here.',
    };
    return map[view] || 'Nothing here.';
  }

  function renderBucket(view) {
    const container = el('div', 'view bucket-view');
    const allEvents = buildFeed();
    const filteredEvents = filterFeedEvents(allEvents).filter(e => isInBucketView(e, view));

    const list = el('div', 'feed-list');

    if (view === 'screener') {
      list.appendChild(renderSectionHeader('First-time senders', 'View history', () => setView('screenerHistory')));
    }

    if (filteredEvents.length === 0) {
      list.appendChild(renderEmpty(bucketEmptyCopy(view), 'ph-inbox'));
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
      paged.forEach(ev => list.appendChild(renderFeedItem(ev, view)));

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

  function renderSectionHeader(title, actionLabel, action) {
    const header = el('div', 'feed-section-header');
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

  function renderImboxPile(events, title, iconName) {
    const pile = el('div', 'imbox-pile');
    const header = el('div', 'imbox-pile-header');
    header.appendChild(icon(iconName));
    header.appendChild(el('span', '', title));
    header.appendChild(el('span', 'imbox-pile-count', events.length));
    pile.appendChild(header);
    header.addEventListener('click', () => {
      if (title === 'Reply Later') setView('replyLater');
      else if (title === 'Set Aside') setView('setAside');
    });
    events.slice(0, 3).forEach(ev => {
      const row = el('div', 'imbox-pile-row');
      const m = ev.data;
      const contact = getContact(m.pid);
      row.appendChild(renderAvatar(contact, 'imbox-pile-avatar', contact ? contact.name[0] : '?'));
      const body = el('div', 'imbox-pile-body');
      body.appendChild(el('div', 'imbox-pile-subj', m.subj));
      body.appendChild(el('div', 'imbox-pile-from', contact ? contact.name : m.fm));
      row.appendChild(body);
      row.addEventListener('click', (e) => { e.stopPropagation(); openMessage(m); });
      pile.appendChild(row);
    });
    if (events.length > 3) {
      const more = el('div', 'imbox-pile-more', '+' + (events.length - 3) + ' more');
      more.addEventListener('click', () => {
        if (title === 'Reply Later') setView('replyLater');
        else if (title === 'Set Aside') setView('setAside');
      });
      pile.appendChild(more);
    }
    return pile;
  }

  function renderScreenerHistory() {
    const container = el('div', 'view screener-history-view');
    container.appendChild(el('h1', 'view-main-title', 'Screener History'));

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
    const allEvents = filterFeedEvents(buildFeed());

    // Bubble Up banner
    const bubbled = allEvents.filter(e => isInBucketView(e, 'bubbleUp'));
    if (bubbled.length) {
      const banner = el('div', 'bubble-up-banner');
      banner.appendChild(icon('ph-arrow-fat-line-up'));
      const bannerBody = el('div', 'bubble-up-body');
      bannerBody.appendChild(el('div', 'bubble-up-title', bubbled.length + ' bubbled up'));
      bannerBody.appendChild(el('div', 'bubble-up-subtitle', 'Back at the top of your Imbox'));
      banner.appendChild(bannerBody);
      banner.addEventListener('click', () => setView('bubbleUp'));
      container.appendChild(banner);
    }

    const isImboxMsg = (e) => e.type === 'message' && e.data.bucket === 'imbox' && !e.data.replyLater && !e.data.setAside && !e.data.bubbleUpUntil && e.data.screened;
    const newForYou = allEvents.filter(e => isImboxMsg(e) && !e.data.seen);
    const previouslySeen = allEvents.filter(e => isImboxMsg(e) && e.data.seen);
    const replyLater = allEvents.filter(e => isInBucketView(e, 'replyLater'));
    const setAside = allEvents.filter(e => isInBucketView(e, 'setAside'));

    if (newForYou.length === 0 && previouslySeen.length === 0 && replyLater.length === 0 && setAside.length === 0) {
      container.appendChild(renderEmpty('Your Imbox is empty. Important conversations appear here.', 'ph-inbox'));
      return container;
    }

    const list = el('div', 'feed-list');

    if (newForYou.length) {
      list.appendChild(renderSectionHeader('New For You', 'Read Together', () => showToast('Read Together mode')));
      newForYou.sort((a, b) => priorityScore(b) - priorityScore(a));
      newForYou.forEach(ev => list.appendChild(renderFeedItem(ev, 'imbox')));
    }

    if (previouslySeen.length) {
      list.appendChild(renderSectionHeader('Previously Seen'));
      previouslySeen.sort((a, b) => b.sortKey - a.sortKey);
      previouslySeen.forEach(ev => list.appendChild(renderFeedItem(ev, 'imbox')));
    }

    container.appendChild(list);

    if (replyLater.length || setAside.length) {
      const piles = el('div', 'imbox-piles');
      if (replyLater.length) piles.appendChild(renderImboxPile(replyLater, 'Reply Later', 'ph-clock'));
      if (setAside.length) piles.appendChild(renderImboxPile(setAside, 'Set Aside', 'ph-push-pin'));
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
    container.appendChild(filterBar);

    const grid = el('div', 'people-grid');
    const contacts = filterContacts(D.contacts);

    if (contacts.length === 0) {
      grid.appendChild(renderEmpty('No contacts match this filter.', 'ph-users'));
    } else {
      contacts.forEach(c => grid.appendChild(renderPersonCard(c)));
    }

    container.appendChild(grid);
    return container;
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
    return result;
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

  function renderAvatar(contact, className, text) {
    if (contact && contact.photo) {
      const img = document.createElement('img');
      img.className = className;
      img.src = contact.photo;
      img.alt = contact.name || text || '';
      img.loading = 'lazy';
      img.onerror = function() {
        this.onerror = null;
        this.style.display = 'none';
        const fallback = el('div', className, text);
        fallback.style.background = avatarGradientFor(contact.name);
        this.parentNode.replaceChild(fallback, this);
      };
      return img;
    }
    const fallback = el('div', className, text);
    if (contact) fallback.style.background = avatarGradientFor(contact.name);
    else fallback.style.background = '#999';
    return fallback;
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

    const avatar = renderAvatar(c, 'person-avatar', c.name[0]);

    const body = el('div', 'person-body');
    const top = el('div', 'person-top');
    top.appendChild(el('span', 'person-name', c.name));
    const scoreWrap = el('span', 'person-score');
    scoreWrap.appendChild(icon(trendIcon(c.trd)));
    scoreWrap.appendChild(el('span', '', c.sc));
    scoreWrap.style.color = c.scC;
    top.appendChild(scoreWrap);

    const meta = el('div', 'person-meta');
    meta.appendChild(el('span', 'person-co', c.co));
    meta.appendChild(el('span', 'person-role', c.tl));

    const bottom = el('div', 'person-bottom');
    const last = el('span', 'person-last');
    last.appendChild(icon(statusIconFor(c.grp)));
    last.appendChild(el('span', '', c.lc));
    last.style.color = statusColorFor(c.grp);
    bottom.appendChild(last);
    const topic = el('span', 'person-topic', c.topics.slice(0, 2).join(' · '));
    bottom.appendChild(topic);

    body.appendChild(top);
    body.appendChild(meta);
    body.appendChild(bottom);

    card.appendChild(avatar);
    card.appendChild(body);
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

  function openDetailPanel(content) {
    const app = document.getElementById('app');
    const panel = document.getElementById('detail-panel');
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    panel.classList.add('open');
    app.classList.add('detail-open');
    panel.appendChild(content);
  }

  function closePanel() {
    const app = document.getElementById('app');
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('open');
    app.classList.remove('detail-open');
    setTimeout(() => {
      panel.classList.add('hidden');
      state.selectedContactId = null;
      state.selectedMessageId = null;
      state.selectedMeetingId = null;
      state.selectedFileId = null;
    }, 400);
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
    const wrapper = el('div', 'panel-wrapper');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const avatar = renderAvatar(c, 'panel-avatar', c.name[0]);

    const info = el('div', 'panel-info');
    info.appendChild(el('div', 'panel-name', c.name));
    info.appendChild(el('div', 'panel-role', c.tl + ' · ' + c.co));

    const emailBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    emailBtn.appendChild(icon('ph-envelope-simple'));
    emailBtn.title = 'Send email';
    emailBtn.addEventListener('click', () => openCompose({ to: c.name, subject: '' }));

    const downloadBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    downloadBtn.appendChild(icon('ph-download-simple'));
    downloadBtn.title = 'Download Markdown';
    downloadBtn.addEventListener('click', () => downloadContactMarkdown(c));

    const headerActions = el('div', 'panel-actions');
    headerActions.appendChild(emailBtn);
    headerActions.appendChild(downloadBtn);

    header.appendChild(closeBtn);
    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(headerActions);
    wrapper.appendChild(header);

    const content = el('div', 'panel-content');
    content.appendChild(renderContactRouting(c));
    content.appendChild(renderContactProfileCard(c));
    content.appendChild(renderContactTopics(c));
    content.appendChild(renderContactUpcoming(c));
    content.appendChild(renderContactNotes(c));
    content.appendChild(renderContactThreads(c));
    content.appendChild(renderContactActivity(c));
    content.appendChild(renderContactFiles(c));
    wrapper.appendChild(content);

    return wrapper;
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
      { value: 'imbox', label: 'Imbox' },
      { value: 'feed', label: 'The Feed' },
      { value: 'paperTrail', label: 'Paper Trail' },
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
    section.appendChild(renderContactSection('All Threads'));

    const msgs = D.getMsgs(c.id).slice(0, 6);
    if (msgs.length === 0) {
      section.appendChild(el('div', 'contact-notes-empty', 'No threads yet.'));
      return section;
    }

    const list = el('div', 'contact-thread-list');
    msgs.forEach(m => {
      const row = el('div', 'contact-thread-row');
      row.appendChild(el('div', 'contact-thread-subj', m.subj));
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
    const section = el('div', 'contact-section');
    const header = el('div', 'contact-section-header');
    header.appendChild(el('div', 'contact-section-title', 'Notes'));
    const editBtn = el('button', 'icon-btn');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.title = 'Edit note';
    editBtn.addEventListener('click', () => addContactNote(c));
    header.appendChild(editBtn);
    section.appendChild(header);

    if (c.notes) {
      section.appendChild(el('div', 'contact-notes', c.notes));
    } else {
      section.appendChild(el('div', 'contact-notes-empty', 'No notes yet. Click edit to add one.'));
    }
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

  function formatDateLabel(d) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return weekdays[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
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

  function renderCalendar() {
    const container = el('div', 'view calendar-view');
    const filteredMeetings = filterMeetings(D._meetings);

    const monthWrap = el('div', 'calendar-month-wrap');
    const header = el('div', 'calendar-header');
    const label = el('div', 'calendar-month-label');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = months[state.calendarMonth.getMonth()] + ' ' + state.calendarMonth.getFullYear();

    const nav = el('div', 'calendar-nav');
    const prevBtn = el('button', '');
    prevBtn.appendChild(icon('ph-caret-left'));
    prevBtn.addEventListener('click', () => {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
      renderMain();
    });
    const nextBtn = el('button', '');
    nextBtn.appendChild(icon('ph-caret-right'));
    nextBtn.addEventListener('click', () => {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
      renderMain();
    });
    const todayBtn = el('button', '');
    todayBtn.title = 'Today';
    todayBtn.appendChild(icon('ph-calendar-blank'));
    todayBtn.addEventListener('click', () => {
      state.calendarMonth = new Date(2026, 6, 1);
      state.calendarSelected = new Date(2026, 6, 20);
      renderMain();
    });
    nav.appendChild(prevBtn);
    nav.appendChild(todayBtn);
    nav.appendChild(nextBtn);

    header.appendChild(label);
    header.appendChild(nav);
    monthWrap.appendChild(header);

    const weekdays = el('div', 'calendar-weekdays');
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(w => {
      weekdays.appendChild(el('div', 'calendar-weekday', w));
    });
    monthWrap.appendChild(weekdays);

    const grid = el('div', 'calendar-grid');
    const days = buildCalendarDays(state.calendarMonth);
    const today = new Date(2026, 6, 20);

    days.forEach(day => {
      const isCurrentMonth = day.getMonth() === state.calendarMonth.getMonth();
      const isToday = sameDate(day, today);
      const isSelected = sameDate(day, state.calendarSelected);
      const dayMeetings = getMeetingsForDate(day, filteredMeetings);

      const cell = el('div', 'calendar-day' +
        (isCurrentMonth ? '' : ' other-month') +
        (isToday ? ' today' : '') +
        (isSelected ? ' selected' : ''));
      cell.appendChild(el('span', 'day-number', day.getDate()));

      if (dayMeetings.length > 0) {
        const dots = el('div', 'day-dots');
        dayMeetings.slice(0, 3).forEach(() => dots.appendChild(el('span', 'day-dot')));
        cell.appendChild(dots);
      }

      cell.addEventListener('click', () => {
        state.calendarSelected = day;
        renderMain();
      });
      grid.appendChild(cell);
    });
    monthWrap.appendChild(grid);

    const agenda = el('div', 'calendar-agenda');
    const agendaHeader = el('div', 'agenda-header');
    agendaHeader.appendChild(el('div', 'agenda-date', formatDateLabel(state.calendarSelected)));
    const selectedMeetings = getMeetingsForDate(state.calendarSelected, filteredMeetings);
    const subText = sameDate(state.calendarSelected, today)
      ? 'Today'
      : selectedMeetings.length + (selectedMeetings.length === 1 ? ' meeting' : ' meetings');
    agendaHeader.appendChild(el('div', 'agenda-weekday', subText));
    agenda.appendChild(agendaHeader);

    const agendaList = el('div', 'agenda-list');

    if (selectedMeetings.length === 0) {
      agendaList.appendChild(renderEmpty('No meetings scheduled.', 'ph-calendar-blank'));
    } else {
      selectedMeetings.forEach(m => {
        const item = el('div', 'agenda-item');
        item.addEventListener('click', () => openMeeting(m));

        const time = el('div', 'agenda-time', m.tm);
        const body = el('div', 'agenda-body');
        body.appendChild(el('div', 'agenda-title', m.title));
        body.appendChild(el('div', 'agenda-people', m.ppl));

        const footer = el('div', 'agenda-footer');
        const badge = el('span', 'agenda-badge' + (m.br ? ' ready' : ' pending'));
        badge.appendChild(icon(m.br ? 'ph-check-circle' : 'ph-circle'));
        badge.appendChild(el('span', '', m.br ? 'Brief ready' : 'No brief'));
        const briefBtn = el('button', 'btn btn-ghost btn-sm');
        briefBtn.appendChild(icon(m.br ? 'ph-arrows-clockwise' : 'ph-sparkle'));
        briefBtn.appendChild(el('span', '', m.br ? 'Regenerate' : 'Generate brief'));
        briefBtn.addEventListener('click', (e) => { e.stopPropagation(); generateBrief(m); });
        footer.appendChild(badge);
        footer.appendChild(briefBtn);
        body.appendChild(footer);

        if (m.prep && m.prep.length) {
          const prep = el('div', 'agenda-prep');
          m.prep.forEach((p, idx) => {
            const check = el('label', 'prep-check');
            const cb = el('input');
            cb.type = 'checkbox';
            const key = m.id + '-prep-' + idx;
            cb.checked = !!state.prepChecked[key];
            cb.addEventListener('change', () => {
              state.prepChecked[key] = cb.checked;
              renderMain();
            });
            check.appendChild(cb);
            check.appendChild(el('span', '', p));
            prep.appendChild(check);
          });
          body.appendChild(prep);
        } else if (m.post) {
          body.appendChild(el('div', 'post-item', m.post));
        }

        item.appendChild(time);
        item.appendChild(body);
        agendaList.appendChild(item);
      });
    }

    agenda.appendChild(agendaList);

    container.appendChild(monthWrap);
    container.appendChild(agenda);
    return container;
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
    container.appendChild(filterBar);

    const tableWrap = el('div', 'files-table-wrap');
    const table = el('table', 'files-table');
    const thead = el('thead');
    const headerRow = el('tr');
    ['Name', 'From', 'Date', 'Size', 'Type'].forEach(h => headerRow.appendChild(el('th', '', h)));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    const files = filterFiles(D._files);

    if (files.length === 0) {
      const emptyRow = el('tr');
      const emptyCell = el('td', '');
      emptyCell.colSpan = 5;
      emptyCell.appendChild(renderEmpty('No files match your filter.', 'ph-files'));
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      files.forEach(f => {
        const contact = D.getP(f.pid);
        const row = el('tr');
        if (state.selectedFileId === f.id) row.classList.add('active');
        row.addEventListener('click', () => openFile(f));

        const nameCell = el('td', '');
        const nameWrap = el('div', 'file-cell-name');
        nameWrap.appendChild(icon(fileIconName(f.tp)));
        nameWrap.appendChild(el('span', '', f.name));
        nameCell.appendChild(nameWrap);

        row.appendChild(nameCell);
        row.appendChild(el('td', 'file-cell-from', contact ? contact.name : ''));
        row.appendChild(el('td', 'file-cell-date', f.dt));
        row.appendChild(el('td', 'file-cell-size', f.sz));
        row.appendChild(el('td', 'file-cell-type', fileTypeLabel(f.tp)));
        tbody.appendChild(row);
      });
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
    return container;
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
    const drafts = filterDrafts(D.agentDrafts);
    drafts.forEach(d => {
      const card = el('div', 'draft-card');
      card.appendChild(el('div', 'draft-header-title', d.to));
      card.appendChild(el('div', 'draft-subject', d.subj));
      card.appendChild(el('div', 'draft-preview', d.preview));
      const actions = el('div', 'draft-actions');
      const sendBtn = el('button', 'btn btn-primary btn-sm', 'Send');
      const editBtn = el('button', 'btn btn-secondary btn-sm', 'Edit');
      sendBtn.addEventListener('click', () => sendAgentDraft(d.id));
      editBtn.addEventListener('click', () => editAgentDraft(d));
      actions.appendChild(sendBtn);
      actions.appendChild(editBtn);
      card.appendChild(actions);
      list.appendChild(card);
    });
    if (drafts.length === 0) {
      list.appendChild(renderEmpty('No drafts match your search.', 'ph-pencil-simple'));
    }
    container.appendChild(list);
    return container;
  }

  function filterDrafts(drafts) {
    if (!state.searchQuery) return drafts;
    const q = state.searchQuery.toLowerCase();
    return drafts.filter(d =>
      (d.to && d.to.toLowerCase().includes(q)) ||
      (d.subj && d.subj.toLowerCase().includes(q)) ||
      (d.preview && d.preview.toLowerCase().includes(q))
    );
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

    const newMsg = {
      pid: pid,
      accountId: 'gmail-w',
      ic: '',
      fm: '你',
      tag: '邮件',
      subj: subject || (mode === 'reply' ? 'Re: ' + (originalMsg ? originalMsg.subj : '') : ''),
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

    showToast(mode === 'reply' ? 'Reply sent' : mode === 'forward' ? 'Message forwarded' : 'Message sent');
    renderMain();
    return true;
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
    const toInput = el('input', 'compose-recipient-input');
    toInput.placeholder = 'Recipient';
    toInput.value = context.to || '';
    toRow.appendChild(toInput);

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

    // Subject row
    const subjRow = el('div', 'compose-row');
    subjRow.appendChild(el('label', '', 'Subject'));
    const subjInput = el('input');
    subjInput.placeholder = 'Subject';
    subjInput.value = context.subject || '';
    subjRow.appendChild(subjInput);
    fields.appendChild(subjRow);

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
    const bodyInput = el('textarea');
    bodyInput.placeholder = mode === 'reply' ? 'Write your reply...' : 'Write your message...';
    bodyInput.value = context.body || '';
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

    const header = el('div', 'settings-section');
    header.appendChild(el('div', 'settings-section-title', 'General'));
    const card = el('div', 'settings-card');

    card.appendChild(renderToggleRow('Desktop notifications', 'Show alerts for important messages', state.settings.notifications.desktop, v => {
      state.settings.notifications.desktop = v;
      renderMain();
    }));
    card.appendChild(renderToggleRow('Weekly digest', 'Send a summary every Monday', state.settings.notifications.weeklyDigest, v => {
      state.settings.notifications.weeklyDigest = v;
      renderMain();
    }));
    card.appendChild(renderToggleRow('Quiet hours', 'Pause notifications 22:00 - 08:00', state.settings.notifications.quietHours.enabled || false, v => {
      state.settings.notifications.quietHours.enabled = v;
      renderMain();
    }));

    container.appendChild(header);
    header.appendChild(card);

    const syncSection = el('div', 'settings-section');
    syncSection.appendChild(el('div', 'settings-section-title', 'Sync & Storage'));
    const syncCard = el('div', 'settings-card');
    const syncRow = el('div', 'settings-row');
    const syncLeft = el('div', '');
    syncLeft.appendChild(el('div', 'settings-label', 'Default sync format'));
    syncLeft.appendChild(el('div', 'settings-desc', 'Store incoming emails as Markdown for agent context'));
    syncRow.appendChild(syncLeft);
    const syncSelect = el('select', 'settings-select');
    [
      { value: 'markdown', label: 'Markdown' },
      { value: 'original', label: 'Original' },
      { value: 'both', label: 'Both (Markdown + HTML backup)' },
    ].forEach(opt => {
      const o = el('option', '', opt.label);
      o.value = opt.value;
      if (state.settings.syncFormat === opt.value) o.selected = true;
      syncSelect.appendChild(o);
    });
    syncSelect.addEventListener('change', () => {
      state.settings.syncFormat = syncSelect.value;
      showToast('Sync format updated to ' + syncSelect.value);
    });
    syncRow.appendChild(syncSelect);
    syncCard.appendChild(syncRow);
    syncSection.appendChild(syncCard);
    container.appendChild(syncSection);

    const securitySection = el('div', 'settings-section');
    securitySection.appendChild(el('div', 'settings-section-title', 'Security & Privacy'));
    const securityCard = el('div', 'settings-card');
    securityCard.appendChild(renderToggleRow('App lock', 'Require PIN to open Relay', state.settings.security.lockEnabled, v => {
      state.settings.security.lockEnabled = v;
      renderMain();
    }));
    securityCard.appendChild(renderToggleRow('Screenshot protection', 'Blur sensitive content in app switcher', state.settings.security.screenshot, v => {
      state.settings.security.screenshot = v;
      renderMain();
    }));
    securityCard.appendChild(renderToggleRow('Clear clipboard', 'Auto-clear copied content after 30s', state.settings.security.clipboardClear, v => {
      state.settings.security.clipboardClear = v;
      renderMain();
    }));
    securitySection.appendChild(securityCard);
    container.appendChild(securitySection);

    const agentSection = el('div', 'settings-section');
    agentSection.appendChild(el('div', 'settings-section-title', 'Agent'));
    const agentCard = el('div', 'settings-card');
    const approvalRow = el('div', 'settings-row');
    const approvalLeft = el('div', '');
    approvalLeft.appendChild(el('div', 'settings-label', 'Auto-approval'));
    approvalLeft.appendChild(el('div', 'settings-desc', 'Allow Relay to act without asking'));
    approvalRow.appendChild(approvalLeft);
    const approvalSelect = el('select', 'settings-select');
    ['low-risk', 'none', 'all'].forEach(opt => {
      const o = el('option', '', opt);
      o.value = opt;
      if (state.settings.agent.autoApproval === opt) o.selected = true;
      approvalSelect.appendChild(o);
    });
    approvalSelect.addEventListener('change', () => {
      state.settings.agent.autoApproval = approvalSelect.value;
    });
    approvalRow.appendChild(approvalSelect);
    agentCard.appendChild(approvalRow);
    agentSection.appendChild(agentCard);
    container.appendChild(agentSection);

    const accountsSection = el('div', 'settings-section');
    accountsSection.appendChild(el('div', 'settings-section-title', 'Connected accounts'));
    const accountsCard = el('div', 'settings-card');
    accounts.forEach(a => {
      const row = el('div', 'settings-row');
      const left = el('div', '');
      left.appendChild(el('div', 'settings-label', a.label));
      left.appendChild(el('div', 'settings-desc', a.email || a.workspace || a.provider));
      row.appendChild(left);
      const status = el('span', '', a.status);
      status.style.fontSize = '12px';
      status.style.color = a.status === 'connected' ? 'var(--green)' : a.status === 'error' ? 'var(--red)' : 'var(--yellow)';
      status.style.fontFamily = 'var(--font-mono)';
      row.appendChild(status);
      accountsCard.appendChild(row);
    });
    accountsSection.appendChild(accountsCard);
    container.appendChild(accountsSection);

    return container;
  }

  function renderToggleRow(label, desc, value, onChange) {
    const row = el('div', 'settings-row');
    const left = el('div', '');
    left.appendChild(el('div', 'settings-label', label));
    left.appendChild(el('div', 'settings-desc', desc));
    row.appendChild(left);
    const toggle = el('div', 'settings-toggle' + (value ? ' on' : ''));
    toggle.addEventListener('click', () => {
      const newValue = !value;
      onChange(newValue);
    });
    row.appendChild(toggle);
    return row;
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

  function openMessage(m) {
    state.selectedMessageId = m.pid + '-' + m.subj;
    state.selectedContactId = m.pid;
    state.selectedFileId = null;
    m.seen = true;
    renderMain();
    openDetailPanel(renderMessagePanel(m));
    renderAgentPanel();
  }

  function renderMessagePanel(m) {
    const c = getContact(m.pid);
    const wrapper = el('div', 'panel-wrapper');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
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

    const viewToggle = el('div', 'msg-thread-view-toggle');
    const renderedBtn = el('button', 'view-toggle-btn' + (state.messageViewMode === 'rendered' ? ' active' : ''), 'Rendered');
    const sourceBtn = el('button', 'view-toggle-btn' + (state.messageViewMode === 'source' ? ' active' : ''), 'Markdown');
    renderedBtn.addEventListener('click', () => { state.messageViewMode = 'rendered'; renderMain(); });
    sourceBtn.addEventListener('click', () => { state.messageViewMode = 'source'; renderMain(); });
    viewToggle.appendChild(renderedBtn);
    viewToggle.appendChild(sourceBtn);
    subjectRow.appendChild(viewToggle);
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
        avatar.style.background = 'linear-gradient(135deg, #007aff, #5856d6)';
      } else if (s.contact) {
        avatar = renderAvatar(s.contact, 'msg-thread-avatar', s.initial);
      } else {
        avatar = el('div', 'msg-thread-avatar', s.initial);
        avatar.style.background = '#8e8e93';
      }

      const sender = el('div', 'msg-thread-sender');
      sender.appendChild(el('div', 'msg-thread-name', s.name));
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
    const primary = el('div', 'msg-actions-primary');
    const secondary = el('div', 'msg-actions-secondary');

    const replyBtn = el('button', 'btn btn-primary btn-sm');
    replyBtn.appendChild(icon('ph-arrow-u-up-left'));
    replyBtn.appendChild(el('span', '', 'Reply'));
    replyBtn.title = 'Reply';

    const replyAllBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    replyAllBtn.appendChild(icon('ph-users'));
    replyAllBtn.title = 'Reply All';

    const forwardBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    forwardBtn.appendChild(icon('ph-share'));
    forwardBtn.title = 'Forward';

    const replyLaterBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    replyLaterBtn.appendChild(icon('ph-clock'));
    replyLaterBtn.title = 'Reply Later';

    const setAsideBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    setAsideBtn.appendChild(icon('ph-push-pin'));
    setAsideBtn.title = 'Set Aside';

    const bubbleUpBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    bubbleUpBtn.appendChild(icon('ph-arrow-fat-line-up'));
    bubbleUpBtn.title = 'Bubble Up';

    const moreBtn = el('button', 'btn btn-secondary btn-sm btn-icon');
    moreBtn.appendChild(icon('ph-dots-three'));
    moreBtn.title = 'More actions';

    replyBtn.addEventListener('click', () => {
      const subject = baseSubject(m.subj);
      const quoteHeader = 'On ' + m.tm + ', ' + (c ? c.name : m.fm) + ' <' + (c ? c.em : '') + '> wrote:';
      openComposeWithContext(c ? c.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader);
    });
    replyAllBtn.addEventListener('click', () => {
      const subject = baseSubject(m.subj);
      const quoteHeader = 'On ' + m.tm + ', ' + (c ? c.name : m.fm) + ' wrote:';
      openComposeWithContext(c ? c.name : m.fm, 'Re: ' + subject, '', 'reply', m, quoteHeader);
      showToast('Reply All: other recipients added in Cc');
    });
    forwardBtn.addEventListener('click', () => {
      const quoteHeader = '---------- Forwarded message ----------\nFrom: ' + (c ? c.name : m.fm) + '\nSubject: ' + m.subj + '\nDate: ' + m.tm;
      openComposeWithContext('', 'Fwd: ' + baseSubject(m.subj), '', 'forward', m, quoteHeader);
    });
    replyLaterBtn.addEventListener('click', () => replyLaterMessage(m));
    setAsideBtn.addEventListener('click', () => setAsideMessage(m));
    bubbleUpBtn.addEventListener('click', () => {
      const choices = [
        { label: 'Later today', action: () => bubbleUpMessage(m, 'later') },
        { label: 'Tomorrow', action: () => bubbleUpMessage(m, 'tomorrow') },
        { label: 'Next week', action: () => bubbleUpMessage(m, 'week') },
      ];
      openContextMenuFromElement(bubbleUpBtn, choices);
    });
    moreBtn.addEventListener('click', () => {
      const contact = getContact(m.pid);
      const items = [
        { label: 'Move to Imbox', action: () => moveMessageToBucket(m, 'imbox') },
        { label: 'Move to The Feed', action: () => moveMessageToBucket(m, 'feed') },
        { label: 'Move to Paper Trail', action: () => moveMessageToBucket(m, 'paperTrail') },
        { type: 'divider' },
        { label: 'Ask Agent', action: () => openAgentWithContext('Draft a reply to ' + (contact ? contact.name : 'this email')) },
        { label: contact && contact.blocked ? 'Unblock sender' : 'Block sender', action: () => { contact.blocked = !contact.blocked; renderMain(); showToast(contact.blocked ? 'Sender blocked' : 'Sender unblocked'); } },
      ];
      openContextMenuFromElement(moreBtn, items);
    });

    primary.appendChild(replyBtn);
    secondary.appendChild(replyAllBtn);
    secondary.appendChild(forwardBtn);
    secondary.appendChild(replyLaterBtn);
    secondary.appendChild(setAsideBtn);
    secondary.appendChild(bubbleUpBtn);
    secondary.appendChild(moreBtn);
    actions.appendChild(primary);
    actions.appendChild(secondary);
    wrapper.appendChild(actions);

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

    const copyBtn = el('button', 'btn btn-secondary btn-sm');
    copyBtn.appendChild(icon('ph-copy'));
    copyBtn.appendChild(el('span', '', 'Copy'));
    copyBtn.addEventListener('click', () => copyMeetingContext(m));

    const downloadBtn = el('button', 'btn btn-secondary btn-sm');
    downloadBtn.appendChild(icon('ph-download-simple'));
    downloadBtn.appendChild(el('span', '', 'Markdown'));
    downloadBtn.addEventListener('click', () => downloadMeetingMarkdown(m));

    const headerActions = el('div', 'panel-actions');
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

  function renderFeedItem(ev, view) {
    if (ev.type === 'message') {
      const m = ev.data;
      const contact = getContact(m.pid);
      const hasAgentDraft = !!findDraftForMessage(m);

      if (hasAgentDraft && view === 'imbox') {
        return renderDraftCard(m, contact);
      }

      const pScore = priorityScore(ev);
      const pClass = pScore >= 80 ? ' priority-high' : pScore >= 50 ? ' priority-medium' : '';
      const card = el('div', 'feed-card' + pClass);
      card.addEventListener('click', () => openMessage(m));
      card.addEventListener('contextmenu', (e) => showContextMenuForMessage(e, m));
      addLongPressListener(card, (e) => {
        const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
        const x = touch ? touch.clientX : 0;
        const y = touch ? touch.clientY : 0;
        showContextMenuForMessage({ clientX: x, clientY: y, preventDefault: () => {} }, m);
      });

      const left = renderAvatar(contact, 'feed-avatar', contact ? contact.name[0] : '?');

      const body = el('div', 'feed-body');
      const meta = el('div', 'feed-meta');
      const name = el('span', 'feed-name', contact ? contact.name : 'Unknown');
      const time = el('span', 'feed-time', m.tm);
      meta.appendChild(name);
      meta.appendChild(el('span', 'feed-spacer'));
      meta.appendChild(time);

      const subjRow = el('div', 'feed-subject-row');
      const subj = el('div', 'feed-subject', m.subj);
      subjRow.appendChild(subj);

      const status = messageStatusInfo(m.fl);
      if (status) {
        const dot = el('span', 'feed-status-dot');
        dot.style.background = status.color;
        dot.title = status.label;
        subjRow.appendChild(dot);
      }

      const prev = el('div', 'feed-preview', m.prev);

      body.appendChild(meta);
      body.appendChild(subjRow);
      body.appendChild(prev);

      card.appendChild(left);
      card.appendChild(body);

      if (view === 'screener') {
        card.classList.add('screener-card');
        const actions = el('div', 'screener-actions');
        const yesImbox = el('button', 'btn btn-primary btn-xs', 'Imbox');
        const yesFeed = el('button', 'btn btn-secondary btn-xs', 'Feed');
        const yesPaper = el('button', 'btn btn-secondary btn-xs', 'Paper');
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
        return card;
      }

      return wrapSwipeActions(card, () => setAsideMessage(m), () => replyLaterMessage(m));
    }

    if (ev.type === 'meeting') {
      const m = ev.data;
      const card = el('div', 'feed-card meeting-card');
      card.addEventListener('click', () => openMeeting(m));

      const left = el('div', 'feed-avatar meeting-avatar');
      left.appendChild(icon('ph-calendar-blank'));

      const body = el('div', 'feed-body');
      const meta = el('div', 'feed-meta');
      meta.appendChild(el('span', 'feed-name', m.title));
      meta.appendChild(el('span', 'feed-time', m.dt + ' · ' + m.tm));

      body.appendChild(meta);
      body.appendChild(el('div', 'feed-preview', m.ppl));

      card.appendChild(left);
      card.appendChild(body);
      return wrapSwipeActions(card, () => snoozeMeeting(m), () => archiveMeeting(m));
    }

    return el('div');
  }

  function findDraftForMessage(m) {
    return D.agentDrafts.find(d => d.to === (getContact(m.pid) ? getContact(m.pid).name : ''));
  }

  function renderDraftCard(m, contact) {
    const draft = findDraftForMessage(m) || { preview: m.prev };
    const card = el('div', 'feed-card draft-card');

    const header = el('div', 'draft-header');
    header.appendChild(el('span', 'draft-badge', 'AI draft ready'));
    header.appendChild(el('span', 'draft-for', 'Reply to ' + (contact ? contact.name : 'Unknown')));

    const body = el('div', 'draft-body');
    body.appendChild(el('div', 'draft-subject', m.subj));
    body.appendChild(el('div', 'draft-preview', draft.preview));

    const actions = el('div', 'draft-actions');
    const sendBtn = el('button', 'btn btn-primary btn-sm');
    sendBtn.appendChild(icon('ph-paper-plane-right'));
    sendBtn.appendChild(el('span', '', 'Send'));
    const editBtn = el('button', 'btn btn-secondary btn-sm');
    editBtn.appendChild(icon('ph-pencil-simple'));
    editBtn.appendChild(el('span', '', 'Edit'));
    const ignoreBtn = el('button', 'btn btn-ghost btn-sm');
    ignoreBtn.appendChild(icon('ph-x'));
    ignoreBtn.appendChild(el('span', '', 'Ignore'));

    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); sendDraft(m); });
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editDraft(m); });
    ignoreBtn.addEventListener('click', (e) => { e.stopPropagation(); ignoreDraft(m); });

    actions.appendChild(sendBtn);
    actions.appendChild(editBtn);
    actions.appendChild(ignoreBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function sendDraft(m) {
    showToast('Draft sent to ' + (getContact(m.pid) ? getContact(m.pid).name : ''));
    m.fl = 'done';
    renderMain();
  }

  function editDraft(m) {
    openMessage(m);
    showToast('Edit draft in the reply box');
  }

  function ignoreDraft(m) {
    m.fl = '';
    renderMain();
  }

  function showToast(text) {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
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
    let body = m.prev || '';
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
    const taskName = text.length > 24 ? text.slice(0, 24) + '...' : text;
    D.agentTasks.unshift({
      name: taskName,
      status: 'go',
      steps: [
        { l: 'Understanding request', d: true },
        { l: 'Gathering context', d: true },
        { l: 'Generating output', d: false },
      ],
    });
    showToast('Agent task added: ' + taskName);
    renderAgentFab();
    renderAgentPanel();
  }

  function openAgentWithContext(context) {
    state.agentOpen = true;
    document.getElementById('agent-panel').classList.add('open');
    renderAgentPanel();
    const input = document.querySelector('#agent-panel .agent-input');
    if (input) input.value = context;
  }

  function renderAgentFab() {
    const fab = document.getElementById('agent-fab');
    fab.innerHTML = '';
    const i = icon('ph-sparkle');
    fab.appendChild(i);
    fab.addEventListener('click', toggleAgent);

    fab.classList.toggle('has-tasks', D.agentTasks.some(t => t.status === 'go'));
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
      return c ? '正在看：' + c.name + ' 的邮件' : 'What would you like me to do?';
    }
    if (state.selectedMeetingId) {
      const m = D._meetings.find(x => x.id === state.selectedMeetingId);
      if (m) return '正在看：' + m.title;
    }
    if (state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      if (c) return '正在看：' + c.name;
    }
    if (state.selectedFileId) {
      const f = D._files.find(x => x.id === state.selectedFileId);
      if (f) return '正在看：' + f.name;
    }
    return 'What would you like me to do?';
  }

  function renderAgentPanel() {
    const panel = document.getElementById('agent-panel');
    panel.innerHTML = '';

    const header = el('div', 'agent-header');
    header.appendChild(el('span', 'agent-title', 'Relay Agent'));
    const close = el('button', 'icon-btn agent-close');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleAgent);
    header.appendChild(close);
    panel.appendChild(header);

    const context = el('div', 'agent-context');
    context.textContent = buildAgentContext();
    panel.appendChild(context);

    const suggestions = el('div', 'agent-suggestions');
    const suggestionActions = [
      { text: 'Summarize', action: () => runAgentAction('Summarize this') },
      { text: 'Draft reply', action: () => runAgentAction('Draft a reply') },
      { text: 'Schedule meeting', action: () => runAgentAction('Find a meeting time') },
      { text: 'Extract todos', action: () => runAgentAction('Extract todos') },
    ];
    suggestionActions.forEach(s => {
      const chip = el('button', 'agent-chip', s.text);
      chip.addEventListener('click', s.action);
      suggestions.appendChild(chip);
    });
    panel.appendChild(suggestions);

    const tasks = el('div', 'agent-tasks');
    if (D.agentTasks.length) {
      tasks.appendChild(el('div', 'agent-section-title', 'In progress'));
      D.agentTasks.forEach(t => {
        const row = el('div', 'agent-task');
        row.appendChild(el('div', 'agent-task-name', t.name));
        const steps = el('div', 'agent-task-steps');
        t.steps.forEach(s => {
          const step = el('span', 'agent-step' + (s.d ? ' done' : ''), s.d ? '✓' : '○');
          step.title = s.l;
          steps.appendChild(step);
        });
        row.appendChild(steps);
        tasks.appendChild(row);
      });
    }
    panel.appendChild(tasks);

    const inputWrap = el('div', 'agent-input-wrap');
    const input = el('input', 'agent-input');
    input.placeholder = 'Ask Relay...';
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
    { id: 'goImbox', label: 'Go to Imbox', section: 'Views', icon: 'ph-tray', hint: '' },
    { id: 'goFeed', label: 'Go to The Feed', section: 'Views', icon: 'ph-newspaper', hint: '' },
    { id: 'goPaperTrail', label: 'Go to Paper Trail', section: 'Views', icon: 'ph-receipt', hint: '' },
    { id: 'goScreener', label: 'Go to Screener', section: 'Views', icon: 'ph-funnel', hint: '' },
    { id: 'goScreenerHistory', label: 'Go to Screener History', section: 'Views', icon: 'ph-clock-counter-clockwise', hint: '' },
    { id: 'goContacts', label: 'Go to Contacts', section: 'Views', icon: 'ph-users', hint: '' },
    { id: 'goCalendar', label: 'Go to Calendar', section: 'Views', icon: 'ph-calendar', hint: '' },
    { id: 'goFiles', label: 'Go to Files', section: 'Views', icon: 'ph-files', hint: '' },
    { id: 'goDrafts', label: 'Go to Drafts', section: 'Views', icon: 'ph-pencil-simple', hint: '' },
    { id: 'openAgent', label: 'Open Relay Agent', section: 'Actions', icon: 'ph-sparkle', hint: '' },
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
    const items = [
      { label: 'Reply', icon: 'ph-arrow-u-up-left', action: () => { openMessage(m); showToast('Reply to ' + (contact ? contact.name : '')); } },
      { label: 'Reply all', icon: 'ph-arrows-out-line-horizontal', action: () => showToast('Reply all to thread') },
      { type: 'divider' },
      { label: 'Reply Later', icon: 'ph-clock', action: () => replyLaterMessage(m) },
      { label: 'Set Aside', icon: 'ph-push-pin', action: () => setAsideMessage(m) },
      { label: 'Bubble Up...', icon: 'ph-arrow-fat-line-up', action: () => bubbleUpMessage(m, 'tomorrow') },
      { type: 'divider' },
      { label: 'Move to Imbox', icon: 'ph-tray', action: () => moveMessageToBucket(m, 'imbox') },
      { label: 'Move to The Feed', icon: 'ph-newspaper', action: () => moveMessageToBucket(m, 'feed') },
      { label: 'Move to Paper Trail', icon: 'ph-receipt', action: () => moveMessageToBucket(m, 'paperTrail') },
      { type: 'divider' },
      { label: contact && contact.blocked ? 'Unblock sender' : 'Block sender', icon: 'ph-prohibit', action: () => { if (contact) { contact.blocked = !contact.blocked; renderMain(); showToast(contact.blocked ? 'Sender blocked' : 'Sender unblocked'); } } },
    ];
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
        btn.appendChild(el('span', '', item.label));
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

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderTopBar();
    renderMain();
    renderAgentFab();
    renderAgentPanel();
    renderNotifications();

    document.querySelector('.traffic-close').addEventListener('click', () => showToast('Close window'));
    document.querySelector('.traffic-minimize').addEventListener('click', () => showToast('Minimize window'));
    document.querySelector('.traffic-zoom').addEventListener('click', () => showToast('Maximize window'));

    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if (e.key === 'Escape') {
        const palette = document.getElementById('command-palette');
        const menu = document.getElementById('context-menu');
        if (palette.classList.contains('open')) closeCommandPalette();
        else if (menu.classList.contains('open')) closeContextMenu();
        else if (state.composeOpen) closeCompose();
        else if (state.notificationsOpen) toggleNotifications();
        else if (state.agentOpen) toggleAgent();
        else if (document.getElementById('detail-panel').classList.contains('open')) closePanel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        openCompose();
      }
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const shortcuts = {
          '1': 'imbox',
          '2': 'feed',
          '3': 'paperTrail',
          '4': 'screener',
          '5': 'replyLater',
          '6': 'setAside',
        };
        if (shortcuts[e.key]) {
          e.preventDefault();
          setView(shortcuts[e.key]);
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
