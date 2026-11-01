// 「幫我排滿」與畢業缺口「排一門進去」（2026-11-01 易用性審查第 5、6 名，使用者核可）：全部是確定性的本機計算，不經過 AI。
// 固定點：課表上已有的課（含鎖定、已灌檔）＋本班必修（chooseSections 挑班）；再依序從候選（依課名，任一班）、
// 本系選修與群修、合格的通識補到目標學分。硬性規則：不衝堂、空堂日、不要早八、同名或課號前六碼只排一門、
// 學分上限、初選分發科目數上限（選課須知）、修課資格、已修過、大學部不排研究所課。
// 舊 ai/plan.ts 的 maximumCreditSelection／fillToMinimumCredits 只顧學分與衝堂，不管偏好、同名與科目數上限，所以不直接沿用。

import { normalizeSearchText, parseClassUnits } from '../catalog.ts';
import { evaluateEligibility, type IdentityProfile } from '../eligibility.ts';
import { periodsForRange } from '../periods.ts';
import { courseCategory, type CourseCategory, type EnrollmentRules } from '../rules.ts';
import { chooseSections, classUnitMatch, type ClassName, type SectionPreferences } from './classPlan.ts';
import { addCourse, findClashes, totalCredits, type ScheduleCourse, type ScheduleEntry } from './selection.ts';

export interface FillContext {
  /** 目前方案的課：全部當固定點，不會被拿掉。 */
  entries: readonly ScheduleEntry[];
  catalog: readonly ScheduleCourse[];
  profile: IdentityProfile;
  preferences: SectionPreferences;
  /** 選課須知：初選分發科目數上限與課號字首；沒給就不檢查科目數。 */
  rules?: EnrollmentRules;
  /** 學分上限（依身分）；沒給就不檢查。 */
  maximumCredits?: number;
  /** 已通過的課（全人系統資料）：不再排。 */
  passed?: (course: ScheduleCourse) => boolean;
  /** 畢業缺口缺的通識類別：補通識時排前面。 */
  priorityCategories?: readonly string[];
}

export interface FillRequest {
  className?: ClassName | null;
  /** 候選清單：依課名算，任一班排得進去都行。 */
  candidateKeys: readonly string[];
  target: number;
}

export type FillSource = 'required' | 'candidate' | 'department' | 'general';

export interface FillPick {
  key: string;
  source: FillSource;
}

export interface FillPlan {
  id: 'order' | 'compact' | 'alternative';
  label: string;
  description: string;
  /** 要加進課表的課：本班必修在前，其餘依挑選順序。 */
  picks: FillPick[];
  /** 加完之後整份課表的學分。 */
  credits: number;
  reached: boolean;
}

export type FitProblem = 'clash' | 'freeDay' | 'early' | 'same' | 'cap' | 'max' | 'eligibility' | 'passed' | 'graduate' | 'time' | 'gender';

const PROBLEM_LABELS: Record<FitProblem, string> = {
  clash: '衝堂',
  freeDay: '落在空堂日',
  early: '是早八',
  same: '和課表上的課同名',
  cap: '超過初選分發科目數上限',
  max: '會超過學分上限',
  eligibility: '修課資格不符',
  passed: '已經修過',
  graduate: '是研究所課程',
  time: '時間未定',
  gender: '分男女班',
};
const PROBLEM_ORDER = Object.keys(PROBLEM_LABELS) as FitProblem[];

const EARLY = new Set(['A', 'B', '1']);
const asEntry = (course: ScheduleCourse): ScheduleEntry => ({ course, item: addCourse([], course)[0]! });
const firstMeeting = (course: ScheduleCourse) => Math.min(Infinity, ...course.meetings.map(({ day, start }) => day * 1440 + start));
const byTime = (first: ScheduleCourse, second: ScheduleCourse) => firstMeeting(first) - firstMeeting(second) || first.key.localeCompare(second.key);
const subjectOf = (course: ScheduleCourse) => course.code?.slice(0, 6) ?? '';
const groupOf = (course: ScheduleCourse) => `${subjectOf(course)}|${normalizeSearchText(course.title)}`;
const isUndergradCourse = (course: ScheduleCourse) => !course.official?.degreeLevel || course.official.degreeLevel.includes('學士');

