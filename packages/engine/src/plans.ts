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

/** 這批變更改到（或新建）的一個方案。 */
export interface PlanChange {
  planId: string;
  /** 這批變更裡新建的方案；比較基準是它複製來源「這批變更前」的內容。 */
  created: boolean;
  /** 改動前的課（既有方案取原本內容，新建方案取複製來源原本的內容）。 */
  baseline: PlanItem[];
  diff: ChangeDiff;
  /** 改動前自動另存的備案。 */
  backupPlanId?: string;
}

export type ApplyResult =
  | {
    status: 'applied';
    state: PlannerState;
    undo: PlannerState;
    /** 最後所在方案的改動。 */
    diff: ChangeDiff;
    /** 最後所在方案的自動備案；它沒有備份時是這批第一份備案。 */
    autoBackupPlanId?: string;
    autoBackupPlanIds: string[];
    changedPlans: PlanChange[];
  }
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
/** 與儲存格式（storage.ts）的上限一致：超過就拒絕，不讓存進去的資料讀不回來。自己另存的方案保留 5 個名額給自動備案。 */
export const PLAN_LIMITS = Object.freeze({ plans: 30, manualPlans: 25, itemsPerPlan: 100, candidates: 600 });
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
const lockedIn = (plans: readonly Plan[], key: string) => plans.some(({ items }) => items.some((item) => item.locked && item.key === key));

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
      // 和移出課表一樣略過鎖定課：任一方案鎖定就不移出候選。
      if (lockedIn(state.plans, change.key)) return state;
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

/** 逐步套用；同時記下這批新建的方案各自複製自哪個方案。 */
function replay(state: PlannerState, changes: readonly Change[], catalog: ReadonlyMap<string, ScheduleCourse>) {
  const copiedFrom = new Map<string, string>();
  const applied = changes.reduce((current, change) => {
    if (change.type === 'createPlan') copiedFrom.set(nextPlanId(current.plans), current.activePlanId);
    return applyOne(current, change, catalog);
  }, state);
  const baseline = (planId: string): PlanItem[] => {
    const original = state.plans.find(({ id }) => id === planId);
    if (original) return original.items;
    const source = copiedFrom.get(planId);
    return source ? baseline(source) : [];
  };
  return { applied, copiedFrom, baseline };
}

/** 每一步當下所在方案裡已鎖定、卻被這一步要求移除的課。AI 變更用來說明為什麼不套用；畫面上的移除本來就會略過鎖定課。 */
export function lockedRemovals(state: PlannerState, changes: readonly Change[], catalog: ReadonlyMap<string, ScheduleCourse>): string[] {
  if (validate(state, changes, catalog).length) return [];
  const keys: string[] = [];
  changes.reduce((current, change) => {
    if (change.type === 'removeFromSchedule' && lockedIn(current.plans.filter(({ id }) => id === current.activePlanId), change.key)) keys.push(change.key);
    if (change.type === 'removeCandidate' && lockedIn(current.plans, change.key)) keys.push(change.key);
    return applyOne(current, change, catalog);
  }, state);
  return keys;
}

const sameItems = (first: readonly PlanItem[], second: readonly PlanItem[]) => first.length === second.length
  && first.every((item, index) => {
    const other = second[index];
    return item === other || (Boolean(other) && JSON.stringify(item) === JSON.stringify(other));
  });

const isBigChange = ({ added, removed }: ChangeDiff) => removed.length > 0 || added.length + removed.length >= BIG_CHANGE_COURSES;

