// 搜課：候選清單篩選（移植自舊 catalog-filters）與全校課程快照搜尋（新增）。

import type { Course } from './official/course.ts';
import { periodsForRange, type Meeting } from './periods.ts';
import type { Attendance, ScheduleCourse } from './schedule/selection.ts';

export const CATALOG_DAYPARTS = Object.freeze({
  morning: Object.freeze({ start: 370, end: 720 }),
  afternoon: Object.freeze({ start: 730, end: 1080 }),
  evening: Object.freeze({ start: 1090, end: 1320 }),
});

type Daypart = keyof typeof CATALOG_DAYPARTS;

export interface CandidateFilters {
  query?: string;
  statuses?: readonly ('selected' | 'remote' | 'review')[];
  selectedKeys?: readonly string[];
  eligibilityStatuses?: Readonly<Record<string, string>>;
  attendanceByCourse?: Readonly<Record<string, Attendance>>;
  weekdays?: readonly number[];
  dayparts?: readonly (Daypart | 'flexible')[];
}

/** 全形轉半形、去空白、轉小寫，讓「ｐｙｔｈｏｎ」「英文（一）」等寫法都能比對。 */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function countActiveCatalogFilters(filters: CandidateFilters = {}): number {
  return (['statuses', 'weekdays', 'dayparts'] as const)
    .reduce((total, key) => total + new Set<unknown>(filters[key] ?? []).size, 0);
}

function overlapsDaypart(meeting: Meeting, daypart: string): boolean {
  const window = CATALOG_DAYPARTS[daypart as Daypart];
  return Boolean(window) && meeting.start < window.end && window.start < meeting.end;
}

export function filterCandidateCourses(courses: readonly ScheduleCourse[], filters: CandidateFilters = {}): ScheduleCourse[] {
  const query = normalizeSearchText(filters.query ?? '');
  const statuses = new Set(filters.statuses ?? []);
  const selectedKeys = new Set(filters.selectedKeys ?? []);
  const eligibilityStatuses = filters.eligibilityStatuses ?? {};
  const attendanceByCourse = filters.attendanceByCourse ?? {};
  const weekdays = new Set((filters.weekdays ?? []).map(Number).filter(Number.isFinite));
  const requestedDayparts = new Set<string>(filters.dayparts ?? []);
  const dayparts = [...requestedDayparts].filter((value) => value in CATALOG_DAYPARTS);
  const includesFlexible = requestedDayparts.has('flexible');
  return courses.filter((course) => {
    const haystack = normalizeSearchText(`${course.title} ${course.teacher ?? ''} ${course.code ?? ''}`);
    if (query && !haystack.includes(query)) return false;
    const attendance = attendanceByCourse[course.key];
    const statusMatches = !statuses.size
      || (statuses.has('selected') && selectedKeys.has(course.key))
      || (statuses.has('remote') && (course.delivery.asyncAllowed || attendance === 'async'))
      || (statuses.has('review') && eligibilityStatuses[course.key] === 'review');
    if (!statusMatches) return false;
    if (!weekdays.size && !dayparts.length && !includesFlexible) return true;
    const meetings = attendance === 'async' ? [] : course.meetings;
    if (!weekdays.size && includesFlexible && !meetings.length) return true;
    return meetings.some((meeting) => {
      const weekdayMatches = !weekdays.size || weekdays.has(meeting.day);
      const daypartMatches = !requestedDayparts.size || dayparts.some((daypart) => overlapsDaypart(meeting, daypart));
      return weekdayMatches && daypartMatches;
    });
  });
}

// ── 開課班級（官方 subGde，例「經濟二甲經濟二乙」「法律碩一法律博一」「經濟系」）──

export interface OfferingUnit {
  /** 系所簡稱，例「經濟」「法律」；拆不開的整段原文（例「教務處通識教育中心」）。 */
  department: string;
  /** 年級，例「二」「碩一」「博一」「碩專一」「學士」；不分年級為空字串。班別（甲乙、土管）不保留。 */
  grade: string;
}

// 系所簡稱 + 學制（碩專／碩／博）+ 年級 + 班別（甲乙丙、A/B、地政系的土管／土資／土測組）。
const UNIT_PATTERN = /(.+?)(?:(碩專|碩|博)?([一二三四五六七1-7])([甲乙丙丁戊己]|[A-Z]|土[管資測])?|(學士|碩士|博士))/y;
// 官方用很短的簡稱，少數要對回系名才找得到。
const DEPARTMENT_ALIASES: Readonly<Record<string, string>> = { 地: '地政' };
const UNDERGRAD_GRADE = /^[一二三四五六七1-7]$/;