function categoryOf(course: ScheduleCourse, rules: EnrollmentRules | undefined): CourseCategory {
  if (rules) return courseCategory(course, rules);
  return course.official?.generalEducation ? 'general' : 'professional';
}

function capExceeded(selected: readonly ScheduleEntry[], course: ScheduleCourse, rules: EnrollmentRules | undefined): boolean {
  if (!rules) return false;
  const counts = new Map<CourseCategory, number>();
  [...selected.filter(({ course: other, item }) => other.itemType === 'course' && item.status === 'planned').map(({ course: other }) => other), course]
    .forEach((other) => {
      const category = categoryOf(other, rules);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
  const caps = rules.distributionCaps;
  const category = categoryOf(course, rules);
  const count = (name: CourseCategory) => counts.get(name) ?? 0;
  if (category === 'pe') return count('pe') > caps.pe;
  if (category === 'chinese') return count('chinese') > caps.chinese;
  if (category === 'foreign') return count('foreign') > caps.foreign;
  if (category === 'college' && count('college') > caps.college) return true;
  if (category === 'college' || category === 'general') return count('general') + count('college') > caps.generalAndCollege;
  return false;
}

/** 這門課加進 selected 會違反哪些規則；空陣列就是排得進去。 */
export function fitProblems(selected: readonly ScheduleEntry[], course: ScheduleCourse, context: FillContext): FitProblem[] {
  const problems = new Set<FitProblem>();
  const { freeDays = [], noEarly = false } = context.preferences;
  if (!course.meetings.length && !course.delivery.asyncAllowed) problems.add('time');
  course.meetings.forEach((meeting) => {
    if (freeDays.includes(meeting.day)) problems.add('freeDay');
    if (noEarly && periodsForRange(meeting.start, meeting.end).some(({ code }) => EARLY.has(code))) problems.add('early');
  });
  const title = normalizeSearchText(course.title);
  const subject = subjectOf(course);
  if (selected.some(({ course: other }) => normalizeSearchText(other.title) === title || (subject.length === 6 && subjectOf(other) === subject))) problems.add('same');
  if (findClashes(selected, course).length) problems.add('clash');
  if (capExceeded(selected, course, context.rules)) problems.add('cap');
  if (context.maximumCredits !== undefined && totalCredits(selected) + course.credits > context.maximumCredits) problems.add('max');
  const { status } = evaluateEligibility(course.eligibility, context.profile);
  if (status === 'blocked' || status === 'unavailable') problems.add('eligibility');
  if (context.passed?.(course)) problems.add('passed');
  if (context.profile.level !== 'graduate' && !isUndergradCourse(course)) problems.add('graduate');
  return PROBLEM_ORDER.filter((problem) => problems.has(problem));
}

interface Tier {
  source: Exclude<FillSource, 'required'>;
  courses: ScheduleCourse[];
  /** 同一層裡的先後（小的先）：本系選修依系級對得多準、通識依是不是畢業缺口缺的類別。 */
  rank: ReadonlyMap<string, number>;
}

function requiredGroups(context: FillContext, className: ClassName | null | undefined) {
  if (!className) return [];
  const scheduled = new Set(context.entries.map(({ course }) => groupOf(course)));
  const groups = new Map<string, ScheduleCourse[]>();
  context.catalog.forEach((course) => {
    if (!course.code || course.official?.requirementKind !== '必修' || !isUndergradCourse(course)) return;
    if (classUnitMatch(course.official.targetGroup, className) !== 'class') return;
    const id = groupOf(course);
    groups.set(id, [...(groups.get(id) ?? []), course]);
  });
  return [...groups.entries()]
    .filter(([id, options]) => !scheduled.has(id) && !options.every((option) => context.passed?.(option)))
    .map(([id, options]) => ({ id, options }));
}

function buildTiers(context: FillContext, request: FillRequest, requiredIds: ReadonlySet<string>): Tier[] {
  const official = context.catalog.filter((course) => course.code && course.itemType === 'course' && course.credits > 0 && !requiredIds.has(groupOf(course)));
  const candidateGroups = new Set(request.candidateKeys.flatMap((key) => {
    const course = context.catalog.find((other) => other.key === key);
    return course?.code ? [groupOf(course)] : [];
  }));
  const candidates = official.filter((course) => candidateGroups.has(groupOf(course)));
  const taken = new Set(candidates.map(({ key }) => key));
  const { className } = request;
  // 本系選修與群修：開課班級寫自己系級的最前面，其次只寫系的；本系其他年級的另成一層。
  const rank = new Map<string, number>();
  const department = className ? official.filter((course) => {
    if (taken.has(course.key) || course.official?.generalEducation || !isUndergradCourse(course)) return false;
    if (course.official?.requirementKind !== '選修' && course.official?.requirementKind !== '群修') return false;
    const match = classUnitMatch(course.official.targetGroup, className);
    const sameDepartment = parseClassUnits(course.official.targetGroup).some(({ department: name }) => name === className.department);
    if (!match && !sameDepartment) return false;
    rank.set(course.key, match === 'class' ? 0 : match === 'department' ? 1 : 2);
    return true;
  }) : [];
  department.forEach(({ key }) => taken.add(key));
  const priority = new Set(context.priorityCategories ?? []);
  const general = official.filter((course) => !taken.has(course.key) && course.official?.generalEducation);
  general.forEach((course) => rank.set(course.key, priority.has(course.official!.generalEducation) ? 0 : 1));
  // 本系其他年級的選修排在通識後面：修不修得到、算不算學分要看系上規定。
  return [
    { source: 'candidate', courses: candidates, rank },
    { source: 'department', courses: department.filter(({ key }) => rank.get(key)! < 2), rank },
    { source: 'general', courses: general, rank },
    { source: 'department', courses: department.filter(({ key }) => rank.get(key) === 2), rank },
  ];
}

type Strategy = 'order' | 'compact';

function bestOf(options: ScheduleCourse[], selected: readonly ScheduleEntry[], strategy: Strategy, rank: ReadonlyMap<string, number>): ScheduleCourse {
  const usedDays = new Set(selected.flatMap(({ course }) => course.meetings.map(({ day }) => day)));
  const newDays = (course: ScheduleCourse) => new Set(course.meetings.map(({ day }) => day).filter((day) => !usedDays.has(day))).size;
  const rankOf = (course: ScheduleCourse) => rank.get(course.key) ?? 0;
  return [...options].sort((first, second) => rankOf(first) - rankOf(second)
    || (strategy === 'compact' ? newDays(first) - newDays(second) : 0)
    || byTime(first, second))[0]!;
}

/** 依序從各層挑排得進去的課，補到目標學分為止（同一層內依策略排序）。 */
function fill(
  base: readonly ScheduleEntry[],
  tiers: readonly Tier[],
  target: number,
  context: FillContext,
  strategy: Strategy,
  banned: ReadonlySet<string>,
): FillPick[] {
  const selected = [...base];
  const picks: FillPick[] = [];
  while (totalCredits(selected) < target) {
    let found: { course: ScheduleCourse; source: Tier['source'] } | null = null;
    for (const tier of tiers) {
      const options = tier.courses.filter((course) => !banned.has(groupOf(course)) && fitProblems(selected, course, context).length === 0);
      if (options.length) {
        found = { course: bestOf(options, selected, strategy, tier.rank), source: tier.source };
        break;
      }
    }
    if (!found) break;
    selected.push(asEntry(found.course));
    picks.push({ key: found.course.key, source: found.source });
  }
  return picks;
}

const STRATEGIES = {
  order: { label: '照優先順序', description: '先排候選，再排本系選修與群修，最後補通識' },
  compact: { label: '上課天數少', description: '同樣的優先順序，盡量排在已經有課的日子' },
  alternative: { label: '換一批通識', description: '候選與本系選修照排，通識換成和第一份不同的課' },
} as const;

function prepare(context: FillContext, request: FillRequest) {
  const groups = requiredGroups(context, request.className);
  const required = chooseSections(groups, context.entries, context.preferences);
  const requiredPicks: FillPick[] = required.picks.map(({ key }) => ({ key, source: 'required' }));
  const byKey = new Map(context.catalog.map((course) => [course.key, course]));
  const base = [...context.entries, ...requiredPicks.map(({ key }) => asEntry(byKey.get(key)!))];
  const tiers = buildTiers(context, request, new Set(groups.map(({ id }) => id)));
  return { required, requiredPicks, base, tiers, byKey };
}

/**
 * 「幫我排滿」：2–3 份補到目標學分的完整方案（相同輸入相同輸出）。
 * 每份都含本班必修（排不進去的寫在 required.unplaced）；彼此相同的方案只留一份。
 */
export function buildFillPlans(context: FillContext, request: FillRequest): { plans: FillPlan[]; required: ReturnType<typeof chooseSections> } {
  const { required, requiredPicks, base, tiers, byKey } = prepare(context, request);
  const make = (id: FillPlan['id'], picks: FillPick[]): FillPlan => {
    const all = [...requiredPicks, ...picks];
    const credits = totalCredits([...context.entries, ...all.map(({ key }) => asEntry(byKey.get(key)!))]);
    return { id, ...STRATEGIES[id], picks: all, credits, reached: credits >= request.target };
  };
  const first = fill(base, tiers, request.target, context, 'order', new Set());
  const compact = fill(base, tiers, request.target, context, 'compact', new Set());
  // 第三份：候選與本系選修照排（那是學生要的課），通識換成第一份沒用到的。
  const banned = new Set(first.filter(({ source }) => source === 'general').map(({ key }) => groupOf(byKey.get(key)!)));
  const alternative = fill(base, tiers, request.target, context, 'order', banned);
  const seen = new Set<string>();
  const plans = [make('order', first), make('compact', compact), make('alternative', alternative)].filter((plan) => {
    const signature = plan.picks.map(({ key }) => key).sort().join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  return { plans, required };
}

/**
 * 方案裡的「換一門」：把 key 換成另一門排得進去的課（同樣的層級順序），其餘不動。
 * exclude：已經換掉過的課，不再換回來。本班必修不換；找不到別的課回傳 null。
 */
export function swapFillCourse(context: FillContext, request: FillRequest, plan: FillPlan, key: string, exclude: readonly string[]): FillPlan | null {
  const index = plan.picks.findIndex((pick) => pick.key === key);
  const pick = plan.picks[index];
  if (!pick || pick.source === 'required') return null;
  const { tiers, byKey } = prepare(context, request);
  const removed = byKey.get(key);
  if (!removed) return null;
  const rest = plan.picks.filter((other) => other.key !== key);
  const selected = [...context.entries, ...rest.map((other) => asEntry(byKey.get(other.key)!))];
  const skipped = new Set(exclude);
  const banned = new Set([groupOf(removed), ...exclude.flatMap((other) => (byKey.has(other) ? [groupOf(byKey.get(other)!)] : []))]);
  // 換了以後還到得了目標學分的課優先（原本就沒到的方案不限）。
  const base = totalCredits(selected);
  const keepsTarget = (course: ScheduleCourse) => !plan.reached || base + course.credits >= request.target;
  for (const tier of tiers) {
    const fitting = tier.courses.filter((course) => !skipped.has(course.key) && !banned.has(groupOf(course)) && fitProblems(selected, course, context).length === 0);
    if (!fitting.length) continue;
    const keeping = fitting.filter(keepsTarget);
    const course = bestOf(keeping.length ? keeping : fitting, selected, 'order', tier.rank);
    const picks = [...plan.picks];
    picks[index] = { key: course.key, source: tier.source };
    const credits = totalCredits([...context.entries, ...picks.map((other) => asEntry(byKey.get(other.key)!))]);
    return { ...plan, picks, credits, reached: credits >= request.target };
  }
  return null;
}

export type GapTarget =
  | { type: 'title'; title: string }
  | { type: 'category'; categories: readonly string[] }
  | { type: 'pe' }
  | { type: 'group'; department: string };

export type GapPick =
  | { status: 'picked'; key: string; source: GapTarget['type'] }
  | { status: 'covered'; key: string }
  | { status: 'none'; reason: string; closest: { key: string; problems: string[] }[] };

const NOTHING_OFFERED: Record<GapTarget['type'], string> = {
  title: '本學期沒有開這門課',
  category: '本學期沒有這類通識',
  pe: '本學期沒有體育課',
  group: '本學期沒有找到本系的群修',
};

function gapMatcher(gap: GapTarget, rules: EnrollmentRules | undefined): (course: ScheduleCourse) => boolean {
  switch (gap.type) {
    case 'title': {
      const title = normalizeSearchText(gap.title);
      return (course) => normalizeSearchText(course.title) === title;
    }
    case 'category':
      return (course) => gap.categories.includes(course.official?.generalEducation ?? '');
    case 'pe':
      return (course) => (rules ? (course.code ?? '').startsWith(rules.codePrefixes.pe) : course.title.startsWith('體育'));
    case 'group':
      return (course) => course.official?.requirementKind === '群修' && isUndergradCourse(course)
        && parseClassUnits(course.official.targetGroup).some(({ department }) => department === gap.department);
  }
}

/**
 * 畢業缺口「排一門進去」：同名必修、通識類別、體育或本系群修中，挑一門排得進去的（規則同幫我排滿）。
 * 課表上已經有符合的課就回傳 covered；都排不進去時說明原因並列出最接近的幾門。
 */
export function pickGapCourse(context: FillContext, gap: GapTarget): GapPick {
  const matches = gapMatcher(gap, context.rules);
  const existing = context.entries.find(({ course }) => matches(course));
  if (existing) return { status: 'covered', key: existing.course.key };
  const scheduled = new Set(context.entries.map(({ course }) => course.key));
  const pool = context.catalog.filter((course) => course.code && course.itemType === 'course' && !scheduled.has(course.key) && matches(course));
  if (!pool.length) return { status: 'none', reason: NOTHING_OFFERED[gap.type], closest: [] };
  const priority = new Set(context.priorityCategories ?? []);
  const rank = new Map(pool.map((course) => [course.key, priority.has(course.official?.generalEducation ?? '') ? 0 : 1]));
  // 體育分男女班：工具不知道學生的性別（也不問），這種班不自動挑，只列在最接近的選擇裡。
  const gendered = (course: ScheduleCourse) => gap.type === 'pe' && /\[(男|女)\]/.test(course.title);
  const checked = pool.map((course) => ({
    course,
    problems: [...fitProblems(context.entries, course, context), ...(gendered(course) ? ['gender' as const] : [])],
  }));
  const fitting = checked.filter(({ problems }) => problems.length === 0).map(({ course }) => course);
  if (fitting.length) return { status: 'picked', key: bestOf(fitting, context.entries, 'order', rank).key, source: gap.type };
  const union = PROBLEM_ORDER.filter((problem) => checked.some(({ problems }) => problems.includes(problem)));
  const closest = [...checked]
    .sort((first, second) => first.problems.length - second.problems.length || byTime(first.course, second.course))
    .slice(0, 3)
    .map(({ course, problems }) => ({ key: course.key, problems: problems.map((problem) => PROBLEM_LABELS[problem]) }));
  return { status: 'none', reason: `${gap.type === 'title' ? '每一班' : '每一門'}都${union.map((problem) => PROBLEM_LABELS[problem]).join('或')}`, closest };
}

/** 複製課號預覽：官方「必修灌檔」而且開課班級是學生自己的系級（系所會灌進去，不必自己登記）。 */
export function isClassAutoEnrolled(course: ScheduleCourse, className: ClassName): boolean {
  return course.official?.enrollmentType === '必修灌檔' && classUnitMatch(course.official.targetGroup, className) === 'class';
}
