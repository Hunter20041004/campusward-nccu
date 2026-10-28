import { expect, test } from 'vitest';
import { DEFAULT_INTERNSHIP_SETTINGS, calculateInternshipPlan, validateInternshipSettings } from '../src/internship.ts';
import type { ScheduleEntry } from '../src/schedule/selection.ts';

// 移植自舊專案 tests/internship-planner.test.mjs（courseId 改為 courseKey；單一 schedule 改為 meetings）。
// 舊 planner-core 的 calculateInternshipAvailability 舊畫面未使用，不移植；其情境（集中方案 3 天）由第一個測試涵蓋。

const entry = (key: string, title: string, meeting?: { day: number; start: number; end: number }, attendance: 'sync' | 'async' = 'sync'): ScheduleEntry => ({
  course: {
    key, title, credits: 3, itemType: 'course', events: [], eligibility: {},
    meetings: meeting ? [{ ...meeting, label: '' }] : [],
    delivery: { mode: 'in-person', asyncAllowed: attendance === 'async', defaultAttendance: attendance },
  },
  item: { key, attendance, status: 'planned', locked: false },
});

const concentrated = [
  entry('ml', '機器學習概論', { day: 1, start: 790, end: 960 }),
  entry('social', '社群媒體探勘', { day: 1, start: 970, end: 1140 }),
  entry('hci', '人機互動', { day: 4, start: 550, end: 720 }),
  entry('agentic', 'Agentic AI', { day: 4, start: 790, end: 960 }),
  entry('creative', '創創入門', { day: 4, start: 1090, end: 1260 }),
  entry('salon', '數位創新沙龍', { day: 5, start: 790, end: 960 }),
];

test('finds three equivalent internship days in the concentrated plan', () => {
  const result = calculateInternshipPlan(concentrated, DEFAULT_INTERNSHIP_SETTINGS);

  expect(result.availableDays).toBe(3);
  expect(result.meetsTarget).toBe(true);
  expect(result.suggestedWindows.map(({ day, mode }) => ({ day, mode }))).toEqual([
    { day: 2, mode: 'full' },
    { day: 3, mode: 'full' },
    { day: 1, mode: 'morning' },
  ]);
});

test('counts only conflict-free fixed internship windows', () => {
  const result = calculateInternshipPlan([entry('course', '週二課程', { day: 2, start: 790, end: 960 })], {
    targetDays: 1.5,
    start: '09:00',
    end: '18:00',
    mode: 'fixed',
    fixedDays: { 2: 'full', 3: 'morning' },
  });

  expect(result.availableDays).toBe(0.5);
  expect(result.conflicts[0]?.courseKey).toBe('course');
  expect(result.meetsTarget).toBe(false);
  expect(result.displayWindows.length).toBe(2);
});

test('rejects an internship window shorter than two hours', () => {
  expect(validateInternshipSettings({ start: '09:00', end: '10:30' })).toEqual({
    field: 'end',
    message: '實習結束時間必須晚於開始時間，且每日時段至少兩小時。',
  });
});

test('accepts only half-day internship targets between zero and five', () => {
  const base = { start: '09:00', end: '18:00' };
  for (const targetDays of [6, -1, 0.3, Number.NaN, '']) {
    expect(validateInternshipSettings({ ...base, targetDays })).toEqual({
      field: 'target',
      message: '每週實習目標必須是 0 到 5 天，並以半天為單位。',
    });
  }
  for (const targetDays of [0, 2.5, 5]) {
    expect(validateInternshipSettings({ ...base, targetDays })).toBe(null);
  }
});

test('separates confirmed internship days from availability pending an unresolved physical course', () => {
  const result = calculateInternshipPlan([...concentrated, entry('flexible', '另約討論')], DEFAULT_INTERNSHIP_SETTINGS);

  expect(result.tentative).toBe(true);
  expect(result.confirmedDays).toBe(0);
  expect(result.pendingDays).toBe(result.availableDays);
  expect(result.meetsTarget).toBe(false);
});

// 新增：非同步修課不佔實習時段
test('ignores the weekly meetings of a course taken asynchronously', () => {
  const result = calculateInternshipPlan([entry('remote', '遠距課', { day: 2, start: 550, end: 720 }, 'async')], { ...DEFAULT_INTERNSHIP_SETTINGS, targetDays: 5 });
  expect(result.availableDays).toBe(5);
  expect(result.tentative).toBe(false);
});
