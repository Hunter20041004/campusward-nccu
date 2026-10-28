// AI 排課的確定性工具：讀出需求中的學分與語文偏好、最高學分組合、補足最低學分、加入語文課。
// 移植自舊 ai-service（舊版用來改寫模型的三個方案；新版供 AI 光球產生單一變更方案）。

import { evaluateEligibility, type IdentityProfile } from '../eligibility.ts';
import { findConflicts, totalCredits, type Attendance, type ScheduleCourse, type ScheduleEntry } from '../schedule/selection.ts';

export function requestsMaximumCredits(request: string): boolean {
  return /學分.{0,8}(越多越好|最多|最大|優先)/.test(request);
}

export function requestedMinimumCredits(request: string): number {
  const match = request.match(/(?:至少|最低|最少|不少於)\s*(?:要|需(?:要)?|希望)?\s*(\d{1,2}(?:\.\d+)?)\s*學分/)
    ?? request.match(/(\d{1,2}(?:\.\d+)?)\s*學分\s*(?:以上|起)/);
  return match ? Number(match[1]) : 0;
}

export interface LanguageGroup {
  label: string;
  patterns: readonly string[];
}

const LANGUAGE_GROUPS: readonly LanguageGroup[] = [
  { label: '日文', patterns: ['日文', '日語', '日本語'] },
  { label: '法文', patterns: ['法文', '法語'] },
  { label: '德文', patterns: ['德文', '德語'] },
  { label: '英文', patterns: ['英文', '英語'] },
  { label: '韓文', patterns: ['韓文', '韓語'] },
  { label: '西班牙文', patterns: ['西班牙文', '西語'] },
  { label: '俄文', patterns: ['俄文', '俄語'] },
  { label: '阿拉伯文', patterns: ['阿拉伯文', '阿語'] },
];

export function requestedLanguageGroups(request: string): LanguageGroup[] {
  const explicit = LANGUAGE_GROUPS.filter((group) => group.patterns.some((pattern) => request.includes(pattern)));
  if (explicit.length) return explicit;
  return /(語文|語言課)/.test(request) ? [...LANGUAGE_GROUPS] : [];
}

/** 送給 AI 的候選課：排除被擋下與查無開課的課（需確認資格的保留）。 */
export function eligibleForAi(candidates: readonly ScheduleCourse[], profile: IdentityProfile): ScheduleCourse[] {
  return candidates.filter((course) => {
    const { status } = evaluateEligibility(course.eligibility, profile);
    return status !== 'blocked' && status !== 'unavailable';
  });
}

const asEntry = (course: ScheduleCourse, attendance: Attendance): ScheduleEntry => ({
  course,
  item: { key: course.key, attendance, status: 'planned', locked: false },
});
const preferredAttendance = (course: ScheduleCourse): Attendance => (course.delivery.asyncAllowed ? 'async' : 'sync');
const clash = (first: ScheduleEntry, second: ScheduleEntry) => findConflicts([first, second]).length > 0;

function solveComponent(component: number[], adjacency: Set<number>[], credits: number[]): number[] {
  if (component.length > 30) {
    const selected: number[] = [];
    [...component].sort((a, b) => credits[b]! - credits[a]!).forEach((index) => {
      if (selected.every((chosen) => !adjacency[index]!.has(chosen))) selected.push(index);
    });
    return selected;
  }
  const position = new Map(component.map((index, local) => [index, local]));
  const neighbours = component.map((index) => [...adjacency[index]!].reduce(
    (mask, neighbour) => (position.has(neighbour) ? mask | (1n << BigInt(position.get(neighbour)!)) : mask),
    0n,
  ));
  const memo = new Map<bigint, { credits: number; selected: number[] }>();
  const solve = (mask: bigint): { credits: number; selected: number[] } => {
    if (mask === 0n) return { credits: 0, selected: [] };
    const cached = memo.get(mask);
    if (cached) return cached;
    let chosen = 0;
    let highestDegree = -1;
    component.forEach((_, local) => {
      if (!(mask & (1n << BigInt(local)))) return;
      let rest = neighbours[local]! & mask;
      let degree = 0;
      while (rest) {
        degree += Number(rest & 1n);
        rest >>= 1n;
      }
      if (degree > highestDegree) {
        highestDegree = degree;
        chosen = local;
      }
    });
    const bit = 1n << BigInt(chosen);
    const excluded = solve(mask & ~bit);
    const rest = solve(mask & ~bit & ~neighbours[chosen]!);
    const included = { credits: rest.credits + credits[component[chosen]!]!, selected: [component[chosen]!, ...rest.selected] };
    const best = included.credits >= excluded.credits ? included : excluded;
    memo.set(mask, best);
    return best;
  };
  return solve((1n << BigInt(component.length)) - 1n).selected;
}

