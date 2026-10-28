// 主方案與備案：一批變更（Change[]）是一個復原單位；大改動前自動另存備案。

import { DEFAULT_INTERNSHIP_SETTINGS, type InternshipSettings } from './internship.ts';
import { addCourse, removeCourse, setAttendance, setStatus, totalCredits, type Attendance, type PlanItem, type PlanItemStatus, type ScheduleCourse } from './schedule/selection.ts';

/** 偏好類條件：學生與 AI 都可以調整（身分與資格條件不在這裡，只能由學生本人勾選）。 */
export interface Preferences {
  /** 希望空下來的星期（1–7）。 */
  freeDays: number[];
  internship: InternshipSettings;
}

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({ freeDays: [], internship: DEFAULT_INTERNSHIP_SETTINGS }) as Preferences;

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
  preferences: Preferences;
}

export type Change =
  | { type: 'addCandidate'; key: string }
  | { type: 'removeCandidate'; key: string }
  | { type: 'addToSchedule'; key: string }
  | { type: 'removeFromSchedule'; key: string }
  | { type: 'setAttendance'; key: string; attendance: Attendance }
  | { type: 'createPlan'; name: string }
  | { type: 'switchPlan'; planId: string }
  | { type: 'setPreference'; freeDays?: number[]; internship?: InternshipSettings }
  // 以下只供畫面使用，AI 動作清單（ai/changeSet）不會產生。
  | { type: 'setLock'; key: string; locked: boolean }
  | { type: 'setStatus'; key: string; status: PlanItemStatus };

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
  return {
    candidates: [],
    plans: [{ id: 'plan-1', name: '主方案', auto: false, items: [] }],
    activePlanId: 'plan-1',
    preferences: { freeDays: [], internship: { ...DEFAULT_INTERNSHIP_SETTINGS, fixedDays: {} } },
  };
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
    // 移除不需查目錄：課程從快照消失後，學生仍要能把它移出。
    const needsCourse = change.type === 'addCandidate' || change.type === 'addToSchedule' || change.type === 'setAttendance';
    if (needsCourse && !catalog.has(change.key)) errors.push(`找不到課程 ${change.key}`);
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
    case 'setLock':
      return mutateActive(state, (items) => items.map((item) => (item.key === change.key ? { ...item, locked: change.locked } : item)));
    case 'setStatus':
      return mutateActive(state, (items) => setStatus(items, change.key, change.status));
    case 'setPreference':
      return {
        ...state,
        preferences: {
          freeDays: change.freeDays ? [...new Set(change.freeDays)].sort() : state.preferences.freeDays,
          internship: change.internship ?? state.preferences.internship,
        },
      };
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
  // 比較的是「最後所在方案」改動前後；新建的方案以複製來源（原本的方案）為基準。
  const existing = state.plans.find(({ id }) => id === applied.activePlanId);
  const before = existing?.items ?? activeItems(state);
  const diff = diffItems(before, activeItems(applied));
  // 只有改到原本就存在的方案才需要備份；新建的方案本身就是備案。
  const isBig = Boolean(existing) && (diff.removed.length > 0 || diff.added.length + diff.removed.length >= BIG_CHANGE_COURSES);
  if (!(options.autoBackup ?? true) || !isBig) {
    return { status: 'applied', state: applied, undo: state, diff };
  }

  const limit = options.autoBackupLimit ?? DEFAULT_AUTO_BACKUP_LIMIT;
  const autoPlans = applied.plans.filter(({ auto }) => auto);
  let plans = applied.plans;
  if (autoPlans.length >= limit) {
    if (!options.replaceOldestAutoBackup) return { status: 'needsConfirmation', reason: 'autoBackupFull', limit };
    // 最舊的一份若正是學生正在看的方案，就跳過它，改刪下一份。
    const oldest = autoPlans.find(({ id }) => id !== applied.activePlanId)?.id;
    plans = plans.filter(({ id }) => id !== oldest);
  }
  const backupId = nextPlanId(applied.plans);
  const lastNumber = applied.plans.reduce((highest, { auto, name }) => (
    auto ? Math.max(highest, Number(/^自動備案 (\d+)/.exec(name)?.[1] ?? 0)) : highest
  ), 0);
  const backup: Plan = {
    id: backupId,
    name: `自動備案 ${lastNumber + 1}（改動前）`,
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