const canonicalDepartment = (name: string) => DEPARTMENT_ALIASES[name] ?? name;

// 全校約 600 種開課班級寫法，搜尋每打一個字都要比對，記下解析結果。
const parsedGroups = new Map<string, readonly OfferingUnit[]>();

function unitsOf(text: string): readonly OfferingUnit[] {
  const value = text.trim();
  const cached = parsedGroups.get(value);
  if (cached) return cached;
  const units = Object.freeze(splitTargetGroup(value).map((unit) => Object.freeze(unit)));
  if (parsedGroups.size < 5000) parsedGroups.set(value, units);
  return units;
}

export function parseTargetGroup(text: string): OfferingUnit[] {
  return unitsOf(text).map((unit) => ({ ...unit }));
}

function splitTargetGroup(value: string): OfferingUnit[] {
  if (!value) return [];
  const units: OfferingUnit[] = [];
  UNIT_PATTERN.lastIndex = 0;
  while (UNIT_PATTERN.lastIndex < value.length) {
    const match = UNIT_PATTERN.exec(value);
    if (!match) break;
    const [, department = '', level = '', year = '', , degree = ''] = match;
    units.push({ department: canonicalDepartment(department), grade: degree || `${level}${year}` });
  }
  if (UNIT_PATTERN.lastIndex === value.length && units.length) return units;
  // 整段是系所名（「經濟系」「台史所」）或拆不開：去掉結尾的「系」「所」當系所，不分年級。
  return [{ department: canonicalDepartment(value.replace(/(?<=..)[系所]$/, '')), grade: '' }];
}

/** 搜尋結果列用的簡短開課班級，例「經濟二、三」「法律碩一、博一」；整段系所名照原文。 */
export function formatTargetGroup(text: string): string {
  const units = unitsOf(text);
  if (units.every(({ grade }) => !grade)) return text.trim();
  const byDepartment = new Map<string, string[]>();
  units.forEach(({ department, grade }) => {
    const grades = byDepartment.get(department) ?? [];
    if (grade && !grades.includes(grade)) grades.push(grade);
    byDepartment.set(department, grades);
  });
  return [...byDepartment].map(([department, grades]) => `${department}${grades.join('、')}`).join('・');
}

export interface OfferingDepartment {
  department: string;
  /** 顯示名稱：資料裡有「經濟系」「台史所」這種寫法就用它，否則用簡稱。 */
  label: string;
  grades: string[];
  /** 開課數。 */
  count: number;
}

const YEARS = '一二三四五六七';
const DEGREE_GRADES = ['學士', '碩士', '博士'];
/** 年級排序：大學部、碩、碩專、博，各自依年級；「學士」「碩士」這類整段的放最後。 */
const gradeRank = (grade: string) => {
  const degree = DEGREE_GRADES.indexOf(grade);
  if (degree >= 0) return 100 + degree;
  const level = /^(碩專|碩|博)/.exec(grade)?.[1] ?? '';
  const year = grade.slice(level.length);
  return ['', '碩', '碩專', '博'].indexOf(level) * 10 + (/^\d$/.test(year) ? Number(year) : YEARS.indexOf(year) + 1);
};

/** 從課程快照整理出開課系所與年級，給「開課系級」選單用。 */
export function offeringDepartments(courses: readonly Course[]): OfferingDepartment[] {
  const found = new Map<string, { label: string; grades: Set<string>; count: number }>();
  courses.forEach((course) => {
    const text = course.official.targetGroup.trim();
    const units = unitsOf(text);
    new Set(units.map(({ department }) => department)).forEach((department) => {
      const entry = found.get(department) ?? { label: department, grades: new Set<string>(), count: 0 };
      entry.count += 1;
      units.filter((unit) => unit.department === department && unit.grade).forEach(({ grade }) => entry.grades.add(grade));
      if (units.length === 1 && !units[0]!.grade && text !== department) entry.label = text;
      found.set(department, entry);
    });
  });
  return [...found].map(([department, { label, grades, count }]) => ({
    department,
    label,
    grades: [...grades].sort((first, second) => gradeRank(first) - gradeRank(second)),
    count,
  }));
}

