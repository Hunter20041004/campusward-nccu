import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseClassName, parseEnrollmentRules, rowToCourse, toScheduleCourse, type FillContext, type ScheduleCourse } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import enrollmentRules from '../../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { FillPlanner, targetOptions } from './FillPlanner.tsx';

const make = (code: string, overrides: Record<string, unknown> = {}): ScheduleCourse =>
  toScheduleCourse(rowToCourse(officialRow({ subNum: code, ...overrides }), { year: 115, semester: 1 }).course!);

// 虛構：資訊二兩門必修、一門本系選修、幾門通識。
const courses = [
  make('703007001', { subNam: '離散數學', subGde: '資訊二', subTime: '二234' }),
  make('703008001', { subNam: '資料結構', subGde: '資訊二', subTime: '四234' }),
  make('703813001', { subNam: '人工智慧導論', subGde: '資訊二', subKind: '選修', subTime: '一D56' }),
  make('041001001', { subNam: '哲學與人生', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一234' }),
  make('042001001', { subNam: '社會學導論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '二D56' }),
  make('042002001', { subNam: '心理學概論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '三D56' }),
  make('043001001', { subNam: '生活中的物理', subGde: '通識', subKind: '', lmtKind: '自然通識', subTime: '五D56' }),
];
const catalog = new Map(courses.map((course) => [course.key, course]));
const context: FillContext = {
  entries: [],
  catalog: courses,
  profile: { level: 'undergrad', year: 2, className: '資訊二' },
  preferences: { freeDays: [], noEarly: false },
  rules: parseEnrollmentRules(enrollmentRules),
  maximumCredits: 25,
};

function setup() {
  const onApply = vi.fn();
  render(<FillPlanner context={context} className={parseClassName('資訊二')} candidateKeys={[]} credits={0} limits={{ minimum: 12, maximum: 25 }} catalog={catalog} onApply={onApply} />);
  return { onApply };
}

describe('targetOptions', () => {
  test('offers targets inside the credit limits and above the current credits', () => {
    expect(targetOptions(0, { minimum: 12, maximum: 25 })).toEqual([12, 15, 18, 20, 22, 25]);
    expect(targetOptions(19, { minimum: 12, maximum: 25 })).toEqual([20, 22, 25]);
    expect(targetOptions(25, { minimum: 12, maximum: 25 })).toEqual([]);
  });
});

describe('FillPlanner', () => {
  test('one click opens it, one choice shows plans side by side, one click picks a plan', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByRole('button', { name: '幫我排滿' }));
    await user.click(screen.getByRole('radio', { name: '18' }));
    const plans = [...screen.getByRole('list', { name: '排好的方案' }).children] as HTMLElement[];
    expect(plans.length).toBeGreaterThanOrEqual(2);
    const first = plans[0]!;
    expect(within(first).getByText(/方案 A/)).toBeInTheDocument();
    expect(within(first).getAllByText('本班必修')).toHaveLength(2);
    expect(first).toHaveTextContent('共 18 學分');
    await user.click(within(first).getByRole('button', { name: '用這份：方案 A・照優先順序' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [chosen, others, target] = onApply.mock.calls[0]!;
    expect(chosen.id).toBe('order');
    expect(others.length).toBe(plans.length - 1);
    expect(target).toBe(18);
    // 選完就收起來。
    expect(screen.getByRole('button', { name: '幫我排滿' })).toBeInTheDocument();
  });

  test('「換一門」 swaps one course in that plan only', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: '幫我排滿' }));
    await user.click(screen.getByRole('radio', { name: '18' }));
    const list = screen.getByRole('list', { name: '方案 A・照優先順序的課' });
    const before = list.textContent;
    const swapButtons = within(list).getAllByRole('button', { name: /^換一門：/ });
    // 本班必修沒有「換一門」。
    expect(within(list).getAllByRole('listitem')).toHaveLength(swapButtons.length + 2);
    await user.click(swapButtons.at(-1)!);
    expect(screen.getByRole('list', { name: '方案 A・照優先順序的課' }).textContent).not.toBe(before);
  });

  test('says why a class required course was left out: over the credit limit, or the same title already on the timetable', async () => {
    const user = userEvent.setup();
    // 課表上已有別系的「離散數學」（不衝堂）和 20 學分的專題，共 23 學分：資料結構排進去會超過 25。
    const other = make('701007001', { subNam: '離散數學', subGde: '應數二', subTime: '五234' });
    const projects = [
      make('901001001', { subNam: '專題研究（一）', subGde: '資訊三', subKind: '選修', subPoint: '9.0', subTime: '一EF' }),
      make('901002001', { subNam: '專題研究（二）', subGde: '資訊三', subKind: '選修', subPoint: '9.0', subTime: '五EF' }),
      make('901003001', { subNam: '專題研究（三）', subGde: '資訊三', subKind: '選修', subPoint: '2.0', subTime: '一12' }),
    ];
    const fixed = [other, ...projects];
    const filled: FillContext = { ...context, catalog: [...courses, ...fixed], entries: fixed.map((course) => ({ course, item: { key: course.key, locked: false, status: 'planned' as const, attendance: 'sync' as const } })) };
    render(<FillPlanner context={filled} className={parseClassName('資訊二')} candidateKeys={[]} credits={23} limits={{ minimum: 12, maximum: 25 }} catalog={new Map([...catalog, ...fixed.map((course) => [course.key, course] as const)])} onApply={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '幫我排滿' }));
    await user.click(screen.getByRole('radio', { name: '25' }));
    expect(screen.getByText(/有 1 門本班必修排進去會超過學分上限（25 學分），沒有排進去/)).toBeInTheDocument();
    expect(screen.getByText(/課表上已有「離散數學」，和本班必修同名或同科目，沒有重複排/)).toBeInTheDocument();
    expect(screen.queryByText(/每一班都衝堂/)).not.toBeInTheDocument();
  });
});
