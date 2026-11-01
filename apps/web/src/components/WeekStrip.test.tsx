import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Conflict, ScheduleCourse, ScheduleEntry } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import { WeekStrip } from './WeekStrip.tsx';

function entry(key: string, meetings: { day: number; start: number; end: number }[], credits = 3): ScheduleEntry {
  const course: ScheduleCourse = {
    key, code: key, title: key, credits, itemType: 'course', events: [], eligibility: {},
    meetings: meetings.map((meeting) => ({ ...meeting, label: '' })),
    delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
  };
  return { course, item: { key, attendance: 'sync', status: 'planned', locked: false } };
}

// 週一 234、週一 34（衝堂）、週三 D56。
const stats = entry('stats', [{ day: 1, start: 550, end: 720 }]);
const accounting = entry('accounting', [{ day: 1, start: 610, end: 720 }]);
const law = entry('law', [{ day: 3, start: 790, end: 960 }], 2);
const conflict: Conflict = { type: 'weekly', courseKeys: ['stats', 'accounting'], message: '' };
const cell = (day: number, code: string) => document.querySelector(`[data-cell="${day}-${code}"]`)!;

// 易用性審查第 8 名：手機搜課頁頂端的迷你週條，加了課馬上看得到那個時段亮起來，衝堂變珊瑚色。
test('lights up occupied periods, marks clashes in coral and the course just added', () => {
  render(<WeekStrip entries={[stats, accounting, law]} conflicts={[conflict]} newKeys={new Set(['law'])} onOpen={vi.fn()} />);
  expect(cell(1, '2').getAttribute('data-state')).toBe('busy');
  expect(cell(1, '3').getAttribute('data-state')).toBe('clash');
  expect(cell(1, '1').getAttribute('data-state')).toBe('free');
  expect(cell(3, '5').getAttribute('data-state')).toBe('new');
  expect(cell(2, '5').getAttribute('data-state')).toBe('free');
  const button = screen.getByRole('button', { name: /看完整課表/ });
  expect(button).toHaveAccessibleName(expect.stringContaining('3 門'));
  expect(button).toHaveAccessibleName(expect.stringContaining('1 個衝堂'));
  expect(button).toHaveTextContent('8 學分');
  expect(button).toHaveTextContent('衝堂 1');
});

test('shows weekdays only, adds a weekend day when used, and opens the timetable', async () => {
  const onOpen = vi.fn();
  const saturday = entry('sat', [{ day: 6, start: 490, end: 600 }]);
  const { rerender } = render(<WeekStrip entries={[law]} conflicts={[]} newKeys={new Set()} onOpen={onOpen} />);
  expect(document.querySelectorAll('[data-strip-day]')).toHaveLength(5);
  rerender(<WeekStrip entries={[law, saturday]} conflicts={[]} newKeys={new Set()} onOpen={onOpen} />);
  expect(document.querySelectorAll('[data-strip-day]')).toHaveLength(6);
  await userEvent.setup().click(screen.getByRole('button', { name: /看完整課表/ }));
  expect(onOpen).toHaveBeenCalled();
});

test('an empty timetable says so', () => {
  render(<WeekStrip entries={[]} conflicts={[]} newKeys={new Set()} onOpen={vi.fn()} />);
  expect(screen.getByRole('button', { name: /看完整課表/ })).toHaveAccessibleName(expect.stringContaining('還沒有排課'));
});
