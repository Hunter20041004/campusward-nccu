import { describe, expect, test } from 'vitest';
import { AiContractError, applyAiChangeSet, MAX_CHANGE_ACTIONS, parseAiActions, type AiAction } from '../src/ai/changeSet.ts';
import { applyChanges, createPlannerState, type Change, type PlannerState } from '../src/plans.ts';
import type { ScheduleCourse } from '../src/schedule/selection.ts';

// 新增（計畫 1.11）＋移植自舊 ai-contracts（未知課號、課號錯字修正、逐課非同步）與 ai-planner（保留鎖定課）。
function course(code: string, title: string, meeting?: { day: number; start: number; end: number }, asyncAllowed = false): ScheduleCourse {
  return {
    key: `1151:${code}`, code, title, credits: 3, itemType: 'course', events: [], eligibility: {},
    meetings: meeting ? [{ ...meeting, label: '' }] : [],
    delivery: { mode: asyncAllowed ? 'asynchronous-optional' : 'in-person', asyncAllowed, defaultAttendance: 'sync' },
  };
}
const catalog = new Map([
  course('900001001', '統計學', { day: 1, start: 550, end: 720 }),
  course('900002001', '會計學', { day: 1, start: 610, end: 780 }),
  course('900003001', '金融科技導論', { day: 3, start: 550, end: 730 }, true),
  course('900004001', '人機互動', { day: 4, start: 550, end: 720 }),
  course('900005001', '週五課', { day: 5, start: 550, end: 720 }),
].map((value) => [value.key, value]));
const profile = { level: 'undergrad', year: 3 } as const;
const json = (actions: unknown[]) => JSON.stringify({ actions });

describe('parseAiActions', () => {
  test('parses fenced JSON and maps course codes to keys', () => {
    const parsed = parseAiActions(`\`\`\`json\n${json([{ type: 'addToSchedule', course: '900001001' }])}\n\`\`\``, catalog);
    expect(parsed.changes).toEqual([{ type: 'addToSchedule', key: '1151:900001001' }]);
  });

  test('rejects recommendation plans with hallucinated course ids', () => {
    expect(() => parseAiActions(json([{ type: 'addToSchedule', course: '123456789' }]), catalog)).toThrow(/未知課程/);
  });

  test('repairs a uniquely identifiable two-character course id typo', () => {
    expect(parseAiActions(json([{ type: 'addToSchedule', course: '900004011' }]), catalog).changes)
      .toEqual([{ type: 'addToSchedule', key: '1151:900004001' }]);
  });

  test('does not guess between several close course codes', () => {
    expect(() => parseAiActions(json([{ type: 'addToSchedule', course: '900009001' }]), catalog)).toThrow(/未知課程/);
  });

  test('preserves explicit per-course asynchronous attendance', () => {
    expect(parseAiActions(json([{ type: 'setAttendance', course: '900003001', attendance: 'async' }]), catalog).changes)
      .toEqual([{ type: 'setAttendance', key: '1151:900003001', attendance: 'async' }]);
  });

  test('separates questions and searches from changes', () => {
    const parsed = parseAiActions(json([
      { type: 'searchCourses', query: '統計' },
      { type: 'openCourse', course: '900001001' },
      { type: 'answer', text: '這門課每週一上課。' },
      { type: 'recommendCareer', direction: '資料分析' },
    ]), catalog);
    expect(parsed.changes).toEqual([]);
    expect(parsed.requests.map(({ type }) => type)).toEqual(['searchCourses', 'openCourse', 'answer', 'recommendCareer']);
  });

  test('accepts preference changes', () => {
    expect(parseAiActions(json([{ type: 'setPreference', freeDays: [5] }]), catalog).changes).toEqual([{ type: 'setPreference', freeDays: [5] }]);
  });

  test.each([
    ['an identity action', [{ type: 'setIdentity', year: 4 }]],
    ['an identity field hidden in a preference', [{ type: 'setPreference', freeDays: [5], year: 4 }]],
    ['eligibility conditions in a preference', [{ type: 'setPreference', conditionIds: ['official:x'] }]],
    ['an extra field', [{ type: 'addToSchedule', course: '900001001', locked: true }]],
    ['an unknown action', [{ type: 'deleteEverything' }]],
    ['a free day outside the week', [{ type: 'setPreference', freeDays: [8] }]],
  ])('rejects %s', (_, actions) => {
    expect(() => parseAiActions(json(actions), catalog)).toThrow(AiContractError);
  });

  test(`rejects more than ${MAX_CHANGE_ACTIONS} changes`, () => {
    const many = Array.from({ length: MAX_CHANGE_ACTIONS + 1 }, () => ({ type: 'addCandidate', course: '900001001' }));
    expect(() => parseAiActions(json(many), catalog)).toThrow(/最多/);
  });

  test('rejects text that is not a JSON object', () => {
    expect(() => parseAiActions('好的，我幫你加了統計學', catalog)).toThrow('AI 回覆格式不正確。');
    expect(() => parseAiActions('[]', catalog)).toThrow('AI 回覆格式不正確。');
  });

  test('cannot express identity changes in the action type', () => {
    // @ts-expect-error AI 動作沒有設定身分的類型
    const identity: AiAction = { type: 'setIdentity', year: 4 };
    // @ts-expect-error 偏好裡不能放資格條件
    const condition: AiAction = { type: 'setPreference', conditionIds: ['x'] };
    expect([identity, condition]).toHaveLength(2);
  });
});

