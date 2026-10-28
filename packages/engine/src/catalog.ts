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

export interface CourseSearch {
  /** 以空白分隔的關鍵字，每個都要出現在課名、教師或課號中。 */
  text?: string;
  /** 開課班級（官方 subGde），部分比對。 */
  unit?: string;
  generalEducation?: readonly string[];
  weekdays?: readonly number[];
  /** 政大節次代碼（例 'D'、'5'）；與星期需落在同一段上課時間。 */
  periods?: readonly string[];
  /** 沒有固定時間的課也列入（即使有星期／節次條件）。 */
  includeUnscheduled?: boolean;
}

export function searchCourses(courses: readonly Course[], search: CourseSearch): Course[] {
  const words = (search.text ?? '').normalize('NFKC').split(/\s+/).map(normalizeSearchText).filter(Boolean);
  const unit = normalizeSearchText(search.unit ?? '');
  const generalEducation = new Set(search.generalEducation ?? []);
  const weekdays = new Set(search.weekdays ?? []);
  const periods = new Set(search.periods ?? []);
  const timeFiltered = weekdays.size > 0 || periods.size > 0;
  return courses.filter((course) => {
    if (words.length) {
      const haystack = normalizeSearchText(`${course.title} ${course.teacher} ${course.code}`);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    if (unit && !normalizeSearchText(course.official.targetGroup).includes(unit)) return false;
    if (generalEducation.size && !generalEducation.has(course.official.generalEducation)) return false;
    if (!timeFiltered) return true;
    if (!course.meetings.length) return Boolean(search.includeUnscheduled);
    return course.meetings.some((meeting) => (
      (!weekdays.size || weekdays.has(meeting.day))
      && (!periods.size || periodsForRange(meeting.start, meeting.end).some(({ code }) => periods.has(code)))
    ));
  });
}
