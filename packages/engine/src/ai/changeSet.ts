// AI 變更方案：模型只能從有限動作清單選擇（設計 6.2），引擎解析、驗證後一次套用，成為單一復原單位。
// 身分與資格條件不在動作清單裡，型別與結構驗證都無法表達。

import { z } from 'zod';
import type { IdentityProfile } from '../eligibility.ts';
import { validateInternshipSettings } from '../internship.ts';
import { applyChanges, type ApplyResult, type Change, type PlannerState } from '../plans.ts';
import type { ScheduleCourse } from '../schedule/selection.ts';
import { validateSchedule, type Violation } from './validate.ts';

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

/** 課程參照：完整 key、官方課號，或差 1–2 字且「最接近者唯一」的課號（AI 打錯字）。其餘一律視為未知課程。 */
function resolveCourse(reference: string, catalog: ReadonlyMap<string, ScheduleCourse>): string {
  if (catalog.has(reference)) return reference;
  const byCode = new Map([...catalog.values()].filter((course) => course.code).map((course) => [course.code!, course.key]));
  const exact = byCode.get(reference);
  if (exact) return exact;
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

export interface ParsedAiActions {
  changes: Change[];
  requests: AiRequest[];
}

export function parseAiActions(content: string, catalog: ReadonlyMap<string, ScheduleCourse>): ParsedAiActions {
  const parsed = ResponseSchema.safeParse(parseJsonObject(content));
  if (!parsed.success) throw new AiContractError();
  const actions = parsed.data.actions;
  const changeCount = actions.filter(({ type }) => CHANGE_TYPES.has(type)).length;
  if (changeCount > MAX_CHANGE_ACTIONS) throw new AiContractError(`一次最多 ${MAX_CHANGE_ACTIONS} 個變更。`);
  const changes: Change[] = [];
  const requests: AiRequest[] = [];
  actions.forEach((action) => {
    switch (action.type) {
      case 'addCandidate':
      case 'removeCandidate':
      case 'addToSchedule':
      case 'removeFromSchedule':
        changes.push({ type: action.type, key: resolveCourse(action.course, catalog) });
        break;
      case 'setAttendance':
        changes.push({ type: 'setAttendance', key: resolveCourse(action.course, catalog), attendance: action.attendance });
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
        requests.push({ type: 'openCourse', course: resolveCourse(action.course, catalog) });
        break;
      default:
        requests.push(action);
    }
  });
  return { changes, requests };
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

function validateActive(state: PlannerState, catalog: ReadonlyMap<string, ScheduleCourse>, context: AiApplyContext) {
  const plan = state.plans.find(({ id }) => id === state.activePlanId);
  return validateSchedule({
    items: plan?.items ?? [],
    catalog,
    profile: context.profile,
    ...(context.termLabel ? { termLabel: context.termLabel } : {}),
    ...(context.maximumCredits !== undefined ? { maximumCredits: context.maximumCredits } : {}),
    internshipSettings: state.preferences.internship,
    minimumInternshipDays: context.minimumInternshipDays ?? 0,
    freeDays: state.preferences.freeDays,
  });
}

/** 套用前一律通過確定性檢查；只擋下這次變更「新造成」的問題，不合格就不套用並說明原因。 */
export function applyAiChangeSet(
  state: PlannerState,
  changes: readonly Change[],
  catalog: ReadonlyMap<string, ScheduleCourse>,
  context: AiApplyContext,
): AiApplyResult {
  const violations: Violation[] = [];
  const lockedKeys = new Set(state.plans.find(({ id }) => id === state.activePlanId)?.items.filter(({ locked }) => locked).map(({ key }) => key));
  changes.forEach((change) => {
    if ((change.type === 'removeFromSchedule' || change.type === 'removeCandidate') && lockedKeys.has(change.key)) {
      violations.push({ code: 'locked-course-removed', message: `${catalog.get(change.key)?.title ?? change.key} 已鎖定，不能移除。`, courseKeys: [change.key] });
    }
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

  const before = new Set(validateActive(state, catalog, context).violations.map(violationSignature));
  const after = validateActive(applied.state, catalog, context);
  const introduced = after.violations.filter((violation) => !before.has(violationSignature(violation)));
  if (introduced.length) return { status: 'rejected', violations: introduced };
  return { ...applied, warnings: after.warnings };
}
