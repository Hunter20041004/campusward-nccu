import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { App } from './App.tsx';
import { fakeCatalog } from './test/fakeCatalog.ts';
import { memoryStorage } from './test/memoryStorage.ts';

describe('app shell', () => {
  test('names the product and says it is not an official NCCU service', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Campusward');
    expect(screen.getByText('非政大官方服務')).toBeInTheDocument();
  });

  test('switches the side panel to search when typing a query', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
    const side = screen.getByRole('complementary', { name: '側欄' });
    await user.click(within(side).getByRole('tab', { name: 'AI' }));
    expect(within(side).getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '統計');
    expect(within(side).getByRole('tab', { name: '搜課' })).toHaveAttribute('aria-selected', 'true');
  });

  test('offers two ways to start when the timetable is empty', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
    expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '匯入舊站資料' })).toBeInTheDocument();
  });

  test('switches the visible section with the mobile tabs', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    await user.click(within(nav).getByRole('button', { name: '搜課' }));
    expect(within(nav).getByRole('button', { name: '搜課' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-mobile-view="search"]')).toBeInTheDocument();
  });

  test('starting from search focuses the search box', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
    await user.click(screen.getByRole('button', { name: '從搜課開始' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toHaveFocus();
  });
});

describe('course data', () => {
  test('shows the latest semester that has data', async () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
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
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} />);
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
