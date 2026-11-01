import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { DEFAULT_AUTO_BACKUP_LIMIT, PLAN_LIMITS, applyChanges, comparePlans, createPlannerState, type Change, type PlannerState } from '../src/plans.ts';
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

// 程式碼審查修正（2026-10-28）
describe('review fixes', () => {
  test('undo keeps planner preferences', () => {
    const undo = createUndo<PlannerState>({ now: () => 0 });
    const state = createPlannerState();
    state.preferences.freeDays = [5];
    undo.capture(state, '改動');
    expect(undo.restore()?.preferences.freeDays).toEqual([5]);
  });

  test('never deletes the active plan when replacing the oldest automatic backup', () => {
    let state = withSchedule('a', 'b', 'c', 'd', 'e');
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const result = applyChanges(state, [{ type: 'removeFromSchedule', key }], catalog, { autoBackupLimit: 5 });
      if (result.status !== 'applied') throw new Error(result.status);
      state = result.state;
    }
    const oldest = state.plans.find(({ auto }) => auto)!;
    const switched = { ...state, activePlanId: oldest.id };
    const result = applyChanges(switched, [{ type: 'removeFromSchedule', key: 'a' }], catalog, { autoBackupLimit: 5, replaceOldestAutoBackup: true });
    if (result.status !== 'applied') throw new Error(result.status);
    expect(result.state.plans.some(({ id }) => id === result.state.activePlanId)).toBe(true);
    expect(keys(result.state)).not.toContain('a');
  });

  test('reports and backs up changes made after switching plans in the same batch', () => {
    const created = applyChanges(withSchedule('a', 'b'), [{ type: 'createPlan', name: '備案' }], catalog);
    if (created.status !== 'applied') throw new Error(created.status);
    const result = applyChanges(created.state, [{ type: 'switchPlan', planId: 'plan-1' }, { type: 'removeFromSchedule', key: 'a' }], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(result.diff).toEqual({ added: [], removed: ['a'] });
    expect(result.autoBackupPlanId).toBeTruthy();
  });

  test('reports courses added to a newly created plan', () => {
    const result = applyChanges(withSchedule('a'), [{ type: 'createPlan', name: '備案' }, { type: 'addToSchedule', key: 'b' }], catalog);
    expect(result.status === 'applied' && result.diff).toEqual({ added: ['b'], removed: [] });
    expect(result.status === 'applied' && result.autoBackupPlanId).toBeUndefined();
  });

  test('can remove a course that is no longer in the catalog', () => {
    const state = withSchedule('a');
    const result = applyChanges(state, [{ type: 'removeFromSchedule', key: 'a' }, { type: 'removeCandidate', key: 'a' }], new Map(), { autoBackup: false });
    expect(result.status === 'applied' && keys(result.state)).toEqual([]);
  });

  test('gives each automatic backup a distinct name after reaching the limit', () => {
    let state = withSchedule('a', 'b', 'c', 'd', 'e');
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const result = applyChanges(state, [{ type: 'removeFromSchedule', key }], catalog, { autoBackupLimit: 3, replaceOldestAutoBackup: true });
      if (result.status !== 'applied') throw new Error(result.status);
      state = result.state;
    }
    const names = state.plans.filter(({ auto }) => auto).map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['自動備案 3（改動前）', '自動備案 4（改動前）', '自動備案 5（改動前）']);
  });
});

// 畫面用：鎖定與已灌檔／已選上（不在 AI 動作清單中）
describe('lock and status changes', () => {
  test('locks and unlocks a course in the active plan', () => {
    const locked = applyChanges(withSchedule('a'), [{ type: 'setLock', key: 'a', locked: true }], catalog, { autoBackup: false });
    if (locked.status !== 'applied') throw new Error(locked.status);
    expect(active(locked.state).items[0]?.locked).toBe(true);
    const unlocked = applyChanges(locked.state, [{ type: 'setLock', key: 'a', locked: false }], catalog, { autoBackup: false });
    expect(unlocked.status === 'applied' && active(unlocked.state).items[0]?.locked).toBe(false);
  });

  test('marking a course registered also locks it', () => {
    const result = applyChanges(withSchedule('a'), [{ type: 'setStatus', key: 'a', status: 'registered' }], catalog, { autoBackup: false });
    expect(result.status === 'applied' && active(result.state).items[0]).toMatchObject({ status: 'registered', locked: true });
  });
});

