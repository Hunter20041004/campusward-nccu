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

    await expectNoAxeViolations(page);
    await page.reload();
    await expect(page.getByText('共 6 學分')).toBeVisible();
    await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
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

    const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, label[class*="btn"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !element.classList.contains('sr-only');
      })
      // 包在外框（label）裡的輸入框，可點範圍是整個外框。
      .map((element) => (element.tagName === 'INPUT' && element.closest('label') ? element.closest('label')! : element))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.height < 44 || rect.width < 44;
      })
      .map((element) => `${element.tagName} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 20)} ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`));
    expect(small).toEqual([]);

    await expectNoAxeViolations(page);
    await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  });
});
