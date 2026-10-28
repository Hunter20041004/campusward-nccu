import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Plan, ScheduleCourse } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
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
  await user.selectOptions(screen.getByRole('combobox', { name: '與這個方案比較' }), 'plan-2');
  const result = screen.getByRole('region', { name: '方案比較' });
  expect(result).toHaveTextContent('只在主方案：課b');
  expect(result).toHaveTextContent('只在備案 1：課c');
  expect(result).toHaveTextContent('學分 5 → 6（+1）');
});
