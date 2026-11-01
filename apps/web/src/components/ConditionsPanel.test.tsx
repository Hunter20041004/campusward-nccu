import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_INTERNSHIP_SETTINGS, type ScheduleCourse, type ScheduleEntry } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { ConditionsPanel, type ConditionsPanelProps } from './ConditionsPanel.tsx';

const restricted: ScheduleCourse = {
  key: '1151:900001001', title: '德國文學概論', credits: 2, itemType: 'course', meetings: [{ day: 2, start: 550, end: 720, label: '' }], events: [],
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
  eligibility: { title: '德國文學概論', eligibilityRules: [{ conditionId: 'official-restriction:900001001', conditionLabel: '我是歐文系或雙主修學生', enforcement: 'required', rationale: '僅限歐文系及雙主修學生修讀' }] },
};
const entry: ScheduleEntry = { course: restricted, item: { key: restricted.key, attendance: 'sync', status: 'planned', locked: false } };

function setup(overrides: Partial<ConditionsPanelProps> = {}) {
  const props: ConditionsPanelProps = {
    profile: {},
    courses: [restricted],
    entries: [entry],
    preferences: { freeDays: [], internship: { ...DEFAULT_INTERNSHIP_SETTINGS, fixedDays: {} } },
    onProfile: vi.fn(),
    onPreferences: vi.fn(),
    ...overrides,
  };
  render(<ConditionsPanel {...props} />);
  return props;
}

describe('identity', () => {
  // 易用性審查（2026-11-01）：學制與年級改在課表上方的系級列一次點選，這裡只留加修學系這類少用的設定。
  test('lets the student set the additional major, points to the class bar for class and year, and says AI cannot', async () => {
    const user = userEvent.setup();
    const props = setup({ profile: { level: 'undergrad' } });
    expect(screen.getByText(/AI 不會改這些設定/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '年級' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '學制' })).toBeNull();
    expect(screen.getByText(/系級與年級在課表上方/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '加修學系' }), 'double');
    expect(props.onProfile).toHaveBeenLastCalledWith({ level: 'undergrad', additionalMajor: 'double' });
  });
});

describe('eligibility conditions', () => {
  test('lists conditions from candidate courses with their effect', () => {
    setup();
    const condition = screen.getByRole('radiogroup', { name: '我是歐文系或雙主修學生' });
    expect(condition).toHaveTextContent('影響 1 門候選課');
    expect(within(condition).getByRole('radio', { name: '還不確定' })).toBeChecked();
  });

  test('records that the student meets or does not meet a condition', async () => {
    const user = userEvent.setup();
    const props = setup({ profile: { conditionIds: ['other'] } });
    await user.click(screen.getByRole('radio', { name: '我符合' }));
    expect(props.onProfile).toHaveBeenLastCalledWith({ conditionIds: ['other', 'official-restriction:900001001'], rejectedConditionIds: [] });
    await user.click(screen.getByRole('radio', { name: '我不符合' }));
    expect(props.onProfile).toHaveBeenLastCalledWith({ conditionIds: ['other'], rejectedConditionIds: ['official-restriction:900001001'] });
  });

  test('says when no course needs a condition', () => {
    setup({ courses: [] });
    expect(screen.getByText('目前候選課沒有需要確認的資格。')).toBeInTheDocument();
  });
});

describe('preferences', () => {
  test('toggles free days', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: '週五空下來' }));
    expect(props.onPreferences).toHaveBeenLastCalledWith({ freeDays: [5] });
  });

  test('toggles the no-early preference that every search uses', async () => {
    const user = userEvent.setup();
    const props = setup();
    const noEarly = screen.getByRole('button', { name: /不要早八/ });
    expect(noEarly).toHaveAttribute('aria-pressed', 'false');
    await user.click(noEarly);
    expect(props.onPreferences).toHaveBeenLastCalledWith({ noEarly: true });
    expect(screen.getByText(/搜課、點空堂找課與本班必修挑班都會套用/)).toBeInTheDocument();
  });

  test('shows how many internship days the timetable leaves', () => {
    setup();
    expect(screen.getByRole('status', { name: '實習空檔' })).toHaveTextContent('可實習 4.5 天');
  });

  test('updates the internship target and rejects an invalid one', async () => {
    const user = userEvent.setup();
    const props = setup();
    const target = screen.getByRole('spinbutton', { name: '每週實習天數' });
    await user.clear(target);
    await user.type(target, '3');
    expect(props.onPreferences).toHaveBeenLastCalledWith({ internship: expect.objectContaining({ targetDays: 3 }) });
    await user.clear(target);
    await user.type(target, '6');
    expect(screen.getByText('每週實習目標必須是 0 到 5 天，並以半天為單位。')).toBeInTheDocument();
  });
});
