import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addCourse, rowToCourse, toScheduleCourse, type Course, type IdentityProfile, type ScheduleEntry } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { ClassBar } from './ClassBar.tsx';

const make = (code: string, overrides: Record<string, unknown> = {}): Course =>
  rowToCourse(officialRow({ subNum: code, ...overrides }), { year: 115, semester: 1 }).course!;

// 形狀照 115-1 快照（課名、開課班級、節次），老師是虛構的。
const courses = [
  make('703007001', { subNam: '離散數學', subGde: '資訊二', subTime: '二234' }),
  make('703008001', { subNam: '資料結構', subGde: '資訊二', subTime: '四234' }),
  make('703017001', { subNam: '機率論', subGde: '資訊二', subTime: '三D56' }),
  make('703056001', { subNam: '程式能力檢定', subGde: '資訊二', subTime: '未定或彈性' }),
  make('703813001', { subNam: '人工智慧導論', subGde: '資訊二', subKind: '選修', subTime: '一D56' }),
  make('306047001', { subNam: '資訊管理', subGde: '資管二甲資管二乙', subTime: '二234' }),
  make('306047011', { subNam: '資訊管理', subGde: '資管二甲資管二乙', subTime: '三234' }),
  make('000356001', { subNam: '個體經濟學', subGde: '經濟系', subTime: '一234' }),
  make('000358001', { subNam: '經濟數學（一）', subGde: '經濟二', subTime: '五234' }),
];
const keyOf = (code: string) => `1151:${code}`;
const entry = (course: Course): ScheduleEntry => {
  const scheduled = toScheduleCourse(course);
  return { course: scheduled, item: addCourse([], scheduled)[0]! };
};

function setup(profile: IdentityProfile = {}, extra: Partial<Parameters<typeof ClassBar>[0]> = {}) {
  const props = {
    courses,
    profile,
    onProfile: vi.fn(),
    entries: [] as ScheduleEntry[],
    preferences: { freeDays: [] as number[] },
    onAddCourses: vi.fn(),
    onSearch: vi.fn(),
    ...extra,
  };
  render(<ClassBar {...props} />);
  return props;
}

