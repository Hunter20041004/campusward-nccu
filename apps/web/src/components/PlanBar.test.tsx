import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Plan, ScheduleCourse } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { PlanBar } from './PlanBar.tsx';

const course = (key: string, credits: number): ScheduleCourse => ({
  key, title: `課${key}`, credits, itemType: 'course', meetings: [], events: [], eligibility: {},
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
});
const catalog = new Map([course('a', 3), course('b', 2), course('c', 3)].map((value) => [value.key, value]));
const item = (key: string) => ({ key, attendance: 'sync' as const, status: 'planned' as const, locked: false });
const plans: Plan[] = [
  { id: 'plan-1', name: '主方案', auto: false, items: [item('a'), item('b')] },
  { id: 'plan-2', name: '備案 1', auto: false, items: [item('a'), item('c')] },
  { id: 'plan-3', name: '自動備案 1（改動前）', auto: true, items: [item('a')] },
];

function setup() {
  const handlers = { onSwitch: vi.fn(), onCreate: vi.fn() };
  render(<PlanBar plans={plans} activePlanId="plan-1" credits={5} catalog={catalog} {...handlers} />);
  return handlers;
}

test('shows every plan and marks the active one', () => {
  setup();
  const group = screen.getByRole('group', { name: '方案' });
  expect(within(group).getByRole('button', { name: '主方案' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(group).getByRole('button', { name: '備案 1' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(group).getByRole('button', { name: /自動備案 1/ })).toHaveTextContent('自動');
});

test('switches plans and creates a backup', async () => {
  const user = userEvent.setup();
  const handlers = setup();
  await user.click(screen.getByRole('button', { name: '備案 1' }));
  expect(handlers.onSwitch).toHaveBeenCalledWith('plan-2');
  await user.click(screen.getByRole('button', { name: '另存為新備案' }));
  expect(handlers.onCreate).toHaveBeenCalled();
});

test('shows total credits', () => {
  setup();
  expect(screen.getByText(/共/)).toHaveTextContent('共 5 學分');
});

test('compares the active plan with another plan', async () => {
  const user = userEvent.setup();
  setup();
  await user.selectOptions(screen.getByRole('combobox', { name: '與這個方案比較' }), 'plan-3');
  const result = screen.getByRole('region', { name: '方案比較' });
  expect(result).toHaveTextContent('和「自動備案 1（改動前）」相比');
  expect(result).toHaveTextContent('多了課b');
  expect(result).toHaveTextContent('學分 3 → 5（+2）');
  await user.selectOptions(screen.getByRole('combobox', { name: '與這個方案比較' }), '');
  expect(screen.queryByRole('region', { name: '方案比較' })).toBeNull();
});

// 2026-11-01 易用性審查第 11 名：有兩個方案時自動顯示和主方案的差異，不用先選。
describe('automatic comparison', () => {
  const bar = (activePlanId: string, list: Plan[] = plans) => <PlanBar plans={list} activePlanId={activePlanId} credits={5} catalog={catalog} onSwitch={vi.fn()} onCreate={vi.fn()} />;

  test('a backup is compared with the main plan without any click', () => {
    render(bar('plan-2'));
    const result = screen.getByRole('region', { name: '方案比較' });
    expect(result).toHaveTextContent('和「主方案」相比');
    expect(result).toHaveTextContent('多了課c');
    expect(result).toHaveTextContent('少了課b');
    expect(result).toHaveTextContent('學分 5 → 6（+1）');
    expect(screen.getByRole('combobox', { name: '與這個方案比較' })).toHaveValue('plan-1');
  });

  test('on the main plan it compares with the plan viewed last, or the newest own backup', () => {
    const { rerender } = render(bar('plan-1'));
    expect(screen.getByRole('region', { name: '方案比較' })).toHaveTextContent('和「備案 1」相比');
    expect(screen.getByRole('region', { name: '方案比較' })).toHaveTextContent('學分 6 → 5（-1）');
    rerender(bar('plan-3'));
    rerender(bar('plan-1'));
    expect(screen.getByRole('region', { name: '方案比較' })).toHaveTextContent('和「自動備案 1（改動前）」相比');
  });

  test('says so when the plans have the same courses, and shows nothing with one plan', () => {
    const same: Plan[] = [plans[0]!, { ...plans[1]!, items: plans[0]!.items }];
    const { rerender } = render(bar('plan-2', same));
    expect(screen.getByRole('region', { name: '方案比較' })).toHaveTextContent('課都一樣');
    rerender(bar('plan-1', [plans[0]!]));
    expect(screen.queryByRole('region', { name: '方案比較' })).toBeNull();
  });

  test('long differences are shortened', () => {
    const many = new Map([...catalog, ...['d', 'e', 'f', 'g'].map((key) => [key, course(key, 1)] as const)]);
    const list: Plan[] = [plans[0]!, { ...plans[1]!, items: ['c', 'd', 'e', 'f', 'g'].map(item) }];
    render(<PlanBar plans={list} activePlanId="plan-2" credits={7} catalog={many} onSwitch={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole('region', { name: '方案比較' })).toHaveTextContent('多了課c、課d、課e 等 5 門');
  });
});

// 稽核 #11（2026-11-01）：學分旁顯示上下限；沒設定年級時提示並可直接去設定。
test('shows the credit range next to the total when the year is set', () => {
  render(<PlanBar plans={plans} activePlanId="plan-1" credits={13} catalog={catalog} onSwitch={vi.fn()} onCreate={vi.fn()} limits={{ minimum: 12, maximum: 25 }} />);
  expect(screen.getByText(/共/)).toHaveTextContent('共 13 學分（12–25）');
  expect(screen.queryByRole('button', { name: /設定年級/ })).toBeNull();
});

test('marks a total outside the credit range', () => {
  render(<PlanBar plans={plans} activePlanId="plan-1" credits={5} catalog={catalog} onSwitch={vi.fn()} onCreate={vi.fn()} limits={{ minimum: 12, maximum: 25 }} />);
  expect(screen.getByTitle('低於學分下限 12 學分')).toHaveTextContent('（12–25）');
});

test('asks for the year to check the credit limits, with a button that opens the identity settings', async () => {
  const onSetIdentity = vi.fn();
  render(<PlanBar plans={plans} activePlanId="plan-1" credits={11} catalog={catalog} onSwitch={vi.fn()} onCreate={vi.fn()} onSetIdentity={onSetIdentity} />);
  expect(screen.getByText(/共/)).toHaveTextContent('共 11 學分');
  await userEvent.setup().click(screen.getByRole('button', { name: '設定年級後可檢查學分上下限' }));
  expect(onSetIdentity).toHaveBeenCalled();
});
