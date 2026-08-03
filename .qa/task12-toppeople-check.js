const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:8080/prototype-v11.html');
  await page.waitForFunction(() => typeof setView === 'function', null, { timeout: 20000 });
  const skipBtn = await page.$('.onboarding-actions .btn-ghost');
  if (skipBtn) await skipBtn.click();
  await page.evaluate(() => setView('insights'));
  await page.waitForSelector('.insights-view', { timeout: 20000 });

  // Extract Top People rows.
  const rows = await page.$$eval('.insights-person-row', rows =>
    rows.map(row => {
      const name = row.querySelector('.insights-person-name')?.textContent.trim() || '';
      const count = parseInt(row.querySelector('.insights-person-count')?.textContent.trim() || '0', 10);
      const scoreWrap = row.querySelector('.insights-person-score');
      const health = parseInt(scoreWrap?.querySelector('span')?.textContent.trim() || '0', 10);
      const color = scoreWrap?.style.color || '';
      const iconClass = scoreWrap?.querySelector('i')?.className || '';
      return { name, count, health, score: count + health, color, iconClass };
    })
  );

  console.log('Top People rows:', JSON.stringify(rows, null, 2));

  let failed = false;

  if (rows.length !== 5) {
    console.error('FAIL: expected 5 Top People rows, got', rows.length);
    failed = true;
  }

  // Verify sorted by combined score (count + health) descending.
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].score < rows[i + 1].score) {
      console.error('FAIL: rows not sorted by combined score at index', i, rows[i], rows[i + 1]);
      failed = true;
    }
  }

  // Verify health is displayed (numeric 0-100) and color-coded.
  rows.forEach((row, idx) => {
    if (Number.isNaN(row.health)) {
      console.error('FAIL: row', idx, 'does not show a numeric health value');
      failed = true;
    }
    const expectedColor = row.health >= 70 ? 'var(--green)' : row.health >= 40 ? 'var(--yellow)' : 'var(--red)';
    if (row.color !== expectedColor) {
      console.error('FAIL: row', idx, 'health color mismatch. Expected', expectedColor, 'got', row.color);
      failed = true;
    }
  });

  if (failed) {
    await browser.close();
    process.exit(1);
  }

  console.log('Top People verification passed: 5 rows ranked by count + health with health color coding.');
  await browser.close();
})();
