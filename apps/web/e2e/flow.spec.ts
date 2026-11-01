import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 合成資料：統計學（一234）與會計學（一34）衝堂。
async function addCourse(page: Page, title: string) {
  const search = page.getByRole('searchbox', { name: '搜課' });
  await search.fill(title);
  await page.getByRole('button', { name: `加入課表：${title}` }).click();
}

// 使用導覽只在第一次進站出現；其他流程先標記看過（導覽本身另有一個流程測）。
test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes('usage guide')) await page.addInitScript(() => localStorage.setItem('campusward:guide', 'seen'));
});

/** 桌機右側圖示列切換工具。 */
const openTool = (page: Page, name: string) => page.getByRole('navigation', { name: '工具' }).getByRole('button', { name }).click();

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

    await openTool(page, '匯出與資料');
    await page.getByRole('button', { name: '複製課號清單' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('900001001\n900002001');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出資料' }).click();
    expect((await download).suggestedFilename()).toMatch(/^campusward-\d{4}-\d{2}-\d{2}\.json$/);

    await openTool(page, '模擬課表');
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

  test('reads the school audit from a synthetic export, keeps the reduced record in this browser only, and clears it', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await openTool(page, '畢業缺口');
    await page.getByLabel('上傳全人系統匯出檔').filter({ visible: true }).setInputFiles('packages/engine/test/fixtures/synthetic/student-export.json');
    await expect(page.getByText(/學校審查資料日期 2026-10-26/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/體育欠 1 門/)).toBeVisible();
    await expectNoAxeViolations(page);
    expect(requests.filter((url) => !url.startsWith('http://localhost:5174/'))).toEqual([]);
    // 2026-11-01 起匯入一次、各功能共用：存在這台瀏覽器，重新整理後還在；存的內容不含姓名、學號、分數。
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toMatch(/王合成|SYNTHETIC-0001|"score"/);
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('115-1');
    await openTool(page, '畢業缺口');
    await expect(page.getByText(/學校審查資料日期 2026-10-26/).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: '清除修課資料' }).filter({ visible: true }).click();
    await expect(page.getByText(/學校審查資料日期/).filter({ visible: true })).toHaveCount(0);
  });
});

// 小山的 AI 排課：Gemini 以固定回應取代（不連外）；檢查金鑰只出現在請求標頭。
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
      await page.getByRole('button', { name: '小山', exact: true }).click();

      // 先說需求，小山才在對話裡問年齡與金鑰；設定好就自動把剛才那句送出。
      await page.getByLabel('想怎麼排').fill('幫我加英文');
      await page.getByRole('button', { name: '送出' }).click();
      expect(calls).toHaveLength(0);
      await page.getByRole('checkbox', { name: /我已年滿 18 歲/ }).click();
      await page.getByLabel('Gemini 金鑰').fill(FAKE_KEY);
      await page.getByRole('button', { name: '使用這把金鑰' }).click();
      await expect(page.getByText(/已幫你加入 1 門課/)).toBeVisible();
      await expect(page.getByRole('region', { name: '小山', exact: true }).getByRole('button', { name: '看課表' })).toBeVisible();
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
      else await openTool(page, '模擬課表');
      await expect(page.getByText('從搜課開始')).toBeVisible();
    });
  });
}

test.describe('usage guide', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('shows the usage guide on the first visit, can be skipped, and reopens from the help button', async ({ page }) => {
    await page.goto('/');
    const guide = page.getByRole('dialog');
    await expect(guide.getByRole('heading', { name: '搜課與多條件搜尋' })).toBeVisible();
    // 等視窗淡入動畫結束再量顏色對比。
    await expect.poll(() => guide.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await page.waitForTimeout(300);
    await expectNoAxeViolations(page);
    await guide.getByRole('button', { name: '下一步' }).click();
    await expect(guide.getByRole('heading', { name: '課程詳情與官方資料' })).toBeVisible();
    await guide.getByRole('button', { name: '略過教學' }).click();
    await expect(guide).toBeHidden();
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('115-1');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: '使用導覽' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '搜課與多條件搜尋' })).toBeVisible();
  });
});

