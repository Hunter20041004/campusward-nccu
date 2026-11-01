// AI 變更方案：模型只能從有限動作清單選擇（設計 6.2），引擎解析、驗證後一次套用，成為單一復原單位。
// 身分與資格條件不在動作清單裡，型別與結構驗證都無法表達。

import { z } from 'zod';
import type { IdentityProfile } from '../eligibility.ts';
import { validateInternshipSettings } from '../internship.ts';
import { applyChanges, lockedRemovals, type ApplyResult, type Change, type PlannerState, type Preferences } from '../plans.ts';
import type { PlanItem, ScheduleCourse } from '../schedule/selection.ts';
import { validateSchedule, type ScheduleValidation, type Violation } from './validate.ts';

export const MAX_CHANGE_ACTIONS = 20;

export class AiContractError extends Error {
  constructor(message = 'AI 回覆格式不正確。') {
    super(message);
    this.name = 'AiContractError';
  }
}

const CourseRef = z.string().trim().min(1).max(40);
const InternshipSchema = z.object({
  targetDays: z.number(),
  start: z.string().max(5),
  end: z.string().max(5),
  mode: z.enum(['auto', 'fixed']),
  fixedDays: z.record(z.string().regex(/^[1-5]$/), z.enum(['full', 'morning', 'afternoon', 'none'])),
}).strict();

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addCandidate'), course: CourseRef }).strict(),
  z.object({ type: z.literal('removeCandidate'), course: CourseRef }).strict(),
  z.object({ type: z.literal('addToSchedule'), course: CourseRef }).strict(),
  z.object({ type: z.literal('removeFromSchedule'), course: CourseRef }).strict(),
  z.object({ type: z.literal('setAttendance'), course: CourseRef, attendance: z.enum(['sync', 'async']) }).strict(),
  z.object({ type: z.literal('createPlan'), name: z.string().trim().min(1).max(40) }).strict(),
  z.object({ type: z.literal('switchPlan'), planId: z.string().regex(/^plan-\d{1,4}$/) }).strict(),
  z.object({
    type: z.literal('setPreference'),
    freeDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    internship: InternshipSchema.optional(),
  }).strict(),
  z.object({ type: z.literal('searchCourses'), query: z.string().max(200) }).strict(),
  z.object({ type: z.literal('openCourse'), course: CourseRef }).strict(),
  z.object({ type: z.literal('answer'), text: z.string().max(4000) }).strict(),
  z.object({ type: z.literal('recommendCareer'), direction: z.string().max(1000) }).strict(),
]);

const ResponseSchema = z.object({ actions: z.array(ActionSchema).max(60) }).strict();

export type AiAction = z.infer<typeof ActionSchema>;
export type AiRequest = Extract<AiAction, { type: 'searchCourses' | 'openCourse' | 'answer' | 'recommendCareer' }>;

const CHANGE_TYPES = new Set(['addCandidate', 'removeCandidate', 'addToSchedule', 'removeFromSchedule', 'setAttendance', 'createPlan', 'switchPlan', 'setPreference']);

function parseJsonObject(content: string): unknown {
  try {
    const source = String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new AiContractError();
  }
}

function editDistance(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= second.length; j += 1) {
      current[j] = first[i - 1] === second[j - 1]
        ? previous[j - 1]!
        : Math.min(previous[j - 1]!, previous[j]!, current[j - 1]!) + 1;
    }
    previous = current;
  }
  return previous[second.length]!;
}

/**
 * 課程參照：完整 key、官方課號，或差 1–2 字且「最接近者唯一」的課號（AI 打錯字）。其餘一律視為未知課程。
 * 移除類動作不猜（fuzzy 為 false）：猜錯會拿掉學生沒要拿掉的課。
 */
function resolveCourse(reference: string, catalog: ReadonlyMap<string, ScheduleCourse>, byCode: ReadonlyMap<string, string>, fuzzy: boolean): string {
  if (catalog.has(reference)) return reference;
  const exact = byCode.get(reference);
  if (exact) return exact;
  if (!fuzzy) throw new AiContractError(`AI 回覆包含未知課程：${reference}`);
  let best = 3;
  let matches: string[] = [];
  byCode.forEach((key, code) => {
    const distance = editDistance(reference, code);
    if (distance < best) {
      best = distance;
      matches = [key];
    } else if (distance === best) {
      matches.push(key);
    }
  });
  if (matches.length === 1 && matches[0]) return matches[0];
  throw new AiContractError(`AI 回覆包含未知課程：${reference}`);
}

