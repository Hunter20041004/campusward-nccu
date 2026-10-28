// 主方案與備案：一批變更（Change[]）是一個復原單位；大改動前自動另存備案。

import { addCourse, removeCourse, setAttendance, totalCredits, type Attendance, type PlanItem, type ScheduleCourse } from './schedule/selection.ts';

export interface Plan {
  id: string;
  name: string;
  /** 大改動前自動另存的備案。 */
  auto: boolean;
  items: PlanItem[];
}

export interface PlannerState {
  /** 候選清單（課程 key）。 */
  candidates: string[];
  plans: Plan[];
  activePlanId: string;
}

export type Change =
  | { type: 'addCandidate'; key: string }
  | { type: 'removeCandidate'; key: string }
  | { type: 'addToSchedule'; key: string }
  | { type: 'removeFromSchedule'; key: string }
  | { type: 'setAttendance'; key: string; attendance: Attendance }
  | { type: 'createPlan'; name: string }
  | { type: 'switchPlan'; planId: string };

export interface ChangeDiff {
  added: string[];
  removed: string[];
}

export type ApplyResult =
  | { status: 'applied'; state: PlannerState; undo: PlannerState; diff: ChangeDiff; autoBackupPlanId?: string }
  | { status: 'needsConfirmation'; reason: 'autoBackupFull'; limit: number }
  | { status: 'rejected'; errors: string[] };

export interface ApplyOptions {
  /** 預設 true：大改動前自動另存備案。 */
  autoBackup?: boolean;
  autoBackupLimit?: number;
  /** 使用者已確認：自動備案滿了時移除最舊的一份。 */
  replaceOldestAutoBackup?: boolean;
}

export const DEFAULT_AUTO_BACKUP_LIMIT = 5;
/** 一次變動達這個數量的課，視為大改動。 */
const BIG_CHANGE_COURSES = 3;

export function createPlannerState(): PlannerState {
  return { candidates: [], plans: [{ id: 'plan-1', name: '主方案', auto: false, items: [] }], activePlanId: 'plan-1' };
}

function nextPlanId(plans: readonly Plan[]): string {
  const max = plans.reduce((highest, { id }) => Math.max(highest, Number(id.replace('plan-', '')) || 0), 0);
  return `plan-${max + 1}`;
}

const activeItems = (state: PlannerState) => state.plans.find(({ id }) => id === state.activePlanId)?.items ?? [];

function mutateActive(state: PlannerState, update: (items: PlanItem[]) => PlanItem[]): PlannerState {
  return { ...state, plans: state.plans.map((plan) => (plan.id === state.activePlanId ? { ...plan, items: update(plan.items) } : plan)) };
}

function validate(state: PlannerState, changes: readonly Change[], catalog: ReadonlyMap<string, ScheduleCourse>): string[] {
  const errors: string[] = [];
  const planIds = new Set(state.plans.map(({ id }) => id));
  changes.forEach((change) => {
    if ('key' in change && !catalog.has(change.key)) errors.push(`找不到課程 ${change.key}`);
    if (change.type === 'createPlan') planIds.add(nextPlanId([...planIds].map((id) => ({ id }) as Plan)));
    if (change.type === 'switchPlan' && !planIds.has(change.planId)) errors.push(`找不到方案 ${change.planId}`);
  });
  return errors;
}

function applyOne(state: PlannerState, change: Change, catalog: ReadonlyMap<string, ScheduleCourse>): PlannerState {
  switch (change.type) {
    case 'addCandidate':
      return state.candidates.includes(change.key) ? state : { ...state, candidates: [...state.candidates, change.key] };
    case 'removeCandidate':
      return {
        ...state,
        candidates: state.candidates.filter((key) => key !== change.key),
        plans: state.plans.map((plan) => ({ ...plan, items: plan.items.filter(({ key }) => key !== change.key) })),
      };
    case 'addToSchedule': {
      const withCandidate = applyOne(state, { type: 'addCandidate', key: change.key }, catalog);
      return mutateActive(withCandidate, (items) => addCourse(items, catalog.get(change.key)!));
    }
    case 'removeFromSchedule':
      return mutateActive(state, (items) => removeCourse(items, change.key));
    case 'setAttendance':
      return mutateActive(state, (items) => setAttendance(items, catalog.get(change.key)!, change.attendance));
    case 'createPlan': {
      const id = nextPlanId(state.plans);
      const items = activeItems(state).map((item) => ({ ...item }));
      return { ...state, plans: [...state.plans, { id, name: change.name, auto: false, items }], activePlanId: id };
    }
    case 'switchPlan':
      return { ...state, activePlanId: change.planId };
  }
}

function diffItems(before: readonly PlanItem[], after: readonly PlanItem[]): ChangeDiff {
  const beforeKeys = new Set(before.map(({ key }) => key));
  const afterKeys = new Set(after.map(({ key }) => key));
  return {
    added: after.filter(({ key }) => !beforeKeys.has(key)).map(({ key }) => key),
    removed: before.filter(({ key }) => !afterKeys.has(key)).map(({ key }) => key),
  };
}

export function applyChanges(
  state: PlannerState,
  changes: readonly Change[],
  catalog: ReadonlyMap<string, ScheduleCourse>,
  options: ApplyOptions = {},
): ApplyResult {
  const errors = validate(state, changes, catalog);
  if (errors.length) return { status: 'rejected', errors };

  const applied = changes.reduce((current, change) => applyOne(current, change, catalog), state);
  const before = activeItems(state);
  const diff = diffItems(before, applied.activePlanId === state.activePlanId ? activeItems(applied) : before);
  const isBig = diff.removed.length > 0 || diff.added.length + diff.removed.length >= BIG_CHANGE_COURSES;
  if (!(options.autoBackup ?? true) || !isBig) {
    return { status: 'applied', state: applied, undo: state, diff };
  }

  const limit = options.autoBackupLimit ?? DEFAULT_AUTO_BACKUP_LIMIT;
  const autoPlans = state.plans.filter(({ auto }) => auto);
  let plans = applied.plans;
  if (autoPlans.length >= limit) {
    if (!options.replaceOldestAutoBackup) return { status: 'needsConfirmation', reason: 'autoBackupFull', limit };
    const oldest = autoPlans[0]?.id;
    plans = plans.filter(({ id }) => id !== oldest);
  }
  const backupId = nextPlanId(applied.plans);
  const backup: Plan = {
    id: backupId,
    name: `自動備案 ${autoPlans.length + 1}（改動前）`,
    auto: true,
    items: before.map((item) => ({ ...item })),
  };
  return { status: 'applied', state: { ...applied, plans: [...plans, backup] }, undo: state, diff, autoBackupPlanId: backupId };
}

export function comparePlans(first: Plan, second: Plan, catalog: ReadonlyMap<string, ScheduleCourse>) {
  const entries = (plan: Plan) => plan.items.flatMap((item) => {
    const course = catalog.get(item.key);
    return course ? [{ course, item }] : [];
  });
  const firstKeys = new Set(first.items.map(({ key }) => key));
  const secondKeys = new Set(second.items.map(({ key }) => key));
  const firstCredits = totalCredits(entries(first));
  const secondCredits = totalCredits(entries(second));
  return {
    onlyInFirst: [...firstKeys].filter((key) => !secondKeys.has(key)),
    onlyInSecond: [...secondKeys].filter((key) => !firstKeys.has(key)),
    firstCredits,
    secondCredits,
    creditDifference: secondCredits - firstCredits,
  };
}
