import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Conflict, RuleReminder } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import { RulesPanel } from './RulesPanel.tsx';

const conflict: Conflict = { type: 'weekly', courseKeys: ['a', 'b'], message: '統計學 與 會計學 每週時段重疊' };
const reminders: RuleReminder[] = [
  { id: 'fee', severity: 'info', message: '統計專題 是收費課程。', source: '選課須知 114.07 版 8-1 一、', courseKeys: ['c'] },
  { id: 'credit-maximum', severity: 'warn', message: '目前 30 學分，超過無加修學系學分上限 25 學分。', source: '選課須知 114.07 版 8-1 二、(一)2；8-2 (四)4' },
];

test('lists conflicts and warnings before information, each with its source', () => {
  render(<RulesPanel conflicts={[conflict]} reminders={reminders} />);
  const items = within(screen.getByRole('list', { name: '提醒' })).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining('統計學 與 會計學 每週時段重疊'),
    expect.stringContaining('超過無加修學系學分上限'),
    expect.stringContaining('收費課程'),
  ]);
  expect(items[1]).toHaveTextContent('選課須知 114.07 版 8-1 二、(一)2；8-2 (四)4');
  expect(items[0]).toHaveTextContent('衝堂');
});

test('says reminders only remind and never block', () => {
  render(<RulesPanel conflicts={[]} reminders={reminders} />);
  expect(screen.getByText(/只提醒，不會擋你/)).toBeInTheDocument();
});

test('shows a calm message when there is nothing to remind', () => {
  render(<RulesPanel conflicts={[]} reminders={[]} />);
  expect(screen.getByText('目前沒有衝堂或選課規則提醒。')).toBeInTheDocument();
});

test('collapses to a summary on small screens', async () => {
  const user = userEvent.setup();
  render(<RulesPanel conflicts={[conflict]} reminders={reminders} />);
  const toggle = screen.getByRole('button', { name: '3 則提醒，其中 2 則需要注意' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('lists possible retakes from the imported record with where the reminder comes from', () => {
  render(<RulesPanel conflicts={[]} reminders={[]} retakes={[{ key: '1151:900001001', message: '「統計學」與你已通過的「統計學」同名，可能是重複修習。' }]} />);
  const list = screen.getByRole('list', { name: '提醒' });
  expect(list).toHaveTextContent('重修');
  expect(list).toHaveTextContent('與你已通過的「統計學」同名');
  expect(list).toHaveTextContent('出處：你匯入的全人系統資料');
});

// 易用性審查第 4 名（2026-11-01）：衝堂那一列直接附換班按鈕，不用先找課卡。
test('a clash row offers the same section swap as the toast', async () => {
  const onClick = vi.fn();
  render(<RulesPanel conflicts={[conflict]} reminders={[]} fixFor={() => ({ label: '換到週一 D56 那班', description: '把「會計學」換到週一 D56 那班', onClick })} />);
  const row = within(screen.getByRole('list', { name: '提醒' })).getAllByRole('listitem')[0]!;
  await userEvent.setup().click(within(row).getByRole('button', { name: '把「會計學」換到週一 D56 那班' }));
  expect(onClick).toHaveBeenCalled();
});
