import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse, type Conflict, type PlanItem, type ScheduleCourse, type ScheduleEntry } from '@campusward/engine';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
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
    expect(block).toHaveAccessibleName(expect.stringContaining('統計學'));
    expect(block).toHaveAccessibleName(expect.stringContaining('234'));
    expect(block).toHaveAccessibleName(expect.stringContaining('週一'));
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

describe('course panel', () => {
  const statsDetails = rowToCourse(officialRow({ subNum: '900001001', subNam: '統計學', teaNam: '陳合成', subTime: '一234', subClassroom: '綜合210' }), { year: 115, semester: 1 }).course!;
  const otherStats = entry('900001011', '統計學', [{ day: 2, start: 790, end: 960 }]).course;
  const otherDetails = rowToCourse(officialRow({ subNum: '900001011', subNam: '統計學', teaNam: '林合成', subTime: '二D56', subClassroom: '研究200', subGde: '統計二甲' }), { year: 115, semester: 1 }).course!;
  const withDetails = (props: Partial<TimetableProps> = {}) => setup({
    courseOf: (key) => (key === stats.course.key ? statsDetails : key === otherStats.key ? otherDetails : undefined),
    otherSections: (key) => (key === stats.course.key ? [{ ...otherStats, teacher: '林合成' }] : []),
    onSwap: vi.fn(),
    ...props,
  });

  test('shows the teacher, classroom, code, credits and official links of the selected course', async () => {
    const user = userEvent.setup();
    withDetails();
    await user.click(within(grid()).getByRole('button', { name: /統計學/ }));
    const panel = screen.getByRole('group', { name: '統計學 的操作' });
    expect(within(panel).getByRole('heading', { name: '統計學' })).toBeInTheDocument();
    for (const text of ['陳合成', '綜合210', '900001001', '3 學分']) expect(panel).toHaveTextContent(text);
    expect(within(panel).getByRole('link', { name: /課綱/ })).toHaveAttribute('href', expect.stringContaining('newdoc.nccu.edu.tw'));
  });

  test('offers other sections that fit and swaps with one click', async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    withDetails({ onSwap });
    await user.click(within(grid()).getByRole('button', { name: /統計學/ }));
    const swap = screen.getByRole('region', { name: '換一班' });
    expect(swap).toHaveTextContent('林合成');
    expect(swap).toHaveTextContent('週二 D56（13:10–16:00）');
    expect(swap).toHaveTextContent('研究200');
    // 看得出是給哪個班開的，才不會換到別系或研究所的班。
    expect(swap).toHaveTextContent('統計二');
    await user.click(within(swap).getByRole('button', { name: '換這班：林合成 週二 D56' }));
    expect(onSwap).toHaveBeenCalledWith(stats.course.key, otherStats.key);
  });

  test('says when no other section fits, and a locked course cannot be swapped', async () => {
    const user = userEvent.setup();
    withDetails();
    await user.click(within(grid()).getByRole('button', { name: /會計學/ }));
    expect(screen.getByRole('region', { name: '換一班' })).toHaveTextContent('沒有其他不衝堂的同名班');
    await user.click(within(grid()).getByRole('button', { name: /夜間課/ }));
    expect(screen.queryByRole('region', { name: '換一班' })).toBeNull();
  });

  test('tells the page which course is open so floating hints can step aside', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    setup({ onSelect });
    await user.click(within(grid()).getByRole('button', { name: /統計學/ }));
    expect(onSelect).toHaveBeenLastCalledWith(stats.course.key);
    await user.click(screen.getByRole('button', { name: '關閉操作' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test('clashing cards keep their full title readable', () => {
    setup();
    for (const title of ['統計學', '會計學']) {
      const block = within(grid()).getByRole('button', { name: new RegExp(title) });
      expect(block).toHaveAttribute('title', expect.stringContaining(title));
      expect(block.querySelector('.line-clamp-2')).toBeNull();
    }
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

// 易用性審查第 8 名：手機預設的行程檢視也能從空檔找課，不用先切到方格。
describe('free stretches in the agenda', () => {
  test('lists each weekday with its free stretches between the classes, each with a 找課 button', async () => {
    const onFindStretch = vi.fn();
    setup({ onFindStretch });
    const agenda = screen.getByRole('list', { name: '每日行程' });
    expect(within(agenda).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['週一', '週二', '週三', '週四', '週五']);
    // 週一 2–4 節有課：之後 C–8 節空著（第 1 節只有一節，不列）。
    const monday = within(agenda).getByRole('button', { name: '找課：週一 C–8 節' });
    expect(monday.closest('li')).toHaveTextContent('12:10–18:00');
    expect(within(agenda).getByRole('button', { name: '找課：週二 整天' }).closest('li')).toHaveTextContent('整天沒課');
    await userEvent.setup().click(within(agenda).getByRole('button', { name: '找課：週二 整天' }));
    expect(onFindStretch).toHaveBeenCalledWith(2, expect.objectContaining({ start: 490, end: 1080, codes: ['1', '2', '3', '4', 'C', 'D', '5', '6', '7', '8'] }));
    // 課和空檔照時間排：週一先是統計學，再來才是下午的空檔。
    const mondayItems = within(within(agenda).getAllByRole('listitem')[0]!).getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(mondayItems.findIndex((text) => text.includes('統計學'))).toBeLessThan(mondayItems.findIndex((text) => text.includes('空著')));
  });

  test('with 不要早八 the free stretches start after period 1, so 找課 does not offer an early slot the preferences then hide', async () => {
    const onFindStretch = vi.fn();
    setup({ onFindStretch, noEarly: true });
    const agenda = screen.getByRole('list', { name: '每日行程' });
    await userEvent.setup().click(within(agenda).getByRole('button', { name: '找課：週二 整天' }));
    expect(onFindStretch).toHaveBeenCalledWith(2, expect.objectContaining({ start: 550, codes: ['2', '3', '4', 'C', 'D', '5', '6', '7', '8'] }));
  });

  test('a free day from the preferences is shown as kept free, without a 找課 button', () => {
    setup({ onFindStretch: vi.fn(), freeDays: [5] });
    const agenda = screen.getByRole('list', { name: '每日行程' });
    expect(within(agenda).queryByRole('button', { name: /^找課：週五/ })).toBeNull();
    expect(agenda).toHaveTextContent('依偏好空下來');
  });
});

test('shows the empty state with two ways to start', () => {
  render(<Timetable entries={[]} conflicts={[]} newKeys={new Set()} onStartSearch={vi.fn()} onImport={vi.fn()} onToggleLock={vi.fn()} onStatus={vi.fn()} onAttendance={vi.fn()} onRemove={vi.fn()} />);
  expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
});

// 易用性審查第 3 名（2026-11-01）：空課表照樣畫格子，第一門課之前就能點空堂找課；說明縮成一行。
test('an empty timetable still draws the grid, so a free cell can be clicked before the first course', async () => {
  const onFindSlot = vi.fn();
  render(<Timetable entries={[]} conflicts={[]} newKeys={new Set()} onStartSearch={vi.fn()} onFindSlot={onFindSlot} onImport={vi.fn()} onToggleLock={vi.fn()} onStatus={vi.fn()} onAttendance={vi.fn()} onRemove={vi.fn()} />);
  const grid = screen.getByRole('group', { name: '每週課表' });
  await userEvent.setup().click(within(grid).getByRole('button', { name: '找週一 D 節的課' }));
  expect(onFindSlot).toHaveBeenCalledWith(1, 'D');
  expect(screen.getByText(/點空格找那段時間排得進去的課/)).toBeInTheDocument();
  // 手機預設的行程檢視在沒有課時是空的：直接顯示方格，不用先切換。
  expect(screen.queryByRole('group', { name: '課表檢視' })).toBeNull();
});