export function applyChanges(
  state: PlannerState,
  changes: readonly Change[],
  catalog: ReadonlyMap<string, ScheduleCourse>,
  options: ApplyOptions = {},
): ApplyResult {
  const errors = validate(state, changes, catalog);
  if (errors.length) return { status: 'rejected', errors };

  const { applied, copiedFrom, baseline } = replay(state, changes, catalog);
  const limitErrors = [
    applied.plans.filter(({ auto }) => !auto).length > PLAN_LIMITS.manualPlans ? `自己另存的方案最多 ${PLAN_LIMITS.manualPlans} 個。` : '',
    applied.plans.some(({ items }) => items.length > PLAN_LIMITS.itemsPerPlan) ? `一個方案最多 ${PLAN_LIMITS.itemsPerPlan} 門課。` : '',
    applied.candidates.length > PLAN_LIMITS.candidates ? `候選清單最多 ${PLAN_LIMITS.candidates} 門課。` : '',
  ].filter(Boolean);
  if (limitErrors.length) return { status: 'rejected', errors: limitErrors };

  // 每個方案各自和改動前比較；新建的方案以複製來源原本的內容為基準。
  const changedPlans: PlanChange[] = applied.plans.flatMap((plan) => {
    const created = copiedFrom.has(plan.id);
    const before = baseline(plan.id);
    const diff = diffItems(before, plan.items);
    // 只改出席方式或鎖定也算改到（會影響衝堂與空檔），但不算大改動。
    return created || !sameItems(before, plan.items) ? [{ planId: plan.id, created, baseline: before, diff }] : [];
  });
  const diff = changedPlans.find(({ planId }) => planId === applied.activePlanId)?.diff ?? { added: [], removed: [] };
  // 只有改到原本就存在的方案才需要備份；新建的方案本身就是備案。
  const needBackup = (options.autoBackup ?? true) ? changedPlans.filter((change) => !change.created && isBigChange(change.diff)) : [];
  if (!needBackup.length) {
    return { status: 'applied', state: applied, undo: state, diff, autoBackupPlanIds: [], changedPlans };
  }

  const limit = options.autoBackupLimit ?? DEFAULT_AUTO_BACKUP_LIMIT;
  const autoPlans = applied.plans.filter(({ auto }) => auto);
  const excess = autoPlans.length + needBackup.length - limit;
  let plans = applied.plans;
  if (excess > 0) {
    if (!options.replaceOldestAutoBackup) return { status: 'needsConfirmation', reason: 'autoBackupFull', limit };
    // 從最舊的開始替換，但跳過學生正在看的方案和這批正在修改的方案。
    const keep = new Set([applied.activePlanId, ...changedPlans.map(({ planId }) => planId)]);
    const replaceable = autoPlans.filter(({ id }) => !keep.has(id)).slice(0, excess).map(({ id }) => id);
    if (replaceable.length < excess) {
      return { status: 'rejected', errors: ['自動備案已滿，而且能替換的只剩目前所在或這次正在修改的方案；請先切到其他方案再修改。'] };
    }
    plans = plans.filter(({ id }) => !replaceable.includes(id));
  }
  const firstId = Number(nextPlanId(applied.plans).replace('plan-', ''));
  const lastNumber = applied.plans.reduce((highest, { auto, name }) => (
    auto ? Math.max(highest, Number(/^自動備案 (\d+)/.exec(name)?.[1] ?? 0)) : highest
  ), 0);
  const backups: Plan[] = needBackup.map((change, index) => {
    change.backupPlanId = `plan-${firstId + index}`;
    return {
      id: change.backupPlanId,
      name: `自動備案 ${lastNumber + index + 1}（改動前）`,
      auto: true,
      items: change.baseline.map((item) => ({ ...item })),
    };
  });
  const autoBackupPlanIds = backups.map(({ id }) => id);
  const autoBackupPlanId = needBackup.find(({ planId }) => planId === applied.activePlanId)?.backupPlanId ?? autoBackupPlanIds[0];
  return {
    status: 'applied',
    state: { ...applied, plans: [...plans, ...backups] },
    undo: state,
    diff,
    ...(autoBackupPlanId ? { autoBackupPlanId } : {}),
    autoBackupPlanIds,
    changedPlans,
  };
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
