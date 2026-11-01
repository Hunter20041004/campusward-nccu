import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 合成資料：統計學（一234）與會計學（一34）衝堂。
async function addCourse(page: Page, title: string) {
  const search = page.getByRole('searchbox', { name: '搜課' });
  // 搜課和其他工具共用右邊面板（手機是「搜課」分頁）：看不到搜尋框就先切回去。
  if (!(await search.isVisible())) {
    const rail = page.getByRole('navigation', { name: '工具' });
    if (await rail.isVisible()) await rail.getByRole('button', { name: '課程搜尋' }).click();
    else await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
  }
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
    // 稽核 #9：先預覽；統計學與會計學衝堂，要按「仍要複製」才複製。
    await page.getByRole('region', { name: '複製課號清單：主方案' }).getByRole('button', { name: '仍要複製' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('900001001\n900002001');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出資料' }).click();
    expect((await download).suggestedFilename()).toMatch(/^campusward-\d{4}-\d{2}-\d{2}\.json$/);

    // 課表一直在左邊，不用切換。
    await page.getByRole('button', { name: '另存為新備案' }).click();
    await expect(page.getByRole('group', { name: '方案' }).getByRole('button', { name: '備案 1' })).toHaveAttribute('aria-pressed', 'true');

    await expectNoAxeViolations(page);
    await page.reload();
    await expect(page.getByText('共 6 學分')).toBeVisible();
    await expect(page.getByRole('group', { name: '方案' }).getByRole('button', { name: '備案 1' })).toBeVisible();
    await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
  });
});