/** AI 寫錯、由引擎修正的課號；畫面要標示「已修正課號」。 */
export interface CourseCorrection {
  from: string;
  key: string;
}

export interface ParsedAiActions {
  changes: Change[];
  requests: AiRequest[];
  corrections: CourseCorrection[];
}

export function parseAiActions(content: string, catalog: ReadonlyMap<string, ScheduleCourse>): ParsedAiActions {
  const parsed = ResponseSchema.safeParse(parseJsonObject(content));
  if (!parsed.success) throw new AiContractError();
  const actions = parsed.data.actions;
  const changeCount = actions.filter(({ type }) => CHANGE_TYPES.has(type)).length;
  if (changeCount > MAX_CHANGE_ACTIONS) throw new AiContractError(`一次最多 ${MAX_CHANGE_ACTIONS} 個變更。`);
  const changes: Change[] = [];
  const requests: AiRequest[] = [];
  const corrections: CourseCorrection[] = [];
  const byCode = new Map([...catalog.values()].filter((course) => course.code).map((course) => [course.code!, course.key]));
  const resolve = (reference: string, fuzzy = true) => {
    const key = resolveCourse(reference, catalog, byCode, fuzzy);
    const corrected = key !== reference && catalog.get(key)?.code !== reference;
    if (corrected && !corrections.some((entry) => entry.from === reference && entry.key === key)) corrections.push({ from: reference, key });
    return key;
  };
  actions.forEach((action) => {
    switch (action.type) {
      case 'addCandidate':
      case 'addToSchedule':
        changes.push({ type: action.type, key: resolve(action.course) });
        break;
      case 'removeCandidate':
      case 'removeFromSchedule':
        changes.push({ type: action.type, key: resolve(action.course, false) });
        break;
      case 'setAttendance':
        changes.push({ type: 'setAttendance', key: resolve(action.course), attendance: action.attendance });
        break;
      case 'createPlan':
      case 'switchPlan':
        changes.push(action);
        break;
      case 'setPreference':
        changes.push({
          type: 'setPreference',
          ...(action.freeDays ? { freeDays: action.freeDays } : {}),
          ...(action.internship ? { internship: action.internship } : {}),
        });
        break;
      case 'openCourse':
        requests.push({ type: 'openCourse', course: resolve(action.course) });
        break;
      default:
        requests.push(action);
    }
  });
  return { changes, requests, corrections };
}

export interface AiApplyContext {
  profile: IdentityProfile;
  termLabel?: string;
  maximumCredits?: number;
  minimumInternshipDays?: number;
  autoBackupLimit?: number;
  replaceOldestAutoBackup?: boolean;
}

export type AiApplyResult =
  | (Extract<ApplyResult, { status: 'applied' }> & { warnings: Violation[] })
  | Extract<ApplyResult, { status: 'needsConfirmation' }>
  | { status: 'rejected'; violations: Violation[] };

const violationSignature = (violation: Violation) => `${violation.code}|${[...violation.courseKeys].sort().join(',')}`;

function validatePlan(items: readonly PlanItem[], preferences: Preferences, catalog: ReadonlyMap<string, ScheduleCourse>, context: AiApplyContext) {
  return validateSchedule({
    items,
    catalog,
    profile: context.profile,
    ...(context.termLabel ? { termLabel: context.termLabel } : {}),
    ...(context.maximumCredits !== undefined ? { maximumCredits: context.maximumCredits } : {}),
    internshipSettings: preferences.internship,
    minimumInternshipDays: context.minimumInternshipDays ?? 0,
    freeDays: preferences.freeDays,
  });
}