// 2026-11-01：外觀改版曾只改到第一頁（使用者發現）。逐頁檢查每個選單、輸入框、按鈕真的是柔浮雕樣式。
test.describe('soft relief on every page', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('every select, input and button on every tool page uses the soft-relief style', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await page.getByRole('searchbox', { name: '搜課' }).fill('統計');
    await page.getByRole('button', { name: '多條件搜尋' }).click();
    await page.getByRole('button', { name: '小山', exact: true }).click();
    for (const name of ['模擬課表', '條件', '匯出與資料', '畢業缺口']) {
      await openTool(page, name);
      const offenders = await page.evaluate(() => [...document.querySelectorAll('select, input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea, .btn')]
        .filter((element) => !element.closest('[hidden]') && element.getBoundingClientRect().width > 0)
        .flatMap((element) => {
          const style = getComputedStyle(element);
          const field = element.closest('.input') ?? element;
          const fieldStyle = getComputedStyle(field);
          const isButton = element.classList.contains('btn');
          const rounded = parseFloat((isButton ? style : fieldStyle).borderTopLeftRadius) >= 16;
          const shadowed = isButton
            ? element.classList.contains('btn-ghost') || (element as HTMLButtonElement).disabled || style.boxShadow !== 'none'
            : fieldStyle.boxShadow.includes('inset');
          return rounded && shadowed ? [] : [`${element.tagName} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 16)} radius=${(isButton ? style : fieldStyle).borderTopLeftRadius}`];
        }));
      expect(offenders, name).toEqual([]);
    }
  });
});

// 第五輪審查：小山按鈕與面板不能蓋住「復原」與「更多」選單。用座標實際點點看。
async function topElementIsUndo(page: Page) {
  return page.evaluate(() => {
    const undo = [...document.querySelectorAll('[aria-label="最近的修改"] button')].find((button) => button.textContent?.includes('復原'));
    if (!undo) return 'no undo button';
    const rect = undo.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit && undo.contains(hit) ? 'ok' : `covered by ${hit?.getAttribute('aria-label') ?? hit?.tagName}`;
  });
}

test.describe('nothing covers the undo button', () => {
  test('on a phone, with a long course name, and the more menu stays clickable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
    await page.getByRole('searchbox', { name: '搜課' }).fill('統計');
    await page.getByRole('button', { name: '加入課表：統計學' }).click();
    expect(await topElementIsUndo(page)).toBe('ok');
    await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '更多' }).click();
    const lastItem = page.getByRole('list', { name: '更多工具' }).getByRole('button').last();
    const box = (await lastItem.boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent, { x: box.x + box.width - 8, y: box.y + box.height / 2 });
    expect(hit).toContain('畢業缺口');
  });

  test('at a medium width while the AI orb panel is open', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop project only');
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: '小山', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜課' }).fill('統計');
    await page.getByRole('button', { name: '加入課表：統計學' }).click({ force: true });
    expect(await topElementIsUndo(page)).toBe('ok');
  });
});

test('buttons respond to hover and the tool rail keeps its rounded squares', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('/');
  const button = page.getByRole('button', { name: '多條件搜尋' });
  const before = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
  await button.hover();
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(before);
  const railRadius = await page.getByRole('navigation', { name: '工具' }).getByRole('button', { name: '條件' }).evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
  expect(railRadius).toBe('16px');
});

test.describe('the buddy (小山)', () => {
  const orbEyes = (page: Page) => page.getByRole('button', { name: '小山', exact: true }).locator('.eyeR').getAttribute('d');
  const orbBody = (page: Page) => page.getByRole('button', { name: '小山', exact: true }).locator('.body').getAttribute('transform');

  test('moves on its own and holds still when asked (remembered after a reload)', async ({ page }) => {
    await page.goto('/');
    const first = await orbBody(page);
    await page.waitForTimeout(400);
    expect(await orbBody(page)).not.toBe(first);
    await page.getByRole('button', { name: '小山', exact: true }).click();
    await page.getByRole('button', { name: '讓小山安靜' }).click();
    await page.getByRole('button', { name: '關閉小山' }).click();
    const frozen = await orbBody(page);
    await page.waitForTimeout(400);
    expect(await orbBody(page)).toBe(frozen);
    await page.reload();
    await page.waitForTimeout(300);
    const afterReload = await orbBody(page);
    await page.waitForTimeout(400);
    expect(await orbBody(page)).toBe(afterReload);
  });

  test('does not move at all with reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('campusward:guide', 'seen'));
    await page.goto('/');
    const eyes = await orbEyes(page), body = await orbBody(page);
    await page.waitForTimeout(600);
    expect(await orbEyes(page)).toBe(eyes);
    expect(await orbBody(page)).toBe(body);
    await context.close();
  });
});
