import { expect, test, type Page } from '@playwright/test';

// 正式建置＋public/_headers：CSP 沒有被違反、連線只到本站與 Gemini、桌布在 CSP 下可下載（計畫 3b、5.3）。
const ALLOWED_ORIGINS = ['http://localhost:5175', 'https://generativelanguage.googleapis.com', 'https://es.nccu.edu.tw'];
const FAKE_KEY = 'AIzaSyE2E-fake-key-0000000000000000000';

const openTool = (page: Page, name: string) => page.getByRole('navigation', { name: '工具' }).getByRole('button', { name }).click();

async function watch(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    localStorage.setItem('campusward:guide', 'seen');
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return {
    requests,
    violations: () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  };
}

test('serves the security headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).toContain('connect-src \'self\' https://generativelanguage.googleapis.com https://es.nccu.edu.tw;');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-frame-options']).toBe('DENY');
});

test('runs the main flows without CSP violations or unexpected connections', async ({ page }) => {
  const { requests, violations } = await watch(page);
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actions: [{ type: 'addToSchedule', course: '900003001' }] }) }] }, finishReason: 'STOP' }] }),
  }));
  await page.goto('/');
  await expect(page.getByRole('banner')).toContainText('115-1');

  await page.getByRole('searchbox', { name: '搜課' }).fill('統計學');
  await page.getByRole('button', { name: '加入課表：統計學' }).click();
  await expect(page.getByText('共 3 學分')).toBeVisible();

  // 單門課向官方確認：測試不連真的政大，回一筆教師不同的資料。
  const official = await page.evaluate(async () => (await fetch('/snapshots/1151/courses.json').then((response) => response.json()) as { code: string }[]).find(({ code }) => code === '900001001'));
  expect(official).toBeTruthy();
  await page.route('https://es.nccu.edu.tw/**', (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  await page.locator('button[aria-controls^="details-"]').first().click();
  await page.getByRole('button', { name: '向官方確認最新資料' }).click();
  await expect(page.getByText(/政大課程查詢目前查不到這門課/)).toBeVisible();

  const download = page.waitForEvent('download');
  await openTool(page, '匯出與資料');
  await page.getByRole('button', { name: '手機桌布' }).click();
  expect((await download).suggestedFilename()).toMatch(/課表\.png$/);

  await openTool(page, '畢業缺口');
  await page.getByLabel('上傳全人系統匯出檔').filter({ visible: true }).setInputFiles('packages/engine/test/fixtures/synthetic/student-export.json');
  await expect(page.getByText(/學校審查資料日期/).filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: '小山', exact: true }).click();
  // 課綱問答：沒有金鑰也能查本機索引（延遲載入的程式包，CSP 下也要能跑）。
  await page.getByRole('group', { name: '小山能幫的事' }).getByRole('button', { name: '問課綱' }).click();
  await page.getByLabel('想問課程的什麼').fill('期末報告');
  await page.getByRole('button', { name: '查課綱' }).click();
  await expect(page.getByRole('list', { name: '找到的課綱段落' })).toContainText('英文（一）');
  await page.getByRole('group', { name: '小山能幫的事' }).getByRole('button', { name: '排課' }).click();
  await page.getByLabel('想怎麼排').fill('加英文');
  await page.getByRole('button', { name: '送出' }).click();
  await page.getByRole('checkbox', { name: /我已年滿 18 歲/ }).click();
  await page.getByLabel('Gemini 金鑰').fill(FAKE_KEY);
  await page.getByRole('button', { name: '使用這把金鑰' }).click();
  await expect(page.getByText(/已幫你加入 1 門課/)).toBeVisible();

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1, name: '隱私說明' })).toBeVisible();

  expect(await violations()).toEqual([]);
  const outside = requests.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:') && !ALLOWED_ORIGINS.some((origin) => url.startsWith(`${origin}/`)));
  expect(outside).toEqual([]);
});
