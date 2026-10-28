import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { applyChanges, comparePlans, createPlannerState, type Change, type PlannerState } from '../src/plans.ts';
import { createUndo } from '../src/history.ts';
import type { ScheduleCourse } from '../src/schedule/selection.ts';

// 移植自舊專案 tests/planner-undo.test.mjs（快照復原、15 秒後失效、剔除私人欄位）
test('restores one recent safe planner snapshot and expires it after fifteen seconds', () => {
  let now = 1_000;
  const undo = createUndo<Record<string, unknown>>({ now: () => now, ttlMs: 15_000 });
  const state = {
    selectedIds: ['course-a'],
    lockedCourseIds: ['course-a'],
    apiKey: 'must-not-survive',
    profileText: 'private AI prompt',
  };

  undo.capture(state, '已清空目前課表');
  expect(undo.peek()).toEqual({ available: true, label: '已清空目前課表', remainingMs: 15_000 });
  expect(undo.restore()).toEqual({ selectedIds: ['course-a'], lockedCourseIds: ['course-a'] });
  expect(undo.restore()).toBe(null);

  undo.capture(state, '已刪除課程');
  now += 15_001;
  expect(undo.peek()).toEqual({ available: false });
  expect(undo.restore()).toBe(null);
});

// 新增（計畫 1.10）：主方案＋備案、以變更為復原單位、大改動自動備案
const course = (key: string, credits = 3, day = 1): ScheduleCourse => ({
  key, title: key, credits, itemType: 'course', events: [], eligibility: {},
  meetings: [{ day, start: 490, end: 600, label: '' }],
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
});
const catalog = new Map(['a', 'b', 'c', 'd', 'e'].map((key, index) => [key, course(key, 3, index + 1)]));
const active = (state: PlannerState) => state.plans.find(({ id }) => id === state.activePlanId)!;
const keys = (state: PlannerState) => active(state).items.map(({ key }) => key);

function withSchedule(...scheduled: string[]): PlannerState {
  const result = applyChanges(createPlannerState(), scheduled.map((key) => ({ type: 'addToSchedule', key })), catalog, { autoBackup: false });
  if (result.status !== 'applied') throw new Error(result.status);
  return result.state;
}

describe('applyChanges', () => {
  test('starts with one empty main plan', () => {
    const state = createPlannerState();
    expect(state.plans).toEqual([{ id: 'plan-1', name: '主方案', auto: false, items: [] }]);
    expect(state.activePlanId).toBe('plan-1');
    expect(state.candidates).toEqual([]);
  });

  test('applies a batch of changes as one unit and reports what changed', () => {
    const result = applyChanges(createPlannerState(), [
      { type: 'addCandidate', key: 'a' },
      { type: 'addToSchedule', key: 'a' },
      { type: 'addToSchedule', key: 'b' },
    ], catalog);
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(keys(result.state)).toEqual(['a', 'b']);
    expect(result.state.candidates).toEqual(['a', 'b']);
    expect(result.diff).toEqual({ added: ['a', 'b'], removed: [] });
  });

  test('undo returns the exact previous state', () => {
    const before = withSchedule('a');
    const result = applyChanges(before, [{ type: 'addToSchedule', key: 'b' }], catalog);
    expect(result.status === 'applied' && result.undo).toEqual(before);
  });

  test('rejects a change that names an unknown course', () => {
    expect(applyChanges(createPlannerState(), [{ type: 'addToSchedule', key: 'zzz' }], catalog))
      .toEqual({ status: 'rejected', errors: ['找不到課程 zzz'] });
  });

  test('does not remove a locked course', () => {
    const locked = withSchedule('a');
    active(locked).items[0]!.locked = true;
    const result = applyChanges(locked, [{ type: 'removeFromSchedule', key: 'a' }], catalog, { autoBackup: false });
    expect(result.status === 'applied' && keys(result.state)).toEqual(['a']);
  });

  test('removing a candidate also removes it from every plan', () => {
    const state = withSchedule('a', 'b');
    const result = applyChanges(state, [{ type: 'removeCandidate', key: 'a' }], catalog, { autoBackup: false });
    expect(result.status === 'applied' && result.state.candidates).toEqual(['b']);
    expect(result.status === 'applied' && keys(result.state)).toEqual(['b']);
  });

  test('creates a backup from the current plan and switches to it', () => {
    const state = withSchedule('a');
    const result = applyChanges(state, [{ type: 'createPlan', name: '備案 A' }], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(result.state.plans.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'plan-1', name: '主方案' },
      { id: 'plan-2', name: '備案 A' },
    ]);
    expect(result.state.activePlanId).toBe('plan-2');
    expect(keys(result.state)).toEqual(['a']);
  });

  test('switches back to an existing plan', () => {
    const created = applyChanges(withSchedule('a'), [{ type: 'createPlan', name: '備案' }, { type: 'addToSchedule', key: 'b' }], catalog);
    if (created.status !== 'applied') throw new Error(created.status);
    const switched = applyChanges(created.state, [{ type: 'switchPlan', planId: 'plan-1' }], catalog);
    expect(switched.status === 'applied' && keys(switched.state)).toEqual(['a']);
  });

  test('rejects switching to a plan that does not exist', () => {
    expect(applyChanges(createPlannerState(), [{ type: 'switchPlan', planId: 'plan-9' }], catalog))
      .toEqual({ status: 'rejected', errors: ['找不到方案 plan-9'] });
  });
});

