import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from './App.tsx';
import { fakeCatalog } from './test/fakeCatalog.ts';
import { memoryStorage } from './test/memoryStorage.ts';

describe('app shell', () => {
  test('names the product and says it is not an official NCCU service', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Campusward');
    expect(screen.getAllByText('非政大官方服務').length).toBeGreaterThan(0);
  });

  test('switches the right panel with the tool rail while search stays on the left', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    const rail = screen.getByRole('navigation', { name: '工具' });
    await user.click(within(rail).getByRole('button', { name: 'AI 光球' }));
    expect(within(rail).getByRole('button', { name: 'AI 光球' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: /AI 光球/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜課' })).toBeInTheDocument();
  });

  test('shows the usage guide on the first visit only, and reopens it from the help button', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App catalog={fakeCatalog()} storage={storage} />);
    expect(screen.getByRole('heading', { name: '搜課、加入課表' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '略過教學' }));
    first.unmount();
    render(<App catalog={fakeCatalog()} storage={storage} />);
    expect(screen.queryByRole('heading', { name: '搜課、加入課表' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用導覽' }));
    expect(screen.getByRole('heading', { name: '搜課、加入課表' })).toBeInTheDocument();
  });

  test('offers two ways to start when the timetable is empty', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '匯入舊站資料' })).toBeInTheDocument();
  });

  test('switches the visible section with the mobile tabs', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    await user.click(within(nav).getByRole('button', { name: '搜課' }));
    expect(within(nav).getByRole('button', { name: '搜課' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-mobile-view="search"]')).toBeInTheDocument();
  });

  test('starting from search focuses the search box', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await user.click(screen.getByRole('button', { name: '從搜課開始' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toHaveFocus();
  });
});

describe('course data', () => {
  test('shows the latest semester that has data', async () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(await screen.findByText('115-1')).toBeInTheDocument();
  });

  test('explains when course data cannot be loaded', async () => {
    render(<App catalog={fakeCatalog({ listTerms: async () => { throw new Error('offline'); } })} storage={memoryStorage()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('課程資料暫時載入不了');
  });
});

describe('searching and adding', () => {
  test('adds a found course to the timetable, updates credits, and can undo', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    expect(screen.getByText(/共/)).toHaveTextContent('共 3 學分');
    const toast = screen.getByRole('status', { name: '最近的修改' });
    expect(toast).toHaveTextContent('已加入「合成課程概論」');
    await user.click(within(toast).getByRole('button', { name: '復原' }));
    expect(screen.getByText(/共/)).toHaveTextContent('共 0 學分');
  });

  test('keeps the timetable after a reload', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App catalog={fakeCatalog()} storage={storage} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    first.unmount();
    render(<App catalog={fakeCatalog()} storage={storage} />);
    await screen.findByText('115-1');
    expect(screen.getByText(/共/)).toHaveTextContent('共 3 學分');
  });
});

test('clearing local data also removes the Gemini key', async () => {
  const user = userEvent.setup();
  const ai = { hasKey: () => true, setKey: vi.fn(), removeKey: vi.fn(), generate: vi.fn() };
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} ai={ai} guide={false} />);
  const rail = screen.getByRole('navigation', { name: '工具' });
  await screen.findByText('115-1');
  await user.click(within(rail).getByRole('button', { name: '匯出與資料' }));
  await user.click(await screen.findByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  expect(ai.removeKey).toHaveBeenCalled();
});

test('clearing local data resets the AI panel and the graduation gaps', async () => {
  const user = userEvent.setup();
  const { createGeminiClient } = await import('./ai/gemini.ts');
  const ai = createGeminiClient({ fetchImpl: vi.fn(), session: null });
  ai.setKey(`AIza${'x'.repeat(35)}`, false);
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} ai={ai} guide={false} />);
  const exportJson = (await import('../../../packages/engine/test/fixtures/synthetic/student-export.json')).default;
  const rail = screen.getByRole('navigation', { name: '工具' });
  await screen.findByText('115-1');
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  await user.upload(await screen.findByLabelText('上傳全人系統匯出檔'), new File([JSON.stringify(exportJson)], 'e.json', { type: 'application/json' }));
  expect(await screen.findByText(/學校審查資料日期/)).toBeInTheDocument();
  await user.click(within(rail).getByRole('button', { name: 'AI 光球' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  expect(screen.getByRole('button', { name: '移除金鑰' })).toBeInTheDocument();
  await user.click(within(rail).getByRole('button', { name: '匯出與資料' }));
  await user.click(screen.getByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  expect(screen.queryByText(/學校審查資料日期/)).not.toBeInTheDocument();
  await user.click(within(rail).getByRole('button', { name: 'AI 光球' }));
  expect(screen.queryByRole('button', { name: '移除金鑰' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).not.toBeChecked();
});

test('keeps the AI panel state when switching tools', async () => {
  const user = userEvent.setup();
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
  const rail = screen.getByRole('navigation', { name: '工具' });
  await user.click(within(rail).getByRole('button', { name: 'AI 光球' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  await user.click(within(rail).getByRole('button', { name: '條件' }));
  await user.click(within(rail).getByRole('button', { name: 'AI 光球' }));
  expect(screen.getByLabelText('Gemini 金鑰')).toBeInTheDocument();
});