describe('ClassBar', () => {
  test('typing a class sets the class, level and year in one go', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.type(screen.getByRole('combobox', { name: '系級' }), '資訊二');
    expect(props.onProfile).toHaveBeenLastCalledWith({ className: '資訊二', level: 'undergrad', year: 2 });
  });

  test('lists this term\'s required courses of the class from the official 開課班級, and adds them all in one change', async () => {
    const user = userEvent.setup();
    const props = setup({ className: '資訊二', level: 'undergrad', year: 2 });
    const region = screen.getByRole('region', { name: '資訊二 本學期必修' });
    expect(region).toHaveTextContent('本學期必修 4 門');
    expect(region).toHaveTextContent('依官方開課班級，以系上公告為準');
    expect(region).not.toHaveTextContent('人工智慧導論');
    await user.click(within(region).getByRole('button', { name: '全部排入' }));
    expect(props.onAddCourses).toHaveBeenCalledWith(
      [keyOf('703007001'), keyOf('703008001'), keyOf('703017001'), keyOf('703056001')],
      '已排入資訊二必修 4 門',
    );
  });

  test('chooses a section that does not clash with what is already on the timetable', async () => {
    const user = userEvent.setup();
    const busy = make('900001001', { subNam: '已排的課', subTime: '二234' });
    const props = setup({ className: '資管二' }, { entries: [entry(busy)] });
    const region = screen.getByRole('region', { name: '資管二 本學期必修' });
    expect(region).toHaveTextContent('週三 234');
    await user.click(within(region).getByRole('button', { name: '全部排入' }));
    expect(props.onAddCourses).toHaveBeenCalledWith([keyOf('306047011')], '已排入資管二必修 1 門');
  });

  test('unticked courses are left out', async () => {
    const user = userEvent.setup();
    const props = setup({ className: '資訊二' });
    const region = screen.getByRole('region', { name: '資訊二 本學期必修' });
    await user.click(within(region).getByRole('checkbox', { name: /機率論/ }));
    await user.click(within(region).getByRole('button', { name: '排入勾選的 3 門' }));
    expect(vi.mocked(props.onAddCourses).mock.calls[0]![0]).not.toContain(keyOf('703017001'));
  });

  test('courses already on the timetable are marked and not added again; all done collapses to one line', () => {
    setup({ className: '資訊二' }, { entries: ['703007001', '703008001', '703017001', '703056001'].map((code) => entry(courses.find((course) => course.code === code)!)) });
    const region = screen.getByRole('region', { name: '資訊二 本學期必修' });
    expect(region).toHaveTextContent('4 門都在課表上');
    expect(within(region).queryByRole('button', { name: '全部排入' })).toBeNull();
  });

  test('a required course whose every section clashes is reported with what blocks it, and can be searched', async () => {
    const user = userEvent.setup();
    const busy = make('900001001', { subNam: '社團課', subTime: '三D56' });
    const props = setup({ className: '資訊二' }, { entries: [entry(busy)] });
    const region = screen.getByRole('region', { name: '資訊二 本學期必修' });
    expect(region).toHaveTextContent('機率論：每一班都和「社團課」衝堂');
    await user.click(within(region).getByRole('button', { name: '搜尋機率論' }));
    expect(props.onSearch).toHaveBeenCalledWith('機率論');
  });

  test('department-wide required courses are only listed as "maybe", one click each', async () => {
    const user = userEvent.setup();
    const props = setup({ className: '經濟二' });
    const region = screen.getByRole('region', { name: '經濟二 本學期必修' });
    expect(region).toHaveTextContent('本學期必修 1 門');
    await user.click(within(region).getByText(/可能要修 1 門/));
    await user.click(within(region).getByRole('button', { name: /加入個體經濟學/ }));
    expect(props.onAddCourses).toHaveBeenCalledWith([keyOf('000356001')], '已加入「個體經濟學」');
    await user.click(within(region).getByRole('button', { name: '全部排入' }));
    expect(props.onAddCourses).toHaveBeenLastCalledWith([keyOf('000358001')], '已排入經濟二必修 1 門');
  });

  test('the year buttons set the year, and change the class year when a class is set', async () => {
    const user = userEvent.setup();
    const props = setup({ className: '資訊二', level: 'undergrad', year: 2 });
    const years = screen.getByRole('radiogroup', { name: '年級' });
    expect(within(years).getByRole('radio', { name: '大二' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(years).getByRole('radio', { name: '大三' }));
    expect(props.onProfile).toHaveBeenLastCalledWith({ className: '資訊三', level: 'undergrad', year: 3 });
    await user.click(within(years).getByRole('radio', { name: '研究所' }));
    expect(props.onProfile).toHaveBeenLastCalledWith({ level: 'graduate' });
  });

  test('the year choice is one tab stop and the arrow keys move along it', async () => {
    const user = userEvent.setup();
    const props = setup({ level: 'undergrad', year: 2 });
    const years = screen.getByRole('radiogroup', { name: '年級' });
    expect(within(years).getAllByRole('radio').filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    within(years).getByRole('radio', { name: '大二' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(props.onProfile).toHaveBeenLastCalledWith({ level: 'undergrad', year: 3 });
    expect(within(years).getByRole('radio', { name: '大三' })).toHaveFocus();
  });

  test('an imported 全人系統 record pre-fills the class with one confirm', async () => {
    const user = userEvent.setup();
    const props = setup({}, { suggested: { className: '資管二乙', profile: { level: 'undergrad', year: 2, additionalMajor: 'none' } } });
    expect(screen.getByText(/全人系統資料是「資管二乙」/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '用這個系級' }));
    expect(props.onProfile).toHaveBeenCalledWith({ className: '資管二乙', level: 'undergrad', year: 2, additionalMajor: 'none' });
  });

  test('no suggestion once the class matches the record', () => {
    setup({ className: '資管二乙' }, { suggested: { className: '資管二乙', profile: { level: 'undergrad', year: 2 } } });
    expect(screen.queryByRole('button', { name: '用這個系級' })).toBeNull();
  });
});