describe('automatic backups before big changes', () => {
  test('saves the current plan before removing a course', () => {
    const result = applyChanges(withSchedule('a', 'b'), [{ type: 'removeFromSchedule', key: 'a' }], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    const backup = result.state.plans.find(({ auto }) => auto);
    expect(backup?.items.map(({ key }) => key)).toEqual(['a', 'b']);
    expect(result.autoBackupPlanId).toBe(backup?.id);
    expect(keys(result.state)).toEqual(['b']);
  });

  test('saves the current plan before changing three or more courses', () => {
    const result = applyChanges(withSchedule('a'), ['b', 'c', 'd'].map((key): Change => ({ type: 'addToSchedule', key })), catalog);
    expect(result.status === 'applied' && result.autoBackupPlanId).toBeTruthy();
  });

  test('does not back up a small addition', () => {
    const result = applyChanges(withSchedule('a'), [{ type: 'addToSchedule', key: 'b' }], catalog);
    expect(result.status === 'applied' && result.autoBackupPlanId).toBeUndefined();
  });

  test('asks before overwriting when automatic backups are full', () => {
    let state = withSchedule('a', 'b', 'c', 'd', 'e');
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const result = applyChanges(state, [{ type: 'removeFromSchedule', key }], catalog, { autoBackupLimit: 5 });
      if (result.status !== 'applied') throw new Error(result.status);
      state = result.state;
    }
    const full = applyChanges(state, [{ type: 'addToSchedule', key: 'a' }, { type: 'addToSchedule', key: 'b' }, { type: 'addToSchedule', key: 'c' }], catalog, { autoBackupLimit: 5 });
    expect(full).toEqual({ status: 'needsConfirmation', reason: 'autoBackupFull', limit: 5 });

    const confirmed = applyChanges(state, [{ type: 'addToSchedule', key: 'a' }, { type: 'addToSchedule', key: 'b' }, { type: 'addToSchedule', key: 'c' }], catalog, { autoBackupLimit: 5, replaceOldestAutoBackup: true });
    if (confirmed.status !== 'applied') throw new Error(confirmed.status);
    const autoPlans = confirmed.state.plans.filter(({ auto }) => auto);
    expect(autoPlans).toHaveLength(5);
    expect(autoPlans.map(({ id }) => id)).not.toContain(state.plans.find(({ auto }) => auto)?.id);
  });
});

describe('comparePlans', () => {
  test('lists courses only in each plan and the credit difference', () => {
    const state = withSchedule('a', 'b');
    const created = applyChanges(state, [{ type: 'createPlan', name: '備案' }, { type: 'removeFromSchedule', key: 'b' }, { type: 'addToSchedule', key: 'c' }], catalog, { autoBackup: false });
    if (created.status !== 'applied') throw new Error(created.status);
    const [main, backup] = created.state.plans;
    expect(comparePlans(main!, backup!, catalog)).toEqual({ onlyInFirst: ['b'], onlyInSecond: ['c'], firstCredits: 6, secondCredits: 6, creditDifference: 0 });
  });
});

describe('undo property', () => {
  const change = fc.oneof(
    fc.constantFrom('a', 'b', 'c', 'd', 'e').map((key): Change => ({ type: 'addToSchedule', key })),
    fc.constantFrom('a', 'b', 'c', 'd', 'e').map((key): Change => ({ type: 'removeFromSchedule', key })),
    fc.constantFrom('a', 'b', 'c').map((key): Change => ({ type: 'addCandidate', key })),
    fc.constantFrom('a', 'b').map((key): Change => ({ type: 'removeCandidate', key })),
    fc.constant<Change>({ type: 'createPlan', name: '備案' }),
  );

  test('applying any changes never mutates the input, and undo restores it exactly', () => {
    fc.assert(fc.property(fc.array(change, { maxLength: 6 }), fc.array(change, { minLength: 1, maxLength: 6 }), (setup, changes) => {
      const seeded = applyChanges(createPlannerState(), setup, catalog, { autoBackup: false });
      if (seeded.status !== 'applied') return;
      const snapshot = JSON.parse(JSON.stringify(seeded.state)) as PlannerState;
      const result = applyChanges(seeded.state, changes, catalog, { autoBackupLimit: 100 });
      expect(seeded.state).toEqual(snapshot);
      if (result.status === 'applied') expect(result.undo).toEqual(snapshot);
    }));
  });
});
