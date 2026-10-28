import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Conflict, PlanItem, ScheduleCourse, ScheduleEntry } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { Timetable, type TimetableProps } from './Timetable.tsx';

function entry(code: string, title: string, meetings: { day: number; start: number; end: number }[], item: Partial<PlanItem> = {}, asyncAllowed = false): ScheduleEntry {
  const key = `1151:${code}`;
  const course: ScheduleCourse = {
    key, code, title, credits: 3, itemType: 'course', events: [], eligibility: {},
    meetings: meetings.map((meeting) => ({ ...meeting, label: '' })),
    delivery: { mode: asyncAllowed ? 'asynchronous-optional' : 'in-person', asyncAllowed, defaultAttendance: 'sync' },
  };
  return { course, item: { key, attendance: 'sync', status: 'planned', locked: false, ...item } };
}

const stats = entry('900001001', '統計學', [{ day: 1, start: 550, end: 720 }]);
const accounting = entry('900002001', '會計學', [{ day: 1, start: 610, end: 720 }]);
const evening = entry('900003001', '夜間課', [{ day: 3, start: 1110, end: 1200 }], { locked: true, status: 'registered' });
const flexible = entry('900004001', '彈性專題', []);
const remote = entry('900005001', '遠距課', [{ day: 4, start: 790, end: 960 }], { attendance: 'async' }, true);
const conflict: Conflict = { type: 'weekly', courseKeys: [stats.course.key, accounting.course.key], message: '統計學 與 會計學 每週時段重疊' };

function setup(props: Partial<TimetableProps> = {}) {
  const handlers = { onStartSearch: vi.fn(), onImport: vi.fn(), onToggleLock: vi.fn(), onStatus: vi.fn(), onAttendance: vi.fn(), onRemove: vi.fn() };
  render(<Timetable entries={[stats, accounting, evening, flexible, remote]} conflicts={[conflict]} newKeys={new Set([accounting.course.key])} {...handlers} {...props} />);
  return handlers;
}

const grid = () => screen.getByRole('group', { name: '每週課表' });

describe('Timetable grid', () => {
  test('shows weekdays and only adds weekend columns when needed', () => {
    setup();
    const headers = [...grid().querySelectorAll('[data-day-header]')].map((cell) => cell.textContent);
    expect(headers).toEqual(['一', '二', '三', '四', '五']);
  });

  test('shows daytime periods plus evening periods that are in use', () => {
    setup();
    const rows = [...grid().querySelectorAll('[data-period]')].map((cell) => cell.getAttribute('data-period'));
    expect(rows).toEqual(['1', '2', '3', '4', 'C', 'D', '5', '6', '7', '8', 'E', 'F']);
  });

  test('places a course on its day and periods', () => {
    setup();
    const block = within(grid()).getByRole('button', { name: /統計學/ });
    expect(block).toHaveAccessibleName(expect.stringContaining('週一 234'));
    expect(block.style.gridColumnStart).toBe('2');
    expect(block.style.gridRowStart).toBe('3');
    expect(block.style.gridRowEnd).toBe('span 3');
  });

  test('marks both conflicting courses', () => {
    setup();
    for (const title of ['統計學', '會計學']) {
      const block = within(grid()).getByRole('button', { name: new RegExp(title) });
      expect(block).toHaveAttribute('data-conflict', 'true');
      expect(block).toHaveAccessibleName(expect.stringContaining('衝堂'));
    }
  });

  test('labels a newly added course', () => {
    setup();
    expect(within(grid()).getByRole('button', { name: /會計學/ })).toHaveTextContent('新');
  });

  test('shows locked and registered courses', () => {
    setup();
    const block = within(grid()).getByRole('button', { name: /夜間課/ });
    expect(block).toHaveAccessibleName(expect.stringContaining('已鎖定'));
    expect(block).toHaveTextContent('已灌檔');
  });

  test('does not place an asynchronously attended course on the grid', () => {
    setup();
    expect(within(grid()).queryByRole('button', { name: /遠距課/ })).toBeNull();
  });

  test('lists courses without a fixed weekly time separately', () => {
    setup();
    const list = screen.getByRole('list', { name: '沒有固定時間' });
    expect(within(list).getByText('彈性專題')).toBeInTheDocument();
    expect(within(list).getByText('遠距課')).toBeInTheDocument();
    expect(list).toHaveTextContent('非同步');
  });
});

describe('course actions', () => {
  test('selecting a course shows its actions', async () => {
    const user = userEvent.setup();
    const handlers = setup();
    await user.click(within(grid()).getByRole('button', { name: /統計學/ }));
    const actions = screen.getByRole('group', { name: '統計學 的操作' });
    await user.click(within(actions).getByRole('button', { name: '鎖定' }));
    expect(handlers.onToggleLock).toHaveBeenCalledWith(stats.course.key);
    await user.selectOptions(within(actions).getByRole('combobox', { name: '狀態' }), 'enrolled');
    expect(handlers.onStatus).toHaveBeenCalledWith(stats.course.key, 'enrolled');
    await user.click(within(actions).getByRole('button', { name: '移出課表' }));
    expect(handlers.onRemove).toHaveBeenCalledWith(stats.course.key);
  });

  test('offers async attendance only when the course allows it', async () => {
    const user = userEvent.setup();
    const handlers = setup();
    await user.click(within(grid()).getByRole('button', { name: /統計學/ }));
    expect(within(screen.getByRole('group', { name: '統計學 的操作' })).queryByRole('button', { name: /非同步/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /遠距課/ }));
    await user.click(within(screen.getByRole('group', { name: '遠距課 的操作' })).getByRole('button', { name: '改為同步上課' }));
    expect(handlers.onAttendance).toHaveBeenCalledWith(remote.course.key, 'sync');
  });

  test('a locked course cannot be removed and says why', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(within(grid()).getByRole('button', { name: /夜間課/ }));
    const actions = screen.getByRole('group', { name: '夜間課 的操作' });
    expect(within(actions).queryByRole('button', { name: '移出課表' })).toBeNull();
    expect(actions).toHaveTextContent('已鎖定，解鎖後才能移出');
  });
});

describe('agenda view', () => {
  test('lists meetings by weekday from morning to evening', () => {
    setup();
    const agenda = screen.getByRole('list', { name: '每日行程' });
    const days = within(agenda).getAllByRole('heading').map((heading) => heading.textContent);
    expect(days).toEqual(['週一', '週三']);
    expect(within(agenda).getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('統計學'), expect.stringContaining('會計學')]),
    );
  });
});

test('shows the empty state with two ways to start', () => {
  render(<Timetable entries={[]} conflicts={[]} newKeys={new Set()} onStartSearch={vi.fn()} onImport={vi.fn()} onToggleLock={vi.fn()} onStatus={vi.fn()} onAttendance={vi.fn()} onRemove={vi.fn()} />);
  expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
});