test.describe('finding courses', () => {
  test('marks a result that clashes with the timetable, and says so after adding it', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    if (isMobile) await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
    await addCourse(page, '統計學');
    await page.getByRole('searchbox', { name: '搜課' }).fill('會計學');
    const row = page.getByRole('article').filter({ hasText: '會計學' });
    await expect(row).toContainText('與「統計學」衝堂');
    await expect(row).toContainText('週一 34（10:10–12:00）');
    await expectNoAxeViolations(page);
    await row.getByRole('button', { name: '加入課表：會計學' }).click();
    await expect(page.getByRole('status', { name: '最近的修改' })).toContainText('已加入「會計學」，與「統計學」衝堂');
    // 手機寬度不能讓整頁橫向捲動。
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('finds courses by department, by grade, and by typing the department name', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    if (isMobile) await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
    await page.getByRole('searchbox', { name: '搜課' }).fill('經濟系');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('夜間設計');
    await expect(page.getByRole('article')).toContainText('經濟二');
    await page.getByRole('searchbox', { name: '搜課' }).fill('');
    await page.getByRole('button', { name: '多條件搜尋' }).click();
    await page.getByRole('combobox', { name: '開課系所' }).selectOption('經濟');
    await page.getByRole('combobox', { name: '年級' }).selectOption('二');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('夜間設計');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (isMobile) expect(await smallTargets(page)).toEqual([]);
    await expectNoAxeViolations(page);
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

  test('the grid view scrolls inside its own box and keeps the bottom tabs on screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    const nav = page.getByRole('navigation', { name: '主要分頁' });
    await nav.getByRole('button', { name: '搜課' }).click();
    await addCourse(page, '統計學');
    await addCourse(page, '會計學');
    await nav.getByRole('button', { name: '課表' }).click();
    await page.getByRole('button', { name: '方格' }).click();
    await expect(page.getByRole('group', { name: '每週課表' })).toBeVisible();
    for (const width of [375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      const box = (await nav.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(width);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      // 方格比螢幕寬時，是方格自己的框可以左右捲，不是整頁。
      expect(await page.getByRole('group', { name: '每週課表' }).evaluate((grid) => {
        const box = grid.parentElement!;
        return box.scrollWidth > box.clientWidth && getComputedStyle(box).overflowX === 'auto';
      })).toBe(true);
    }
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
    const origin = new URL(page.url()).origin;
    expect(requests.filter((url) => !url.startsWith(`${origin}/`))).toEqual([]);
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
    // 候選清單與複製預覽要有內容，才檢查得到裡面的按鈕。
    await addCourse(page, '統計學');
    await page.getByRole('searchbox', { name: '搜課' }).fill('會計學');
    await page.getByRole('button', { name: '加入候選：會計學' }).click();
    await page.getByRole('searchbox', { name: '搜課' }).fill('統計');
    await page.getByRole('button', { name: '多條件搜尋' }).click();
    await page.getByRole('button', { name: '小山', exact: true }).click();
    const offenders = () => page.evaluate(() => [...document.querySelectorAll('select, input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea, .btn')]
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
    for (const name of ['課程搜尋', '候選', '條件', '匯出與資料', '畢業缺口']) {
      await openTool(page, name);
      expect(await offenders(), name).toEqual([]);
    }
    await openTool(page, '候選');
    await expect(page.getByRole('region', { name: '候選清單' }).getByRole('article')).toHaveCount(2);
    expect(await offenders(), '候選（有課）').toEqual([]);
    // 小山面板的按鈕上面已檢查過；收起來才點得到複製按鈕。
    await page.getByRole('button', { name: '小山', exact: true }).click();
    await openTool(page, '匯出與資料');
    await page.getByRole('button', { name: '複製課號清單' }).click();
    await expect(page.getByRole('region', { name: /複製課號清單：/ })).toBeVisible();
    expect(await offenders(), '複製預覽').toEqual([]);
  });
});

// 稽核第二批（2026-11-01）：候選清單看得到、能加入課表與移除；複製課號前先預覽。
test.describe('candidates and copy preview', () => {
  const openView = async (page: Page, isMobile: boolean, name: string) => {
    if (!isMobile) return openTool(page, name);
    await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '更多' }).click();
    await page.getByRole('list', { name: '更多工具' }).getByRole('button', { name }).click();
  };
  const showSearch = async (page: Page, isMobile: boolean) => {
    if (isMobile) await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
  };

  test('lists hearted courses with time, credits and clashes; adds one and removes another', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await openView(page, isMobile, '候選');
    const list = page.getByRole('region', { name: '候選清單' });
    await expect(list).toContainText('還沒有候選課');
    await expect(list).toContainText('♡');
    await expectNoAxeViolations(page);

    await showSearch(page, isMobile);
    await addCourse(page, '統計學');
    await page.getByRole('searchbox', { name: '搜課' }).fill('會計學');
    await page.getByRole('button', { name: '加入候選：會計學' }).click();
    await openView(page, isMobile, '候選');
    const row = list.getByRole('article').filter({ hasText: '會計學' });
    await expect(row).toContainText('週一 34（10:10–12:00）');
    await expect(row).toContainText('學分');
    await expect(row).toContainText('與「統計學」衝堂');
    await expect(list.getByRole('article').filter({ hasText: '統計學' }).first()).toContainText('已在課表');
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (isMobile) expect(await smallTargets(page)).toEqual([]);

    await row.getByRole('button', { name: '加入課表：會計學' }).click();
    await expect(page.getByRole('status', { name: '最近的修改' })).toContainText('已加入「會計學」，與「統計學」衝堂');
    await expect(row).toContainText('已在課表');
    await list.getByRole('button', { name: /^(移除候選|從候選與目前課表移除)：會計學$/ }).click();
    await expect(page.getByRole('status', { name: '最近的修改' })).toContainText('已移出候選「會計學」');
    await expect(list.getByRole('article')).toHaveCount(1);
  });

  test('previews the codes to copy, warns about clashes and copies only ticked rows', async ({ page, context, isMobile }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    await showSearch(page, isMobile);
    await addCourse(page, '統計學');
    await addCourse(page, '會計學');
    await openView(page, isMobile, '匯出與資料');
    await page.getByRole('button', { name: '複製課號清單' }).click();
    const preview = page.getByRole('region', { name: '複製課號清單：主方案' });
    await expect(preview.getByRole('alert')).toContainText('「統計學」與「會計學」衝堂');
    await expect(preview.getByRole('checkbox')).toHaveCount(2);
    await expect(preview.getByRole('checkbox', { name: /^900001001・統計學・週一 234（09:10–12:00）・/ })).toBeChecked();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (isMobile) expect(await smallTargets(page)).toEqual([]);

    await preview.getByRole('button', { name: '回課表處理' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /模擬課表/ })).toBeVisible();

    await openView(page, isMobile, '匯出與資料');
    await page.getByRole('button', { name: '複製課號清單' }).click();
    await preview.getByRole('checkbox', { name: /^900002001/ }).uncheck();
    await preview.getByRole('button', { name: '仍要複製' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('900001001');
    await expect(page.getByRole('status', { name: '資料操作結果' })).toContainText('已複製 1 個課號（主方案）');
  });

  test('asks for the year next to the credits and opens the identity settings', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    if (isMobile) await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '課表' }).click();
    await page.getByRole('button', { name: '設定年級後可檢查學分上下限' }).click();
    const year = page.getByRole('combobox', { name: '年級' });
    await expect(year).toBeFocused();
    await year.selectOption('2');
    if (isMobile) await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '課表' }).click();
    await expect(page.getByText('共 0 學分（12–25）')).toBeVisible();
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
    // 小山面板打開時蓋在右邊的搜課上（聊天時看得到左邊課表的變化）；先加課再打開，確認「復原」仍沒被蓋住。
    await page.getByRole('searchbox', { name: '搜課' }).fill('統計');
    await page.getByRole('button', { name: '加入課表：統計學' }).click();
    await page.getByRole('button', { name: '小山', exact: true }).click();
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

// 稽核第三批（2026-11-01）：課卡面板（詳細資料、換一班）、小山提醒不擋操作、導覽依裝置換說法。
/** 元素中心點最上層是不是它自己（沒有被小山按鈕、泡泡或分頁列蓋住）。 */
const notCovered = (locator: ReturnType<Page['locator']>) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return rect.bottom <= window.innerHeight && rect.top >= 0 && hit !== null && element.contains(hit) ? 'ok' : `covered by ${hit?.closest('button,[role]')?.getAttribute('aria-label') ?? hit?.textContent?.slice(0, 20)}`;
});