function matchesUnit(units: readonly OfferingUnit[], department: string, grade: string): boolean {
  return units.some((unit) => unit.department === department && (
    !grade || unit.grade === grade || (!unit.grade && UNDERGRAD_GRADE.test(grade))
  ));
}

/** 關鍵字的延伸比對：開課班級（含「經濟系」這種寫法）、通識類別與標籤文字。 */
function detailText(course: Course): string {
  const { official } = course;
  const departments = unitsOf(official.targetGroup).map(({ department }) => `${department} ${department}系`);
  return [
    official.targetGroup,
    ...departments,
    official.generalEducation,
    official.generalEducation ? '通識' : '',
    official.emi ? '英語授課 EMI' : '',
    official.degreeLevel,
    official.fee === '收費' ? '收費' : '',
    official.semesterSpan === '全學年科目' ? '全學年' : '',
    course.delivery.asyncAllowed ? '可非同步' : '',
  ].filter(Boolean).map(normalizeSearchText).join('|');
}

const degreeMatches = (degreeLevel: string, degree: 'undergrad' | 'graduate') => (
  !degreeLevel || (degree === 'undergrad' ? degreeLevel.includes('學士') : /碩|博/.test(degreeLevel))
);

export interface CourseSearch {
  /** 以空白分隔的關鍵字，每個都要出現在課名、教師或課號中。 */
  text?: string;
  /** 關鍵字也比對開課班級、通識類別與標籤（「經濟系」「通識」「英語授課」「EMI」）。 */
  matchDetails?: boolean;
  /** 開課班級（官方 subGde），部分比對。 */
  unit?: string;
  /** 開課系所（parseTargetGroup 的 department）。 */
  department?: string;
  /** 搭配 department 的年級；大學部年級也包含該系不分年級的課。 */
  grade?: string;
  generalEducation?: readonly string[];
  /** 任一類通識。 */
  anyGeneralEducation?: boolean;
  /** 學制：學士班或碩博士班（兩者皆開的課都列入）。 */
  degree?: 'undergrad' | 'graduate';
  /** 只要英語授課（EMI）。 */
  emi?: boolean;
  weekdays?: readonly number[];
  /** 政大節次代碼（例 'D'、'5'）；與星期需落在同一段上課時間。 */
  periods?: readonly string[];
  /** 任一段上課時間碰到這些節次就排除（例早八：A、B、1）。 */
  excludePeriods?: readonly string[];
  /** 沒有固定時間的課也列入（即使有星期／節次條件）。 */
  includeUnscheduled?: boolean;
}

export function searchCourses(courses: readonly Course[], search: CourseSearch): Course[] {
  const words = (search.text ?? '').normalize('NFKC').split(/\s+/).map(normalizeSearchText).filter(Boolean);
  const unit = normalizeSearchText(search.unit ?? '');
  const department = (search.department ?? '').trim();
  const grade = (search.grade ?? '').trim();
  const generalEducation = new Set(search.generalEducation ?? []);
  const weekdays = new Set(search.weekdays ?? []);
  const periods = new Set(search.periods ?? []);
  const excluded = new Set(search.excludePeriods ?? []);
  const timeFiltered = weekdays.size > 0 || periods.size > 0;
  return courses.filter((course) => {
    if (words.length) {
      const basic = normalizeSearchText(`${course.title} ${course.teacher} ${course.code}`);
      const haystack = search.matchDetails ? `${basic}|${detailText(course)}` : basic;
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    if (unit && !normalizeSearchText(course.official.targetGroup).includes(unit)) return false;
    if (department && !matchesUnit(unitsOf(course.official.targetGroup), department, grade)) return false;
    if (generalEducation.size && !generalEducation.has(course.official.generalEducation)) return false;
    if (search.anyGeneralEducation && !course.official.generalEducation) return false;
    if (search.degree && !degreeMatches(course.official.degreeLevel, search.degree)) return false;
    if (search.emi && !course.official.emi) return false;
    if (excluded.size && course.meetings.some((meeting) => periodsForRange(meeting.start, meeting.end).some(({ code }) => excluded.has(code)))) return false;
    if (!timeFiltered) return true;
    if (!course.meetings.length) return Boolean(search.includeUnscheduled);
    return course.meetings.some((meeting) => (
      (!weekdays.size || weekdays.has(meeting.day))
      && (!periods.size || periodsForRange(meeting.start, meeting.end).some(({ code }) => periods.has(code)))
    ));
  });
}
