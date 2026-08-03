const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.error('REQUEST FAILED:', req.url(), req.failure()?.errorText));

  await page.goto('http://localhost:8765/prototype-v11.html');

  // Wait for the app to boot, skip onboarding, and navigate to Insights.
  await page.waitForFunction(() => typeof setView === 'function', null, { timeout: 20000 });
  const skipBtn = await page.$('.onboarding-actions .btn-ghost');
  if (skipBtn) await skipBtn.click();
  await page.evaluate(() => setView('insights'));

  // Wait for the Insights view to render.
  await page.waitForSelector('.insights-view', { timeout: 20000 }).catch(async err => {
    const html = await page.evaluate(() => document.body.innerHTML);
    fs.writeFileSync('/Users/edwinhao/sendpalm/.qa/task12-body.html', html);
    await page.screenshot({ path: '/Users/edwinhao/sendpalm/.qa/task12-fail.png' });
    throw err;
  });

  // Read the "Agent actions this week" count.
  const agentCount = await page.$eval('.insights-agent-count', el => el.textContent.trim());
  console.log('Agent actions this week card:', agentCount);

  // Read the health distribution.
  const healthLabels = await page.$$eval('.insights-health-item', cells => {
    return cells.map(cell => {
      const label = cell.querySelector('.insights-health-label-wrap')?.textContent.trim();
      const value = cell.querySelector('.insights-health-count')?.textContent.trim();
      return { label, value };
    });
  });
  console.log('Health distribution cells:', healthLabels);

  // Verify expectations.
  if (!agentCount.includes('2')) {
    console.error('FAIL: expected Agent actions this week count to be 2, got:', agentCount);
    await browser.close();
    process.exit(1);
  }

  const coldCell = healthLabels.find(h => h.label === 'Cold');
  if (!coldCell || coldCell.value !== '12') {
    console.error('FAIL: expected Cold count to be 12, got:', coldCell);
    await browser.close();
    process.exit(1);
  }

  console.log('Headless Task 12 verification passed.');
  await browser.close();
})();