test.describe('timetable course panel', () => {
  test('a clashing card opens in view with its details, and swaps to the other section in one undoable step', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    const nav = page.getByRole('navigation', { name: '主要分頁' });
    if (isMobile) await nav.getByRole('button', { name: '搜課' }).click();
    await addCourse(page, '統計學');
    await page.getByRole('searchbox', { name: '搜課' }).fill('900006001');
    await page.getByRole('button', { name: '加入課表：民法概要' }).click();
    if (isMobile) {
      await nav.getByRole('button', { name: '課表' }).click();
      await page.getByRole('list', { name: '每日行程' }).getByRole('button', { name: /民法概要/ }).click();
    } else {
      const grid = page.getByRole('group', { name: '每週課表' });
      // 衝堂並排的兩張卡，課名完整看得到（不被截斷）。
      for (const title of ['統計學', '民法概要']) {
        const card = grid.getByRole('button', { name: new RegExp(`${title}.*衝堂`) });
        expect(await card.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
        await expect(card).toHaveAttribute('title', title);
      }
      await grid.getByRole('button', { name: /民法概要.*衝堂/ }).click();
    }
    const panel = page.getByRole('group', { name: '民法概要 的操作' });
    await expect(panel).toContainText('詹範例');
    await expect(panel).toContainText('法學院101');
    await expect(panel).toContainText('900006001');
    await expect(panel.getByRole('link', { name: /在 Dcard 搜尋心得/ })).toHaveAttribute('href', /^https:\/\/www\.dcard\.tw\/search\?query=/);
    await expect(panel.getByRole('link', { name: /Google 搜尋/ })).toHaveAttribute('rel', 'noopener noreferrer');
    // 打開面板時小山的提醒泡泡讓開；面板捲進畫面，「換這班」沒被蓋住。
    await expect(page.getByRole('button', { name: /個衝堂，要我幫忙看看嗎？/ })).toHaveCount(0);
    // 點了之後面板自己捲進畫面：標題不被頂列、底部分頁列或小山蓋住。
    await expect.poll(() => notCovered(panel.getByRole('heading', { name: '民法概要' }))).toBe('ok');
    const swap = panel.getByRole('button', { name: '換這班：吳範例 週四 34' });
    await swap.scrollIntoViewIfNeeded();
    await expect.poll(() => notCovered(swap)).toBe('ok');
    await expectNoAxeViolations(page);
    if (isMobile) expect(await smallTargets(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

    await swap.click();
    const toast = page.getByRole('status', { name: '最近的修改' });
    await expect(toast).toContainText('已把「民法概要」換成吳範例 週四 34 那一班');
    await expect(page.getByRole('group', { name: '方案' }).getByRole('button')).toHaveText(['主方案', '備案']);
    if (!isMobile) await expect(page.getByRole('group', { name: '每週課表' }).getByRole('button', { name: /衝堂/ })).toHaveCount(0);
    await toast.getByRole('button', { name: '復原' }).click();
    if (isMobile) await expect(page.getByRole('list', { name: '每日行程' })).toContainText('衝堂');
    else await expect(page.getByRole('group', { name: '每週課表' }).getByRole('button', { name: /民法概要.*衝堂/ })).toBeVisible();
  });
});

test.describe('the conflict nudge', () => {
  test('folds into a dot, steps aside for the phone menu, and stays dismissed after a reload', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('115-1');
    const nav = page.getByRole('navigation', { name: '主要分頁' });
    if (isMobile) await nav.getByRole('button', { name: '搜課' }).click();
    await addCourse(page, '統計學');
    await addCourse(page, '會計學');
    const bubble = page.getByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' });
    await expect(bubble).toBeVisible();
    if (isMobile) {
      await nav.getByRole('button', { name: '更多' }).click();
      await expect(bubble).toHaveCount(0);
      await expect.poll(() => notCovered(page.getByRole('list', { name: '更多工具' }).getByRole('button', { name: '條件' }))).toBe('ok');
      await nav.getByRole('button', { name: '更多' }).click();
      // 被選單蓋過一次就收成小點，不再彈回來（手機每次換頁都會開「更多」）。
      await expect(bubble).toHaveCount(0);
      await expect(page.locator('[data-nudge-dot]')).toBeVisible();
    }
    // 約 8 秒後收成按鈕上的小點。
    await expect(bubble).toHaveCount(0, { timeout: 12_000 });
    await expect(page.locator('[data-nudge-dot]')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('115-1');
    await expect(bubble).toBeVisible();
    await page.getByRole('button', { name: '不用了，關掉提醒' }).click();
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('115-1');
    await page.waitForTimeout(500);
    await expect(bubble).toHaveCount(0);
    await expect(page.locator('[data-nudge-dot]')).toHaveCount(0);
  });

  test('on a phone, the last 加入 button in a long result list can scroll clear of the 小山 button', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name: '搜課' }).click();
    await page.getByRole('searchbox', { name: '搜課' }).fill('合成');
    await expect(page.getByRole('article').nth(3)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.getByRole('button', { name: /^加入課表：/ }).last();
    await expect.poll(() => notCovered(last)).toBe('ok');
  });
});

test.describe('usage guide wording and periods', () => {
  test('usage guide speaks about the bottom tabs on a phone and lists the period times', async ({ page, isMobile }) => {
    await page.goto('/');
    const guide = page.getByRole('dialog');
    await expect(guide.getByRole('heading', { name: '搜課與多條件搜尋' })).toBeVisible();
    if (isMobile) {
      await expect(guide).toContainText('底部「搜課」');
      await expect(guide).not.toContainText('左邊');
    } else {
      await expect(guide).toContainText('右邊「課程搜尋」');
    }
    await guide.getByRole('tab', { name: '圖例' }).click();
    const periods = guide.getByRole('table', { name: '政大節次與時間' });
    await expect(periods.getByRole('row')).toHaveCount(17);
    await expect(periods).toContainText('D13:10–14:00');
    await expect.poll(() => guide.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await page.waitForTimeout(300);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
});
