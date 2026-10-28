import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { App } from './App.tsx';
import { fakeCatalog } from './test/fakeCatalog.ts';

describe('app shell', () => {
  test('names the product and says it is not an official NCCU service', () => {
    render(<App catalog={fakeCatalog()} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Campusward');
    expect(screen.getByText('非政大官方服務')).toBeInTheDocument();
  });

  test('switches the side panel to search when typing a query', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} />);
    const side = screen.getByRole('complementary', { name: '側欄' });
    await user.click(within(side).getByRole('tab', { name: 'AI' }));
    expect(within(side).getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '統計');
    expect(within(side).getByRole('tab', { name: '搜課' })).toHaveAttribute('aria-selected', 'true');
  });

  test('offers two ways to start when the timetable is empty', () => {
    render(<App catalog={fakeCatalog()} />);
    expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '匯入舊站資料' })).toBeInTheDocument();
  });

  test('switches the visible section with the mobile tabs', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} />);
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    await user.click(within(nav).getByRole('button', { name: '搜課' }));
    expect(within(nav).getByRole('button', { name: '搜課' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-mobile-view="search"]')).toBeInTheDocument();
  });

  test('starting from search focuses the search box', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} />);
    await user.click(screen.getByRole('button', { name: '從搜課開始' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toHaveFocus();
  });
});

describe('course data', () => {
  test('shows the latest semester that has data', async () => {
    render(<App catalog={fakeCatalog()} />);
    expect(await screen.findByText('115-1')).toBeInTheDocument();
  });

  test('explains when course data cannot be loaded', async () => {
    render(<App catalog={fakeCatalog({ listTerms: async () => { throw new Error('offline'); } })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('課程資料暫時載入不了');
  });
});
