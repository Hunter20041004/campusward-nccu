// 本班必修與空堂：依官方開課班級（subGde）與修別（subKind）列出某個系級本學期的必修，
// 用有上限的窮舉挑一組不衝堂的班；另有空堂延伸與「換到不衝堂的班」。全部是確定性的本機計算，不經過 AI。
// 設計：只依官方欄位，不從課名猜必修；開課班級只寫系、看不出年級的必修列為「可能要修」，不自動排入。

import { offeringDepartments, parseClassUnits } from '../catalog.ts';
import type { Course } from '../official/course.ts';
import { NCCU_PERIODS, periodsForRange } from '../periods.ts';
import { addCourse, findClashes, findConflicts, findOtherSections, occupiedMeetings, type ScheduleCourse, type ScheduleEntry } from './selection.ts';

const YEARS = '一二三四五六七';
const isUndergradGrade = (grade: string) => /^[^碩博]*[一二三四五六七]$/.test(grade);
const SECTIONS = ['甲', '乙', '丙', '丁', '戊', '己'];
// 地政系二年級起分土管、土資、土測三組，各組必修不同（官方開課班級寫「地二土管」）。
const TRACKS = ['土管', '土資', '土測'];
const SECTION_ORDER = [...SECTIONS, ...TRACKS];
const isSection = (section: string) => SECTION_ORDER.includes(section);
const isTrack = (section: string) => TRACKS.includes(section);
// 研究所、碩專、EMBA 不是大學部系級（「法律碩士一年級」不能變成「法律碩士」這個系）。
const GRADUATE = /碩|博|專|EMBA/i;
// 長寫法：「資訊科學系二年級」「會計學系二年級甲班」「地政系二年級土管組」「資訊大一」。
const LONG_FORM = /^(.{2,}?)(?:科學系|學系|系)?(?:([一二三四五六七])年級|大([一二三四]))([甲乙丙丁戊己]|土[管資測])?[班組]?$/;

/** 學生的系級，例 資訊／二／''、會計／二／甲、地政／二／土管、歐文學／法二／''。只收大學部年級。 */
export interface ClassName {
  department: string;
  grade: string;
  section: string;
}

/**
 * 「資訊二」「會計二甲」「地政二土管」「歐文學法二」（也收官方簡寫「歐文法二」）「資訊系 二年級」「會計系二年級甲班」→ 系級；
 * 研究所或看不出年級時回傳 null。classOptions 的每個值讀回來都是同一個系級。
 */
export function parseClassName(text: string): ClassName | null {
  const value = text.normalize('NFKC').replace(/\s+/g, '');
  if (!value || GRADUATE.test(value)) return null;
  const long = LONG_FORM.exec(value);
  // 長寫法換成短寫再走同一條路，語別（歐文法語）與簡稱（地）才會對回選單的寫法。
  const short = long ? `${long[1]}${long[2] ?? long[3]}${long[4] ?? ''}` : value;
  const units = parseClassUnits(short);
  if (units.length !== 1) return null;
  const [unit] = units as [ReturnType<typeof parseClassUnits>[number]];
  if (!isUndergradGrade(unit.grade)) return null;
  if (unit.section && !isSection(unit.section)) return null;
  return { department: unit.department, grade: unit.grade, section: unit.section };
}

export function formatClassName({ department, grade, section }: ClassName): string {
  return `${department}${grade}${section}`;
}

/** 系級對應的年級數字（大一＝1）；語別年級（法二）取最後一個字。 */
export function classYear({ grade }: ClassName): number {
  return YEARS.indexOf(grade.slice(-1)) + 1;
}

export interface ClassOption extends ClassName {
  /** 短寫，例「會計二甲」；也是存進身分的值。 */
  value: string;
  /** 給人看的寫法，例「會計 二年級甲班」。 */
  label: string;
}