// 獨立審查修正（2026-11-01，G1）：數量上限與儲存格式一致，超過就拒絕，不讓存進去的資料讀不回來。
describe('limits', () => {
  test('refuses a new backup once manual plans reach the limit, keeping room for automatic backups', () => {
    let state = createPlannerState();
    for (let index = 1; index < PLAN_LIMITS.manualPlans; index += 1) {
      const result = applyChanges(state, [{ type: 'createPlan', name: `備案 ${index}` }], catalog);
      if (result.status !== 'applied') throw new Error(`stopped at ${index}`);
      state = result.state;
    }
    expect(state.plans).toHaveLength(PLAN_LIMITS.manualPlans);
    expect(applyChanges(state, [{ type: 'createPlan', name: '再一個' }], catalog))
      .toEqual({ status: 'rejected', errors: [`自己另存的方案最多 ${PLAN_LIMITS.manualPlans} 個。`] });
    expect(PLAN_LIMITS.manualPlans + DEFAULT_AUTO_BACKUP_LIMIT).toBeLessThanOrEqual(PLAN_LIMITS.plans);
  });

  test('refuses adding beyond the per-plan course and candidate limits', () => {
    const many = new Map(Array.from({ length: PLAN_LIMITS.candidates + 1 }, (_, index) => {
      const key = `1151:9${String(index).padStart(5, '0')}001`;
      return [key, { ...course('x'), key }] as const;
    }));
    const keys = [...many.keys()];
    const full = applyChanges(createPlannerState(), keys.slice(0, PLAN_LIMITS.itemsPerPlan).map((key): Change => ({ type: 'addToSchedule', key })), many, { autoBackup: false });
    if (full.status !== 'applied') throw new Error(full.status);
    expect(applyChanges(full.state, [{ type: 'addToSchedule', key: keys.at(-1)! }], many))
      .toEqual({ status: 'rejected', errors: [`一個方案最多 ${PLAN_LIMITS.itemsPerPlan} 門課。`] });
    const candidates = { ...full.state, candidates: keys.slice(0, PLAN_LIMITS.candidates) };
    expect(applyChanges(candidates, [{ type: 'addCandidate', key: keys.at(-1)! }], many))
      .toEqual({ status: 'rejected', errors: [`候選清單最多 ${PLAN_LIMITS.candidates} 門課。`] });
  });
});

// 獨立審查修正（2026-11-01，E9）：找不到可以替換的自動備案時拒絕，不超過上限。
test('refuses instead of exceeding the automatic backup limit when the only backup is the active plan', () => {
  const first = applyChanges(withSchedule('a', 'b'), [{ type: 'removeFromSchedule', key: 'a' }], catalog, { autoBackupLimit: 1 });
  if (first.status !== 'applied') throw new Error(first.status);
  const onBackup = { ...first.state, activePlanId: first.autoBackupPlanId! };
  const result = applyChanges(onBackup, [{ type: 'removeFromSchedule', key: 'b' }], catalog, { autoBackupLimit: 1, replaceOldestAutoBackup: true });
  expect(result).toEqual({ status: 'rejected', errors: ['自動備案已滿，而且能替換的只剩目前所在或這次正在修改的方案；請先切到其他方案再修改。'] });
});

