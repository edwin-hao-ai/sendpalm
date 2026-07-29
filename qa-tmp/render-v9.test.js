const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'prototype-v9.html'), 'utf8');

function loadApp() {
  // Remove local script tags so we can inject them manually and avoid file:// load races
  const cleanHtml = html.replace(/<script src="[^"]*"><\/script>/g, '');

  const dom = new JSDOM(cleanHtml, {
    url: 'file://' + path.join(root, 'prototype-v9.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });

  const dataScript = fs.readFileSync(path.join(root, 'prototype-data.js'), 'utf8');
  const appScript = fs.readFileSync(path.join(root, 'js/prototype-v9.js'), 'utf8');

  const script1 = dom.window.document.createElement('script');
  script1.textContent = dataScript;
  dom.window.document.body.appendChild(script1);

  const script2 = dom.window.document.createElement('script');
  script2.textContent = appScript;
  dom.window.document.body.appendChild(script2);

  // Dispatch DOMContentLoaded so the IIFE's listener fires
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

  await wait(50);

  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  console.log('✓ #app rendered');

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar not found');
  if (sidebar.querySelectorAll('.nav-item').length === 0) throw new Error('Nav items not rendered');
  console.log('✓ sidebar rendered with ' + sidebar.querySelectorAll('.nav-item').length + ' items');

  const main = document.getElementById('main');
  if (!main) throw new Error('#main not found');
  const feedCards = main.querySelectorAll('.feed-card');
  if (feedCards.length === 0) throw new Error('No feed cards rendered');
  console.log('✓ feed rendered with ' + feedCards.length + ' cards');

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

  // Polyfill URL.createObjectURL for jsdom so the download path runs cleanly
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (blob) => 'blob:polyfilled';
    window.URL.revokeObjectURL = () => {};
  }

  // Click download markdown button and ensure it does not throw
  try {
    downloadBtn.click();
    console.log('✓ download markdown button clicked without error');
  } catch (e) {
    throw new Error('Download markdown button click failed: ' + e.message);
  }

  // Open a meeting card
  const meetingCards = main.querySelectorAll('.feed-card.meeting-card');
  if (meetingCards.length > 0) {
    meetingCards[0].click();
    await wait(50);
    if (panel.classList.contains('hidden')) throw new Error('Meeting panel did not open');
    const meetingActions = panel.querySelector('.panel-actions');
    if (!meetingActions) throw new Error('Meeting panel actions not rendered');
    const meetingDownloadBtn = Array.from(meetingActions.querySelectorAll('button')).find(b => b.textContent.includes('Markdown'));
    if (!meetingDownloadBtn) throw new Error('Meeting download markdown button not found');
    console.log('✓ meeting download markdown button present');
  }

  // Open contacts view
  const peopleBtn = Array.from(sidebar.querySelectorAll('.nav-item')).find(b => b.textContent.includes('Contacts'));
  if (!peopleBtn) throw new Error('Contacts nav item not found');
  peopleBtn.click();
  await wait(50);

  const personCards = main.querySelectorAll('.person-card');
  if (personCards.length === 0) throw new Error('No person cards rendered');
  console.log('✓ people view rendered with ' + personCards.length + ' cards');

  // Open first person
  personCards[0].click();
  await wait(50);
  if (panel.classList.contains('hidden')) throw new Error('Contact panel did not open');
  const contactActions = panel.querySelector('.panel-actions');
  if (!contactActions) throw new Error('Contact panel actions not rendered');
  const contactDownloadBtn = Array.from(contactActions.querySelectorAll('button')).find(b => b.title === 'Download Markdown');
  if (!contactDownloadBtn) throw new Error('Contact download markdown button not found');
  console.log('✓ contact download markdown button present');

  const profileCard = panel.querySelector('.contact-profile-card');
  if (!profileCard) throw new Error('Contact profile card not rendered');
  console.log('✓ contact profile card rendered');

  const topics = panel.querySelector('.contact-topics');
  if (!topics) throw new Error('Contact topics not rendered');
  console.log('✓ contact topics rendered');

  const activity = panel.querySelector('.contact-activity');
  if (!activity) throw new Error('Contact activity timeline not rendered');
  console.log('✓ contact activity timeline rendered');

  const stats = panel.querySelector('.contact-stats');
  if (!stats) throw new Error('Contact stats not rendered');
  const insights = panel.querySelector('.contact-insights');
  if (!insights) throw new Error('Contact insights not rendered');
  const headerBadges = panel.querySelector('.contact-header-badges');
  if (!headerBadges) throw new Error('Contact header badges not rendered');
  console.log('✓ contact stats and insights rendered');

  // Open calendar view
  const calendarBtn = Array.from(sidebar.querySelectorAll('.nav-item')).find(b => b.textContent.includes('Calendar'));
  if (!calendarBtn) throw new Error('Calendar nav item not found');
  calendarBtn.click();
  await wait(50);

  const timelineWrap = main.querySelector('.calendar-timeline-wrap');
  if (!timelineWrap) throw new Error('Calendar timeline not rendered');
  const dayStrip = main.querySelector('.calendar-day-strip');
  if (!dayStrip || dayStrip.querySelectorAll('.strip-day').length === 0) throw new Error('Calendar day strip not rendered');
  const hourRows = main.querySelectorAll('.timeline-hour-row');
  if (hourRows.length === 0) throw new Error('Calendar timeline hours not rendered');
  const sidebarMonth = main.querySelector('.calendar-sidebar .calendar-month-wrap');
  if (!sidebarMonth) throw new Error('Calendar sidebar month not rendered');
  console.log('✓ calendar timeline view rendered');

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
