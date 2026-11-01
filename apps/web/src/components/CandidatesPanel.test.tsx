import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScheduleCourse } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import { CandidatesPanel, type CandidatesPanelProps } from './CandidatesPanel.tsx';

// 稽核 #5（2026-11-01）：按愛心收藏的候選要有地方看、能加入課表或移除。
const course = (code: string, title: string, credits: number, meeting?: { day: number; start: number; end: number }): ScheduleCourse => ({
  key: `1151:${code}`, code, title, credits, itemType: 'course', events: [], eligibility: {},
  meetings: meeting ? [{ ...meeting, label: '' }] : [],
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
});
const stats = course('900001001', '統計學', 3, { day: 1, start: 550, end: 720 });
const accounting = course('900002001', '會計學', 2, { day: 1, start: 610, end: 720 });
const catalog = new Map([stats, accounting].map((value) => [value.key, value]));

function setup(overrides: Partial<CandidatesPanelProps> = {}) {
  const props: CandidatesPanelProps = {
    candidates: [stats.key, accounting.key],
    catalog,
    scheduledKeys: new Set([accounting.key]),
    clashesOf: (value) => (value.key === stats.key ? ['會計學'] : []),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onStartSearch: vi.fn(),
    ...overrides,
  };
  render(<CandidatesPanel {...props} />);
  return props;
}

test('explains how to collect candidates when the list is empty', async () => {
  const props = setup({ candidates: [] });
  const list = screen.getByRole('region', { name: '候選清單' });
  expect(list).toHaveTextContent('還沒有候選課');
  expect(list).toHaveTextContent('♡');
  await userEvent.setup().click(screen.getByRole('button', { name: '去搜課' }));
  expect(props.onStartSearch).toHaveBeenCalled();
});

test('lists each candidate with its time, clock time and credits', () => {
  setup();
  const rows = screen.getAllByRole('article');
  expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual(['統計學', '會計學']);
  expect(rows[0]).toHaveTextContent('週一 234（09:10–12:00）');
  expect(rows[0]).toHaveTextContent('3 學分');
  expect(screen.getByRole('region', { name: '候選清單' })).toHaveTextContent('2 門候選，1 門還沒排進課表');
});

test('says which candidate clashes with the timetable', () => {
  setup();
  const [first] = screen.getAllByRole('article');
  expect(first).toHaveTextContent('與「會計學」衝堂');
});

test('adds an unscheduled candidate to the timetable and marks the scheduled one', async () => {
  const props = setup();
  const [first, second] = screen.getAllByRole('article');
  await userEvent.setup().click(within(first!).getByRole('button', { name: '加入課表：統計學' }));
  expect(props.onAdd).toHaveBeenCalledWith(stats.key);
  expect(within(second!).queryByRole('button', { name: /加入課表/ })).toBeNull();
  expect(second).toHaveTextContent('已在課表');
});

test('removes a candidate', async () => {
  const props = setup();
  await userEvent.setup().click(screen.getByRole('button', { name: /^(移除候選|從候選與目前課表移除)：會計學$/ }));
  expect(props.onRemove).toHaveBeenCalledWith(accounting.key);
});

test('can still remove a candidate that is no longer in this term', async () => {
  const props = setup({ candidates: ['1151:999999001'] });
  const [row] = screen.getAllByRole('article');
  expect(row).toHaveTextContent('本學期資料找不到這門課');
  expect(within(row!).queryByRole('button', { name: /加入課表/ })).toBeNull();
  await userEvent.setup().click(within(row!).getByRole('button', { name: /移除候選/ }));
  expect(props.onRemove).toHaveBeenCalledWith('1151:999999001');
});