// 獨立審查修正（2026-11-01，Phase 4 前置 4.0a）：一批變更可能改到好幾個方案（切換方案、另存備案、移出候選），每個被改到的既有方案各自比較、各自備份。
describe('every changed plan is compared and backed up on its own', () => {
  const withPlans = (...plans: string[][]): PlannerState => ({
    ...createPlannerState(),
    candidates: [...new Set(plans.flat())],
    plans: plans.map((items, index) => ({
      id: `plan-${index + 1}`,
      name: index ? `備案 ${index}` : '主方案',
      auto: false,
      items: items.map((key) => ({ key, attendance: 'sync' as const, status: 'planned' as const, locked: false })),
    })),
  });
  const itemsOf = (state: PlannerState, id: string) => state.plans.find((plan) => plan.id === id)?.items.map(({ key }) => key);
  const autoItems = (state: PlannerState) => state.plans.filter(({ auto }) => auto).map(({ items }) => items.map(({ key }) => key));

  test('backs up a plan that lost courses even when the batch then switches away from it', () => {
    const result = applyChanges(withPlans(['a', 'b', 'c'], []), [
      { type: 'removeFromSchedule', key: 'a' },
      { type: 'removeFromSchedule', key: 'b' },
      { type: 'removeFromSchedule', key: 'c' },
      { type: 'switchPlan', planId: 'plan-2' },
    ], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(autoItems(result.state)).toEqual([['a', 'b', 'c']]);
    expect(result.changedPlans).toEqual([
      expect.objectContaining({ planId: 'plan-1', created: false, diff: { added: [], removed: ['a', 'b', 'c'] }, backupPlanId: result.autoBackupPlanIds[0] }),
    ]);
  });

  test('backs up the original plan when the batch creates a new plan and removes candidates', () => {
    const result = applyChanges(withPlans(['a', 'b', 'c']), [
      { type: 'createPlan', name: '新方案' },
      { type: 'removeCandidate', key: 'a' },
      { type: 'removeCandidate', key: 'b' },
    ], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(itemsOf(result.state, 'plan-1')).toEqual(['c']);
    expect(autoItems(result.state)).toEqual([['a', 'b', 'c']]);
  });

  test('backs up each plan that removing one candidate changes', () => {
    const result = applyChanges(withPlans(['a', 'b'], ['a', 'c']), [{ type: 'removeCandidate', key: 'a' }], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(autoItems(result.state)).toEqual([['a', 'b'], ['a', 'c']]);
    expect(result.autoBackupPlanIds).toHaveLength(2);
  });

  test('does not back up plans that each only gained one course', () => {
    const result = applyChanges(withPlans(['a'], ['b']), [
      { type: 'addToSchedule', key: 'c' },
      { type: 'switchPlan', planId: 'plan-2' },
      { type: 'addToSchedule', key: 'd' },
    ], catalog);
    expect(result.status === 'applied' && result.autoBackupPlanIds).toEqual([]);
  });

  test('compares a plan created in the batch with the plan it was copied from', () => {
    const result = applyChanges(withPlans(['a'], ['b', 'c']), [
      { type: 'switchPlan', planId: 'plan-2' },
      { type: 'createPlan', name: '新方案' },
      { type: 'addToSchedule', key: 'd' },
    ], catalog);
    if (result.status !== 'applied') throw new Error(result.status);
    expect(result.diff).toEqual({ added: ['d'], removed: [] });
  });

  test('asks first when one batch needs more automatic backups than there is room for', () => {
    const state = withPlans(['a', 'b'], ['a', 'c']);
    state.plans.push({ id: 'plan-3', name: '自動備案 1（改動前）', auto: true, items: [] });
    expect(applyChanges(state, [{ type: 'removeCandidate', key: 'a' }], catalog, { autoBackupLimit: 2 }))
      .toEqual({ status: 'needsConfirmation', reason: 'autoBackupFull', limit: 2 });
    const confirmed = applyChanges(state, [{ type: 'removeCandidate', key: 'a' }], catalog, { autoBackupLimit: 2, replaceOldestAutoBackup: true });
    if (confirmed.status !== 'applied') throw new Error(confirmed.status);
    expect(confirmed.state.plans.map(({ id }) => id)).not.toContain('plan-3');
    expect(autoItems(confirmed.state)).toEqual([['a', 'b'], ['a', 'c']]);
  });

  test('does not remove a candidate that is locked in some plan', () => {
    const state = withPlans(['a'], ['a']);
    state.plans[1]!.items[0]!.locked = true;
    const result = applyChanges(state, [{ type: 'removeCandidate', key: 'a' }], catalog, { autoBackup: false });
    if (result.status !== 'applied') throw new Error(result.status);
    expect(result.state.candidates).toEqual(['a']);
    expect(result.state.plans.map(({ items }) => items.map(({ key }) => key))).toEqual([['a'], ['a']]);
  });
});