/** 從課程快照的開課班級整理出可選的大學部系級（有分班的系也列出不分班的寫法）。 */
export function classOptions(courses: readonly Course[]): ClassOption[] {
  const labels = new Map(offeringDepartments(courses).map(({ department, label }) => [department, label]));
  const found = new Map<string, ClassOption>();
  const add = (department: string, grade: string, section: string) => {
    const value = `${department}${grade}${section}`;
    if (found.has(value)) return;
    const name = labels.get(department) ?? department;
    const year = `${grade.slice(0, -1)}${grade.slice(-1)}年級`;
    found.set(value, { department, grade, section, value, label: `${name} ${year}${section ? `${section}${isTrack(section) ? '組' : '班'}` : ''}` });
  };
  courses.forEach((course) => {
    if (course.official.degreeLevel && !course.official.degreeLevel.includes('學士')) return;
    parseClassUnits(course.official.targetGroup).forEach(({ department, grade, section }) => {
      if (!isUndergradGrade(grade)) return;
      add(department, grade, '');
      if (section && isSection(section)) add(department, grade, section);
    });
  });
  const rank = (grade: string) => YEARS.indexOf(grade.slice(-1));
  return [...found.values()].sort((first, second) => (
    (labels.get(first.department) ?? first.department).localeCompare(labels.get(second.department) ?? second.department, 'zh-Hant-TW')
    || first.grade.slice(0, -1).localeCompare(second.grade.slice(0, -1), 'zh-Hant-TW')
    || rank(first.grade) - rank(second.grade)
    || SECTION_ORDER.indexOf(first.section) - SECTION_ORDER.indexOf(second.section)
  ));
}

/**
 * 外來的系級文字（全人系統匯出檔）對到系級選單的值：選單沒有這個班別（本學期沒有分班開課）就退回不分班的寫法；
 * 研究所、選單沒有的系級或看不懂的文字回傳 undefined，不存一個對不到任何課的系級。
 */
export function offeredClassName(text: string, options: readonly ClassOption[]): string | undefined {
  const parsed = parseClassName(text);
  if (!parsed) return undefined;
  const values = new Set(options.map(({ value }) => value));
  return [formatClassName(parsed), formatClassName({ ...parsed, section: '' })].find((value) => values.has(value));
}

/** 同一門課的各班：科目代碼（課號前六碼）＋課名相同。 */
export interface CourseGroup {
  id: string;
  title: string;
  courses: Course[];
}

const groupId = (course: Course) => `${course.code.slice(0, 6)}|${course.title.normalize('NFKC').replace(/\s+/g, '')}`;

