import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 合成資料：統計學（一234）與會計學（一34）衝堂。
async function addCourse(page: Page, title: string) {
  const search = page.getByRole('searchbox', { name: '搜課' });
  await search.fill(title);
  await page.getByRole('button', { name: `加入課表：${title}` }).click();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}


/** 看得到的按鈕、連結與輸入框中，寬或高小於 44px 的（包在外框 label 裡的輸入框以外框計算）。 */
async function smallTargets(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a, input, select, textarea, label[class*="btn"]')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !element.classList.contains('sr-only');
    })
    .map((element) => ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && element.closest('label') ? element.closest('label')! : element))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height < 44 || rect.width < 44;
    })
    .map((element) => `${element.tagName} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 20)} ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`));
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('search, add, see conflicts and rules, export, and keep data after reload', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await expectNoAxeViolations(page);

    await addCourse(page, '統計學');
    await expect(page.getByRole('status', { name: '最近的修改' })).toContainText('已加入「統計學」');
    await addCourse(page, '會計學');

    const grid = page.getByRole('group', { name: '每週課表' });
    await expect(grid.getByRole('button', { name: /統計學.*衝堂/ })).toBeVisible();
    await expect(page.getByRole('list', { name: '提醒' })).toContainText('統計學 與 會計學 每週時段重疊');
    await expect(page.getByText('共 6 學分')).toBeVisible();

    await grid.getByRole('button', { name: /會計學/ }).click();
    await page.getByRole('group', { name: '會計學 的操作' }).getByRole('button', { name: '移出課表' }).click();
    await expect(page.getByRole('list', { name: '提醒' })).toHaveCount(0);
    await page.getByRole('status', { name: '最近的修改' }).getByRole('button', { name: '復原' }).click();
    await expect(page.getByText('共 6 學分')).toBeVisible();

    await page.getByRole('button', { name: '複製課號清單' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('900001001\n900002001');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出資料' }).click();
    expect((await download).suggestedFilename()).toMatch(/^campusward-\d{4}-\d{2}-\d{2}\.json$/);

    await page.getByRole('button', { name: '另存為新備案' }).click();
    await expect(page.getByRole('group', { name: '方案' }).getByRole('button', { name: '備案 1' })).toHaveAttribute('aria-pressed', 'true');

    await expectNoAxeViolations(page);
    await page.reload();
    await expect(page.getByText('共 6 學分')).toBeVisible();
    await expect(page.getByRole('group', { name: '方案' }).getByRole('button', { name: '備案 1' })).toBeVisible();
    await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
  });
});

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('searches and adds a course with the keyboard alone', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await page.keyboard.press('Tab');
    let guard = 0;
    while (!(await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search')) && guard++ < 10) await page.keyboard.press('Tab');
    await page.keyboard.type('統計學');
    guard = 0;
    while (!(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '加入課表：統計學')) && guard++ < 60) await page.keyboard.press('Tab');
    expect(guard).toBeLessThan(60);
    await page.keyboard.press('Enter');
    await expect(page.getByText('共 3 學分')).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('use bottom tabs, add a course, read the agenda, and keep touch targets large', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    const nav = page.getByRole('navigation', { name: '主要分頁' });

    await nav.getByRole('button', { name: '搜課' }).click();
    await addCourse(page, '統計學');
    await addCourse(page, '會計學');
    await nav.getByRole('button', { name: '課表' }).click();

    const agenda = page.getByRole('list', { name: '每日行程' });
    await expect(agenda).toContainText('統計學');
    await expect(agenda).toContainText('衝堂');
    const summary = page.getByRole('button', { name: /則提醒/ });
    await summary.click();
    await expect(page.getByRole('list', { name: '提醒' })).toBeVisible();

    expect(await smallTargets(page)).toEqual([]);

    await expectNoAxeViolations(page);
    await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  });
});

test.describe('graduation gaps', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('reads the school audit from a synthetic export without sending anything', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await page.getByLabel('上傳全人系統匯出檔').setInputFiles('packages/engine/test/fixtures/synthetic/student-export.json');
    await expect(page.getByText(/學校審查資料日期 2026-10-26/)).toBeVisible();
    await expect(page.getByText(/體育欠 1 門/)).toBeVisible();
    await expectNoAxeViolations(page);
    expect(requests.filter((url) => !url.startsWith('http://localhost:5174/'))).toEqual([]);
    await page.reload();
    await expect(page.getByText(/學校審查資料日期/)).toHaveCount(0);
  });
});

// AI 光球：Gemini 以固定回應取代（不連外）；檢查金鑰只出現在請求標頭。
const FAKE_KEY = 'AIzaSyE2E-fake-key-0000000000000000000';
async function fakeGemini(page: Page) {
  const calls: { url: string; key: string | null; body: string }[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const request = route.request();
    calls.push({ url: request.url(), key: request.headers()['x-goog-api-key'] ?? null, body: request.postData() ?? '' });
    const actions = [{ type: 'addToSchedule', course: '900003001' }, { type: 'answer', text: '幫你加了英文（一）。' }];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actions }) }] }, finishReason: 'STOP' }] }) });
  });
  return calls;
}

for (const viewport of ['desktop', 'mobile'] as const) {
  test.describe(`ai orb on ${viewport}`, () => {
    test.skip(({ isMobile }) => isMobile !== (viewport === 'mobile'), `${viewport} only`);

    test('lets AI add a course, then undo it, without leaking the key', async ({ page }) => {
      const consoleText: string[] = [];
      page.on('console', (message) => consoleText.push(message.text()));
      const calls = await fakeGemini(page);
      await page.goto('/');
      await expect(page.getByRole('banner')).toContainText('115-1');
      if (viewport === 'mobile') await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: 'AI' }).click();
      else await page.getByRole('tab', { name: 'AI' }).click();

      await page.getByRole('checkbox', { name: /我已年滿 18 歲/ }).click();
      await page.getByLabel('Gemini 金鑰').fill(FAKE_KEY);
      await page.getByRole('button', { name: '使用這把金鑰' }).click();
      await page.getByLabel('想怎麼排').fill('幫我加英文');
      await page.getByRole('button', { name: '送出' }).click();
      await expect(page.getByText(/已幫你加入 1 門課/)).toBeVisible();
      await expectNoAxeViolations(page);
      if (viewport === 'mobile') expect(await smallTargets(page)).toEqual([]);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.key).toBe(FAKE_KEY);
      expect(calls[0]!.url).not.toContain('key=');
      expect(calls[0]!.body).not.toContain(FAKE_KEY);
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      expect(stored).not.toContain(FAKE_KEY);
      expect(consoleText.join('\n')).not.toContain(FAKE_KEY);

      await page.getByRole('status', { name: '最近的修改' }).getByRole('button', { name: '復原' }).click();
      if (viewport === 'mobile') await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '課表' }).click();
      await expect(page.getByText('從搜課開始')).toBeVisible();
    });
  });
}
