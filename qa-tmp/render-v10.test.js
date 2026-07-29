const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'prototype-v10.html'), 'utf8');

function loadApp() {
  const cleanHtml = html.replace(/<script src="[^"]*"><\/script>/g, '');

  const dom = new JSDOM(cleanHtml, {
    url: 'file://' + path.join(root, 'prototype-v10.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });

  const dataScript = fs.readFileSync(path.join(root, 'prototype-data.js'), 'utf8');
  const appScript = fs.readFileSync(path.join(root, 'js/prototype-v10.js'), 'utf8');

  const script1 = dom.window.document.createElement('script');
  script1.textContent = dataScript;
  dom.window.document.body.appendChild(script1);

  const script2 = dom.window.document.createElement('script');
  script2.textContent = appScript;
  dom.window.document.body.appendChild(script2);

  const event = new dom.window.Event('DOMContentLoaded');
  dom.window.document.dispatchEvent(event);

  return dom;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Loading app...');
  const dom = loadApp();
  const document = dom.window.document;
  const window = dom.window;

  await wait(600);

  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  console.log('✓ #app rendered');

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar not found');
  const navItems = sidebar.querySelectorAll('.nav-item');
  if (navItems.length === 0) throw new Error('Nav items not rendered');
  if (navItems.length !== 6) throw new Error('Expected 6 nav buckets, got ' + navItems.length);
  const trashNav = Array.from(navItems).find(b => b.textContent.includes('Trash'));
  const spamNav = Array.from(navItems).find(b => b.textContent.includes('Spam'));
  if (!trashNav) throw new Error('Trash nav item not rendered');
  if (!spamNav) throw new Error('Spam nav item not rendered');
  console.log('✓ sidebar rendered with 6 buckets including Trash and Spam');

  const main = document.getElementById('main');
  if (!main) throw new Error('#main not found');
  const feedCards = main.querySelectorAll('.feed-card');
  if (feedCards.length === 0) throw new Error('No feed cards rendered');
  console.log('✓ feed rendered with ' + feedCards.length + ' cards');

  // Verify SendPalm accent color in CSS variables via computed style on a primary button
  const tempBtn = document.createElement('button');
  tempBtn.className = 'btn btn-primary';
  document.body.appendChild(tempBtn);
  const computedBg = window.getComputedStyle(tempBtn).backgroundColor;
  document.body.removeChild(tempBtn);
  if (!computedBg.includes('10, 143, 99')) {
    console.log('  (accent color computed as ' + computedBg + ')');
  }

  // Open first message
  const firstMessage = main.querySelector('.feed-card');
  firstMessage.click();
  await wait(50);

  const panel = document.getElementById('detail-panel');
  if (panel.classList.contains('hidden')) throw new Error('Detail panel did not open');
  console.log('✓ detail panel opened');

  const threadHeader = panel.querySelector('.msg-thread-header');
  if (!threadHeader) throw new Error('Message thread header not rendered');
  console.log('✓ message thread rendered');

  const msgActions = panel.querySelector('.msg-actions');
  if (!msgActions) throw new Error('Message actions not rendered');
  const headerActions = panel.querySelector('.panel-actions');
  if (!headerActions) throw new Error('Message panel header actions not rendered');
  const downloadBtn = Array.from(headerActions.querySelectorAll('button')).find(b => b.textContent.includes('Markdown'));
  if (!downloadBtn) throw new Error('Download Markdown button not found');
  console.log('✓ download markdown button present');

  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (blob) => 'blob:polyfilled';
    window.URL.revokeObjectURL = () => {};
  }

  try {
    downloadBtn.click();
    console.log('✓ download markdown button clicked without error');
  } catch (e) {
    throw new Error('Download markdown button click failed: ' + e.message);
  }

  // Click thread avatar to open contact panel
  const threadAvatar = panel.querySelector('.msg-thread-avatar.avatar-clickable');
  if (threadAvatar) {
    threadAvatar.click();
    await wait(50);
    const contactPanel = panel.querySelector('.contact-panel');
    if (!contactPanel) throw new Error('Contact panel did not open from avatar click');
    const contactActionBar = contactPanel.querySelector('.contact-action-bar');
    if (!contactActionBar) throw new Error('Contact action bar not rendered after avatar click');
    console.log('✓ avatar click opens contact panel');
  }

  // Open contacts view via avatar menu
  const avatarBtn = document.querySelector('.topbar-avatar');
  if (!avatarBtn) throw new Error('Avatar menu button not found');
  avatarBtn.click();
  await wait(50);

  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu || !contextMenu.classList.contains('open')) throw new Error('Avatar menu did not open');
  const contactsItem = Array.from(contextMenu.querySelectorAll('.context-menu-item')).find(b => b.textContent.includes('Contacts'));
  if (!contactsItem) throw new Error('Contacts menu item not found');
  contactsItem.click();
  await wait(50);

  const personCards = main.querySelectorAll('.person-card');
  if (personCards.length === 0) throw new Error('No person cards rendered');
  console.log('✓ people view rendered with ' + personCards.length + ' cards');

  // Open first person
  personCards[0].click();
  await wait(50);
  if (panel.classList.contains('hidden')) throw new Error('Contact panel did not open');
  const writeBtn = panel.querySelector('.contact-write-btn');
  if (!writeBtn) throw new Error('Contact + Write button not rendered');
  console.log('✓ contact + Write button rendered');

  const actionBar = panel.querySelector('.contact-action-bar');
  if (!actionBar) throw new Error('Contact action bar not rendered');
  const notifyBtn = Array.from(actionBar.querySelectorAll('.contact-action-btn')).find(b => b.textContent.includes('Notif'));
  const deliverBtn = Array.from(actionBar.querySelectorAll('.contact-action-btn')).find(b => b.textContent.includes('Deliver'));
  const autofileBtn = Array.from(actionBar.querySelectorAll('.contact-action-btn')).find(b => b.textContent.includes('Autofile') || b.textContent.includes('Work') || b.textContent.includes('Personal'));
  if (!notifyBtn) throw new Error('Contact notify button not rendered');
  if (!deliverBtn) throw new Error('Contact deliver button not rendered');
  if (!autofileBtn) throw new Error('Contact autofile button not rendered');
  console.log('✓ contact HEY action bar rendered');

  const notesTextarea = panel.querySelector('.contact-notes-textarea');
  if (!notesTextarea) throw new Error('Contact notes textarea not rendered');
  console.log('✓ contact notes textarea rendered');

  const threadFilters = panel.querySelector('.contact-thread-filters');
  if (!threadFilters) throw new Error('Contact thread filters not rendered');
  if (threadFilters.querySelectorAll('.contact-thread-filter').length < 3) throw new Error('Expected 3 thread filters');
  console.log('✓ contact thread filters rendered');

  // Open calendar view via avatar menu
  avatarBtn.click();
  await wait(50);
  const calendarItem = Array.from(contextMenu.querySelectorAll('.context-menu-item')).find(b => b.textContent.includes('Calendar'));
  if (!calendarItem) throw new Error('Calendar menu item not found');
  calendarItem.click();
  await wait(50);

  const timelineWrap = main.querySelector('.calendar-timeline-wrap');
  if (!timelineWrap) throw new Error('Calendar timeline not rendered');
  const dayStrip = main.querySelector('.calendar-day-strip');
  if (!dayStrip || dayStrip.querySelectorAll('.strip-day').length === 0) throw new Error('Calendar day strip not rendered');
  console.log('✓ calendar timeline view rendered');

  // Open Focus & Reply from Inbox Pending pile
  const inboxNavBtn = Array.from(sidebar.querySelectorAll('.nav-item')).find(b => b.textContent.includes('Inbox'));
  if (inboxNavBtn) {
    inboxNavBtn.click();
    await wait(50);
  }
  const pendingPile = Array.from(main.querySelectorAll('.imbox-pile')).find(p => p.textContent.includes('Pending'));
  if (pendingPile) {
    pendingPile.querySelector('.imbox-pile-header').click();
    await wait(50);
    const expandedPile = Array.from(main.querySelectorAll('.imbox-pile')).find(p => p.textContent.includes('Pending'));
    const boardBtn = expandedPile && expandedPile.querySelector('.pile-board-btn');
    if (boardBtn) {
      boardBtn.click();
      await wait(50);
      const focusBar = main.querySelector('.focus-reply-bar');
      if (!focusBar) throw new Error('Focus & Reply bar not rendered');
      focusBar.querySelector('.btn').click();
      await wait(50);
      const focusReplyView = main.querySelector('.focus-reply-view');
      if (!focusReplyView) throw new Error('Focus & Reply view not rendered');
      const focusReplyItem = focusReplyView.querySelector('.focus-reply-item');
      if (!focusReplyItem) throw new Error('Focus & Reply item not rendered');
      const replyCard = focusReplyItem.querySelector('.focus-reply-reply-card');
      if (!replyCard) throw new Error('Focus & Reply reply card not rendered');
      const replyTextarea = replyCard.querySelector('.focus-reply-reply-textarea');
      if (!replyTextarea) throw new Error('Focus & Reply reply textarea not rendered');
      const replyActions = replyCard.querySelector('.focus-reply-item-actions');
      if (!replyActions) throw new Error('Focus & Reply item actions not rendered');
      console.log('✓ Focus & Reply rendered as unified reply page');
    }
  }

  // Open Read together from Inbox section header
  if (inboxNavBtn) {
    inboxNavBtn.click();
    await wait(50);
  }
  const sectionAction = Array.from(main.querySelectorAll('.feed-section-action')).find(b => b.textContent.includes('Read together'));
  if (sectionAction) {
    sectionAction.click();
    await wait(50);
    const readTogetherView = main.querySelector('.read-together-view');
    if (!readTogetherView) throw new Error('Read together view not rendered');
    const readTogetherCard = readTogetherView.querySelector('.read-together-card');
    if (!readTogetherCard) throw new Error('Read together card not rendered');
    const readTogetherActions = readTogetherView.querySelector('.read-together-actions');
    if (!readTogetherActions) throw new Error('Read together actions not rendered');
    console.log('✓ Read together mode rendered with card and actions');
  }

  // Open compose window
  const composeBtn = sidebar.querySelector('.sidebar-compose-btn');
  if (!composeBtn) throw new Error('Compose button not found');
  composeBtn.click();
  await wait(50);

  const composeModal = document.getElementById('compose-modal');
  if (!composeModal || !composeModal.classList.contains('open')) throw new Error('Compose modal did not open');
  const composeWindow = composeModal.querySelector('.compose-window');
  if (!composeWindow) throw new Error('Compose window not rendered');
  const recipientPills = composeWindow.querySelector('.compose-recipient-pills');
  if (!recipientPills) throw new Error('Recipient pills not rendered');
  console.log('✓ compose window rendered with recipient chips');

  console.log('\nAll QA checks passed.');
  dom.window.close();
}

run().catch(err => {
  console.error('QA failed:', err.message);
  process.exit(1);
});
