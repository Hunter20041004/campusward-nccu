import { describe, expect, test } from 'vitest';
import {
  eligibleForAi,
  fillToMinimumCredits,
  maximumCreditSelection,
  pickLanguageCourse,
  requestedLanguageGroups,
  requestedMinimumCredits,
  requestsMaximumCredits,
} from '../src/ai/plan.ts';
import type { PlanItem, ScheduleCourse, ScheduleEntry } from '../src/schedule/selection.ts';

// 移植自舊專案 tests/ai-service.test.mjs（推薦方案的確定性部分）。舊版改寫模型的三個方案；
// 新版把這些計算做成引擎工具，由 AI 光球產生單一變更方案時使用。
function course(key: string, credits: number, meeting?: { day: number; start: number; end: number }, extra: Partial<ScheduleCourse> = {}): ScheduleCourse {
  return {
    key, title: key, credits, itemType: 'course', events: [], eligibility: {},
    meetings: meeting ? [{ ...meeting, label: '' }] : [],
    delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
    ...extra,
  };
}
const ASYNC = { delivery: { mode: 'asynchronous-optional', asyncAllowed: true, defaultAttendance: 'sync' } } as const;
const item = (key: string, extra: Partial<PlanItem> = {}): PlanItem => ({ key, attendance: 'sync', status: 'planned', locked: false, ...extra });
const entry = (value: ScheduleCourse, extra: Partial<PlanItem> = {}): ScheduleEntry => ({ course: value, item: item(value.key, extra) });

describe('reading the request', () => {
  test('treats maximum credits as an explicit objective', () => {
    expect(requestsMaximumCredits('集中週二週四，學分越多越好')).toBe(true);
    expect(requestsMaximumCredits('週五不要排課')).toBe(false);
  });

  test.each([
    ['至少要 17 學分，並保留兩天實習', 17],
    ['最少 15學分', 15],
    ['20 學分以上', 20],
    ['週五不要排課', 0],
  ])('reads the minimum credits in %s', (text, expected) => {
    expect(requestedMinimumCredits(text)).toBe(expected);
  });

  test('reads preferred languages, or every language for a generic request', () => {
    expect(requestedLanguageGroups('語文偏好日文跟法文相關的').map(({ label }) => label)).toEqual(['日文', '法文']);
    expect(requestedLanguageGroups('一堂語文相關').length).toBe(8);
    expect(requestedLanguageGroups('想學自然語言處理')).toEqual([]);
  });
});

describe('maximumCreditSelection', () => {
  test('builds a deterministic maximum-credit route when the model omits compatible courses', () => {
    const result = maximumCreditSelection([
      course('a', 3, { day: 1, start: 610, end: 780 }),
      course('b', 5, { day: 1, start: 700, end: 870 }),
      course('c', 4, { day: 2, start: 610, end: 780 }),
      course('d', 2, { day: 3, start: 610, end: 780 }),
    ], []);
    expect(result.courseKeys).toEqual(['b', 'c', 'd']);
  });

  test('keeps locked courses and drops candidates that conflict with them', () => {
    const result = maximumCreditSelection([
      course('locked', 1, { day: 1, start: 610, end: 780 }),
      course('big', 5, { day: 1, start: 700, end: 870 }),
      course('ok', 2, { day: 2, start: 610, end: 780 }),
    ], ['locked']);
    expect(result.courseKeys).toEqual(['locked', 'ok']);
  });

  test('takes async-capable courses asynchronously so they never conflict', () => {
    const result = maximumCreditSelection([
      course('a', 3, { day: 1, start: 610, end: 780 }),
      course('remote', 3, { day: 1, start: 610, end: 780 }, ASYNC),
    ], []);
    expect(result).toEqual({ courseKeys: ['a', 'remote'], asyncCourseKeys: ['remote'] });
  });
});

describe('fillToMinimumCredits', () => {
  test('fills to the requested minimum credits preferring asynchronous courses', () => {
    const current = ['a', 'b', 'c', 'd'].map((key, index) => entry(course(key, 4, { day: index + 1, start: 610, end: 780 })));
    const candidates = [
      course('e', 4, { day: 5, start: 610, end: 780 }),
      course('f', 4, { day: 6, start: 610, end: 780 }),
      course('async', 3, { day: 1, start: 610, end: 780 }, ASYNC),
    ];
    const result = fillToMinimumCredits(current, candidates, 17);
    expect(result).toEqual({ added: [{ key: 'async', attendance: 'async' }], credits: 19, reached: true });
  });

  test('reports when candidates cannot reach the minimum', () => {
    const current = [entry(course('a', 3, { day: 1, start: 610, end: 780 }))];
    const result = fillToMinimumCredits(current, [course('clash', 3, { day: 1, start: 610, end: 780 })], 9);
    expect(result).toEqual({ added: [], credits: 3, reached: false });
  });

  test('does nothing when the schedule already meets the minimum', () => {
    expect(fillToMinimumCredits([entry(course('a', 12))], [course('b', 3)], 9)).toEqual({ added: [], credits: 12, reached: true });
  });
});

describe('pickLanguageCourse', () => {
  const groups = requestedLanguageGroups('語文偏好日文跟法文相關的');

  test('adds an actual preferred language course', () => {
    const current = [entry(course('a', 3, { day: 1, start: 610, end: 780 }))];
    const candidates = [
      course('jp-law', 3, { day: 5, start: 610, end: 780 }, { title: '日文法學名著選讀（二）' }),
      course('nlp', 3, { day: 2, start: 610, end: 780 }, { title: '自然語言處理' }),
    ];
    expect(pickLanguageCourse(current, candidates, groups)).toEqual({ status: 'add', key: 'jp-law', title: '日文法學名著選讀（二）', removeKeys: [] });
  });

  test('reports the language course the schedule already has', () => {
    const current = [entry(course('jp-law', 3, undefined, { title: '日文法學名著選讀（二）' }))];
    expect(pickLanguageCourse(current, [], groups)).toEqual({ status: 'existing', key: 'jp-law', title: '日文法學名著選讀（二）' });
  });

  test('replaces an unlocked conflicting course but never a locked one', () => {
    const french = course('fr', 3, { day: 1, start: 610, end: 780 }, { title: '法文（一）' });
    expect(pickLanguageCourse([entry(course('a', 3, { day: 1, start: 610, end: 780 }))], [french], groups))
      .toEqual({ status: 'add', key: 'fr', title: '法文（一）', removeKeys: ['a'] });
    expect(pickLanguageCourse([entry(course('a', 3, { day: 1, start: 610, end: 780 }), { locked: true })], [french], groups))
      .toEqual({ status: 'none', label: '日文／法文' });
  });

  test('says so when no eligible language candidate exists', () => {
    expect(pickLanguageCourse([], [course('nlp', 3, undefined, { title: '自然語言處理' })], groups)).toEqual({ status: 'none', label: '日文／法文' });
  });
});

test('excludes blocked and unavailable courses from AI candidates', () => {
  const candidates = [
    course('eligible', 3),
    course('blocked', 3, undefined, { eligibility: { level: 'graduate' } }),
    course('closed', 3, undefined, { eligibility: { available: false } }),
    course('review', 3, undefined, { eligibility: { eligibilityRules: [{ conditionId: 'x', enforcement: 'review', rationale: '需確認' }] } }),
  ];
  expect(eligibleForAi(candidates, { level: 'undergrad', year: 3 }).map(({ key }) => key)).toEqual(['eligible', 'review']);
});
