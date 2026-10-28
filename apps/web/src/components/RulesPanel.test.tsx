import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Conflict, RuleReminder } from '@campusward/engine';
import { expect, test } from 'vitest';
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