function groupCourses(courses: readonly Course[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  courses.forEach((course) => {
    const id = groupId(course);
    const group = groups.get(id) ?? { id, title: course.title, courses: [] };
    group.courses.push(course);
    groups.set(id, group);
  });
  return [...groups.values()];
}

/**
 * 開課班級和學生系級的關係：class＝寫了這個系級（有分班時班別也要對上；任一邊沒分班都算）；
 * department＝只寫系、看不出年級，或學生沒選組而這門課只開給部分組（地二土資）；其他（別系、別的年級）回傳 null。
 */
export function classUnitMatch(targetGroup: string, className: ClassName): 'class' | 'department' | null {
  const units = parseClassUnits(targetGroup).filter(({ department }) => department === className.department);
  const sameGrade = units.filter(({ grade }) => grade === className.grade);
  if (sameGrade.some(({ section }) => !section || !className.section || section === className.section)) {
    // 沒選組：三組都要修的才算本班必修；只開給部分組的課不知道學生要不要修，不自動排入。
    const covered = new Set(sameGrade.map(({ section }) => section));
    const partialTracks = !className.section && sameGrade.every(({ section }) => isTrack(section)) && !TRACKS.every((track) => covered.has(track));
    return partialTracks ? 'department' : 'class';
  }
  return units.some(({ grade }) => !grade) ? 'department' : null;
}

/**
 * 某系級本學期的必修（官方修別「必修」）。
 * required：開課班級寫了這個系級（有分班時班別也要對上；開課班級沒分班的都算）。
 * maybe：開課班級只寫系、不分年級（例「經濟系」）；不會自動排入，讓學生一門一門決定。
 */
export function classRequiredCourses(courses: readonly Course[], className: ClassName): { required: CourseGroup[]; maybe: CourseGroup[] } {
  const required: Course[] = [];
  const maybe: Course[] = [];
  courses.forEach((course) => {
    if (course.official.requirementKind !== '必修') return;
    if (course.official.degreeLevel && !course.official.degreeLevel.includes('學士')) return;
    const match = classUnitMatch(course.official.targetGroup, className);
    if (match === 'class') required.push(course);
    else if (match === 'department') maybe.push(course);
  });
  const requiredGroups = groupCourses(required);
  const taken = new Set(requiredGroups.map(({ id }) => id));
  return { required: requiredGroups, maybe: groupCourses(maybe).filter(({ id }) => !taken.has(id)) };
}

export interface SectionPreferences {
  freeDays?: readonly number[];
  noEarly?: boolean;
}

export interface SectionChoice {
  /** 依傳入的科目順序。 */
  picks: { groupId: string; key: string }[];
  /** 排不進去的科目：每一班都和這些課衝堂（已排的課或這次挑的班）。 */
  unplaced: { groupId: string; clashesWith: string[] }[];
  /** 搜尋到上限就停下，回傳目前最好的結果。 */
  truncated: boolean;
  /** 走過的組合數（≤ limit）。 */
  explored: number;
}

const EARLY = new Set(['A', 'B', '1']);
const SKIP_COST = 1000;
export const DEFAULT_SECTION_SEARCH_LIMIT = 5000;

const asEntry = (course: ScheduleCourse): ScheduleEntry => ({ course, item: addCourse([], course)[0]! });
const firstMeeting = (course: ScheduleCourse) => Math.min(Infinity, ...course.meetings.map(({ day, start }) => day * 1440 + start));

/** 偏好的代價：每段落在空堂日的上課 10、每段碰到早八 3。 */
function preferenceCost(course: ScheduleCourse, { freeDays = [], noEarly = false }: SectionPreferences): number {
  const days = new Set(freeDays);
  return course.meetings.reduce((cost, meeting) => cost
    + (days.has(meeting.day) ? 10 : 0)
    + (noEarly && periodsForRange(meeting.start, meeting.end).some(({ code }) => EARLY.has(code)) ? 3 : 0), 0);
}

/**
 * 每個科目挑一班：彼此不衝堂、也不和 fixed（課表上已有的課）衝堂，盡量避開空堂日與早八。
 * 分枝界限的窮舉：選項少的科目先排、每科依代價排序，第一條路就是貪婪解；走過 limit 個組合就停。
 * 排不進去的科目寫進 unplaced（不硬塞衝堂的班）。結果只取決於輸入，相同輸入相同輸出。
 */
export function chooseSections(
  groups: readonly { id: string; options: readonly ScheduleCourse[] }[],
  fixed: readonly ScheduleEntry[],
  preferences: SectionPreferences,
  { limit = DEFAULT_SECTION_SEARCH_LIMIT }: { limit?: number } = {},
): SectionChoice {
  // 每科可用的班：和已排的課不衝堂；依代價、上課時間、課號排序。
  const prepared = groups.map((group, index) => {
    const options = group.options
      .filter((option) => findClashes(fixed, option).length === 0)
      .map((option) => ({ option, cost: preferenceCost(option, preferences) }))
      .sort((first, second) => first.cost - second.cost || firstMeeting(first.option) - firstMeeting(second.option) || first.option.key.localeCompare(second.option.key));
    return { index, id: group.id, options };
  });
  const order = [...prepared].sort((first, second) => first.options.length - second.options.length || first.index - second.index);
  const clashCache = new Map<string, boolean>();
  const clash = (first: ScheduleCourse, second: ScheduleCourse) => {
    const id = first.key < second.key ? `${first.key}|${second.key}` : `${second.key}|${first.key}`;
    let value = clashCache.get(id);
    if (value === undefined) {
      value = findConflicts([asEntry(first), asEntry(second)]).length > 0;
      clashCache.set(id, value);
    }
    return value;
  };

  let explored = 0;
  let truncated = false;
  let best: { cost: number; picks: (ScheduleCourse | null)[] } | null = null;
  const chosen: (ScheduleCourse | null)[] = [];
  const search = (depth: number, cost: number) => {
    if (best && cost >= best.cost) return;
    if (depth === order.length) {
      best = { cost, picks: [...chosen] };
      return;
    }
    const { options } = order[depth]!;
    for (const { option, cost: optionCost } of options) {
      if (explored >= limit) { truncated = true; return; }
      if (chosen.some((other) => other && clash(other, option))) continue;
      explored += 1;
      chosen.push(option);
      search(depth + 1, cost + optionCost);
      chosen.pop();
    }
    if (explored >= limit) { truncated = true; return; }
    explored += 1;
    chosen.push(null);
    search(depth + 1, cost + SKIP_COST);
    chosen.pop();
  };
  search(0, 0);

  const result = best as { cost: number; picks: (ScheduleCourse | null)[] } | null;
  const byGroup = new Map<string, ScheduleCourse | null>();
  order.forEach(({ id }, depth) => byGroup.set(id, result?.picks[depth] ?? null));
  const picked = [...byGroup.values()].filter((course): course is ScheduleCourse => course !== null);
  const picks: SectionChoice['picks'] = [];
  const unplaced: SectionChoice['unplaced'] = [];
  groups.forEach((group) => {
    const course = byGroup.get(group.id);
    if (course) {
      picks.push({ groupId: group.id, key: course.key });
      return;
    }
    const blockers = new Set<string>();
    group.options.forEach((option) => {
      findClashes(fixed, option).forEach((key) => blockers.add(key));
      picked.filter((other) => clash(other, option)).forEach(({ key }) => blockers.add(key));
    });
    unplaced.push({ groupId: group.id, clashesWith: [...blockers].sort() });
  });
  return { picks, unplaced, truncated, explored };
}

export interface FreeStretch {
  day: number;
  /** 點的那一節。 */
  period: string;
  start: number;
  end: number;
  codes: string[];
}

/** 點到的空堂往前後延伸成整段連續空堂（政大節次）；那一節已經有課就回傳 null。 */
export function freeStretch(entries: readonly ScheduleEntry[], day: number, period: string): FreeStretch | null {
  const busy = new Set(entries.flatMap((entry) => occupiedMeetings(entry)
    .filter((meeting) => meeting.day === day)
    .flatMap((meeting) => periodsForRange(meeting.start, meeting.end).map(({ code }) => code))));
  const index = NCCU_PERIODS.findIndex(({ code }) => code === period);
  if (index < 0 || busy.has(period)) return null;
  let first = index;
  let last = index;
  while (first > 0 && !busy.has(NCCU_PERIODS[first - 1]!.code)) first -= 1;
  while (last < NCCU_PERIODS.length - 1 && !busy.has(NCCU_PERIODS[last + 1]!.code)) last += 1;
  const slots = NCCU_PERIODS.slice(first, last + 1);
  return { day, period, start: slots[0]!.start, end: slots.at(-1)!.end, codes: slots.map(({ code }) => code) };
}

/**
 * 衝堂時的換班建議：依 keys 的順序，找第一門沒鎖定、而且有別班換了不會衝堂的課（findOtherSections 同一套規則）。
 * 都換不了回傳 null。
 */
export function suggestSectionSwap(
  entries: readonly ScheduleEntry[],
  keys: readonly string[],
  catalog: Iterable<ScheduleCourse>,
): { key: string; sections: ScheduleCourse[] } | null {
  const courses = [...catalog];
  for (const key of keys) {
    const entry = entries.find(({ course }) => course.key === key);
    if (!entry || entry.item.locked) continue;
    const sections = findOtherSections(entries, key, courses);
    if (sections.length) return { key, sections };
  }
  return null;
}