/** 不衝堂前提下學分最高的組合；鎖定課一定保留，可非同步的課以非同步計。 */
export function maximumCreditSelection(candidates: readonly ScheduleCourse[], lockedKeys: readonly string[]): { courseKeys: string[]; asyncCourseKeys: string[] } {
  const locked = new Set(lockedKeys);
  const entries = candidates.map((course) => asEntry(course, preferredAttendance(course)));
  const credits = candidates.map((course) => course.credits);
  const lockedIndexes = entries.map((entry, index) => (locked.has(entry.course.key) ? index : -1)).filter((index) => index >= 0);
  const free = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => !locked.has(entry.course.key) && credits[index]! > 0
      && lockedIndexes.every((lockedIndex) => !clash(entry, entries[lockedIndex]!)));
  const adjacency = entries.map(() => new Set<number>());
  free.forEach((first, position) => {
    free.slice(position + 1).forEach((second) => {
      if (!clash(first.entry, second.entry)) return;
      adjacency[first.index]!.add(second.index);
      adjacency[second.index]!.add(first.index);
    });
  });
  const unseen = new Set(free.map(({ index }) => index));
  const selected = new Set(lockedIndexes);
  while (unseen.size) {
    const component: number[] = [];
    const pending = [unseen.values().next().value as number];
    while (pending.length) {
      const index = pending.pop()!;
      if (!unseen.delete(index)) continue;
      component.push(index);
      adjacency[index]!.forEach((neighbour) => { if (unseen.has(neighbour)) pending.push(neighbour); });
    }
    solveComponent(component, adjacency, credits).forEach((index) => selected.add(index));
  }
  const chosen = candidates.filter((_, index) => selected.has(index));
  return {
    courseKeys: chosen.map(({ key }) => key),
    asyncCourseKeys: chosen.filter((course) => course.delivery.asyncAllowed).map(({ key }) => key),
  };
}

/** 補到最低學分：先挑可非同步的課（保留實習時間），再依學分高低；不與現有課衝堂。 */
export function fillToMinimumCredits(current: readonly ScheduleEntry[], candidates: readonly ScheduleCourse[], minimum: number) {
  const selected = [...current];
  const taken = new Set(current.map(({ course }) => course.key));
  let credits = totalCredits(selected);
  const added: { key: string; attendance: Attendance }[] = [];
  const ordered = [...candidates].sort((a, b) => Number(b.delivery.asyncAllowed) - Number(a.delivery.asyncAllowed) || b.credits - a.credits);
  for (const course of ordered) {
    if (credits >= minimum) break;
    if (taken.has(course.key) || course.credits <= 0) continue;
    const candidate = asEntry(course, preferredAttendance(course));
    if (findConflicts([...selected, candidate]).length) continue;
    selected.push(candidate);
    taken.add(course.key);
    added.push({ key: course.key, attendance: candidate.item.attendance });
    credits += course.credits;
  }
  return { added, credits, reached: credits >= minimum };
}

export type LanguagePick =
  | { status: 'existing'; key: string; title: string }
  | { status: 'add'; key: string; title: string; removeKeys: string[] }
  | { status: 'none'; label: string };

/** 依語文偏好找一門真的存在、資格與時間可行的語文課；必要時移出衝堂的未鎖定課，鎖定課一律不動。 */
export function pickLanguageCourse(current: readonly ScheduleEntry[], candidates: readonly ScheduleCourse[], groups: readonly LanguageGroup[]): LanguagePick {
  const isLanguage = (course: ScheduleCourse) => groups.some((group) => group.patterns.some((pattern) => course.title.includes(pattern)));
  const existing = current.find(({ course }) => isLanguage(course));
  if (existing) return { status: 'existing', key: existing.course.key, title: existing.course.title };
  const taken = new Set(current.map(({ course }) => course.key));
  for (const course of candidates.filter((candidate) => !taken.has(candidate.key) && isLanguage(candidate))) {
    const entry = asEntry(course, 'sync');
    const conflicting = current.filter((other) => clash(entry, other));
    if (conflicting.some(({ item }) => item.locked)) continue;
    return { status: 'add', key: course.key, title: course.title, removeKeys: conflicting.map(({ course: other }) => other.key) };
  }
  return { status: 'none', label: groups.map(({ label }) => label).join('／') };
}