/** 這次變更新造成或變嚴重的問題：學分與實習天數看數值有沒有變差；空堂日只算新排進去的課；其餘依涉及的課比對。 */
function newProblems(before: ScheduleValidation, after: ScheduleValidation, catalog: ReadonlyMap<string, ScheduleCourse>): Violation[] {
  const earlier = (code: Violation['code']) => before.violations.find((violation) => violation.code === code);
  const seen = new Set(before.violations.map(violationSignature));
  return after.violations.flatMap((violation): Violation[] => {
    switch (violation.code) {
      case 'maximum-credits':
        return !earlier(violation.code) || after.credits > before.credits ? [violation] : [];
      case 'minimum-credits':
        return !earlier(violation.code) || after.credits < before.credits ? [violation] : [];
      case 'minimum-internship-days':
        return !earlier(violation.code) || (after.internship?.confirmedDays ?? 0) < (before.internship?.confirmedDays ?? 0) ? [violation] : [];
      case 'free-day-occupied': {
        const occupied = new Set(earlier(violation.code)?.courseKeys ?? []);
        const added = violation.courseKeys.filter((key) => !occupied.has(key));
        const titles = added.map((key) => catalog.get(key)?.title ?? key).join('、');
        return added.length ? [{ ...violation, message: `${titles} 排在你想空下來的日子。`, courseKeys: added }] : [];
      }
      default:
        return seen.has(violationSignature(violation)) ? [] : [violation];
    }
  });
}

/** 套用前一律通過確定性檢查；只擋下這次變更「新造成」的問題，不合格就不套用並說明原因。 */
export function applyAiChangeSet(
  state: PlannerState,
  changes: readonly Change[],
  catalog: ReadonlyMap<string, ScheduleCourse>,
  context: AiApplyContext,
): AiApplyResult {
  // 鎖定依每一步當下所在的方案判斷；移出候選清單會從所有方案移除，所以任一方案鎖定都不能移。
  const violations: Violation[] = lockedRemovals(state, changes, catalog).map((key) => ({
    code: 'locked-course-removed',
    message: `${catalog.get(key)?.title ?? key} 已鎖定，不能移除。`,
    courseKeys: [key],
  }));
  changes.forEach((change) => {
    if (change.type === 'setPreference' && change.internship) {
      const problem = validateInternshipSettings(change.internship);
      if (problem) violations.push({ code: 'invalid-preference', message: problem.message, courseKeys: [] });
    }
  });
  if (violations.length) return { status: 'rejected', violations };

  const applied = applyChanges(state, changes, catalog, {
    ...(context.autoBackupLimit !== undefined ? { autoBackupLimit: context.autoBackupLimit } : {}),
    ...(context.replaceOldestAutoBackup ? { replaceOldestAutoBackup: true } : {}),
  });
  if (applied.status === 'rejected') {
    return { status: 'rejected', violations: applied.errors.map((message) => ({ code: 'unknown-course', message, courseKeys: [] })) };
  }
  if (applied.status === 'needsConfirmation') return applied;

  // 每個被改到的方案都和改動前比較；最後所在的方案即使沒改課也要比較，因為偏好（空堂日、實習）可能改了。
  const finalPlanId = applied.state.activePlanId;
  const checks = applied.changedPlans.some(({ planId }) => planId === finalPlanId)
    ? applied.changedPlans
    : [...applied.changedPlans, { planId: finalPlanId, baseline: state.plans.find(({ id }) => id === finalPlanId)?.items ?? [] }];
  const seen = new Set<string>();
  let warnings: Violation[] = [];
  const introduced = checks.flatMap(({ planId, baseline }) => {
    const plan = applied.state.plans.find(({ id }) => id === planId);
    if (!plan) return [];
    const before = validatePlan(baseline, state.preferences, catalog, context);
    const after = validatePlan(plan.items, applied.state.preferences, catalog, context);
    if (planId === finalPlanId) warnings = after.warnings;
    return newProblems(before, after, catalog).flatMap((violation) => {
      const signature = violationSignature(violation);
      if (seen.has(signature)) return [];
      seen.add(signature);
      return [planId === finalPlanId ? violation : { ...violation, message: `「${plan.name}」：${violation.message}` }];
    });
  });
  if (introduced.length) return { status: 'rejected', violations: introduced };
  return { ...applied, warnings };
}