describe('applyAiChangeSet', () => {
  const seeded = (changes: Change[]): PlannerState => {
    const result = applyChanges(createPlannerState(), changes, catalog, { autoBackup: false });
    if (result.status !== 'applied') throw new Error(result.status);
    return result.state;
  };
  const keysOf = (state: PlannerState) => state.plans.find(({ id }) => id === state.activePlanId)!.items.map(({ key }) => key);

  test('applies a valid change set and reports what was added', () => {
    const result = applyAiChangeSet(createPlannerState(), [{ type: 'addToSchedule', key: '1151:900001001' }, { type: 'addToSchedule', key: '1151:900004001' }], catalog, { profile });
    if (result.status !== 'applied') throw new Error(JSON.stringify(result));
    expect(keysOf(result.state)).toEqual(['1151:900001001', '1151:900004001']);
    expect(result.diff.added).toEqual(['1151:900001001', '1151:900004001']);
  });

  test('rejects a change set that creates a conflict and leaves the state unchanged', () => {
    const result = applyAiChangeSet(createPlannerState(), [{ type: 'addToSchedule', key: '1151:900001001' }, { type: 'addToSchedule', key: '1151:900002001' }], catalog, { profile });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.violations.map(({ code }) => code)).toEqual(['weekly-conflict']);
  });

  test('applies a recommendation while preserving every locked selected course', () => {
    const state = seeded([{ type: 'addToSchedule', key: '1151:900004001' }]);
    state.plans[0]!.items[0]!.locked = true;
    const result = applyAiChangeSet(state, [{ type: 'removeFromSchedule', key: '1151:900004001' }, { type: 'addToSchedule', key: '1151:900001001' }], catalog, { profile });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.violations.map(({ code }) => code)).toEqual(['locked-course-removed']);
  });

  test('applies the recommendation asynchronous choice to each named course', () => {
    const result = applyAiChangeSet(createPlannerState(), [
      { type: 'addToSchedule', key: '1151:900004001' },
      { type: 'addToSchedule', key: '1151:900003001' },
      { type: 'setAttendance', key: '1151:900003001', attendance: 'async' },
    ], catalog, { profile });
    if (result.status !== 'applied') throw new Error(JSON.stringify(result));
    expect(result.state.plans[0]!.items.map(({ key, attendance }) => ({ key, attendance }))).toEqual([
      { key: '1151:900004001', attendance: 'sync' },
      { key: '1151:900003001', attendance: 'async' },
    ]);
  });

  test('enforces the free-day preference set in the same change set', () => {
    const result = applyAiChangeSet(createPlannerState(), [{ type: 'setPreference', freeDays: [5] }, { type: 'addToSchedule', key: '1151:900005001' }], catalog, { profile });
    expect(result.status === 'rejected' && result.violations.map(({ code }) => code)).toEqual(['free-day-occupied']);
  });

  test('does not blame a change set for problems that already existed', () => {
    const state = seeded([{ type: 'addToSchedule', key: '1151:900001001' }, { type: 'addToSchedule', key: '1151:900002001' }]);
    const result = applyAiChangeSet(state, [{ type: 'addToSchedule', key: '1151:900004001' }], catalog, { profile });
    expect(result.status).toBe('applied');
  });

  test('rejects an invalid internship preference', () => {
    const result = applyAiChangeSet(createPlannerState(), [{ type: 'setPreference', internship: { targetDays: 2, start: '09:00', end: '09:30', mode: 'auto', fixedDays: {} } }], catalog, { profile });
    expect(result.status === 'rejected' && result.violations.map(({ code }) => code)).toEqual(['invalid-preference']);
  });

  test('passes through the automatic backup confirmation', () => {
    const result = applyAiChangeSet(seeded([{ type: 'addToSchedule', key: '1151:900004001' }]), [{ type: 'removeFromSchedule', key: '1151:900004001' }], catalog, { profile, autoBackupLimit: 0 });
    expect(result).toEqual({ status: 'needsConfirmation', reason: 'autoBackupFull', limit: 0 });
  });
});

// 程式碼審查修正（2026-10-28）
describe('review fixes', () => {
  const seededWith = (keys: string[]): PlannerState => {
    const result = applyChanges(createPlannerState(), keys.map((key): Change => ({ type: 'addToSchedule', key })), catalog, { autoBackup: false });
    if (result.status !== 'applied') throw new Error(result.status);
    return result.state;
  };

  test('does not blame a change set for a schedule-wide problem that already existed', () => {
    const state = seededWith(['1151:900001001']);
    const result = applyAiChangeSet(state, [{ type: 'addToSchedule', key: '1151:900004001' }], catalog, { profile, maximumCredits: 2 });
    expect(result.status).toBe('applied');
  });

  test('refuses to remove a candidate that is locked in any plan', () => {
    const state = seededWith(['1151:900004001']);
    state.plans[0]!.items[0]!.locked = true;
    const created = applyChanges(state, [{ type: 'createPlan', name: '備案' }, { type: 'removeFromSchedule', key: '1151:900004001' }], catalog, { autoBackup: false });
    if (created.status !== 'applied') throw new Error(created.status);
    created.state.plans[1]!.items = [];
    const result = applyAiChangeSet(created.state, [{ type: 'removeCandidate', key: '1151:900004001' }], catalog, { profile });
    expect(result.status === 'rejected' && result.violations.map(({ code }) => code)).toEqual(['locked-course-removed']);
  });
});
