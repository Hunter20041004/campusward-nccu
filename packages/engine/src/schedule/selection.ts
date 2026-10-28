// 課表選取、鎖定、衝堂與學分。移植自舊 planner-core。
// 課程資料（ScheduleCourse）與學生的選擇（PlanItem）分開存：選擇只記代號與學生決定，其餘一律回頭查課程。

import { evaluateEligibility, type EligibilityTarget, type IdentityProfile } from '../eligibility.ts';
import type { CourseEvent, Delivery, OfficialFields } from '../official/course.ts';
import { formatNccuSchedule, type Meeting } from '../periods.ts';

export type Attendance = 'sync' | 'async';
export type PlanItemStatus = 'planned' | 'registered' | 'enrolled';

export interface ScheduleCourse {
  /** 官方課程為「學期:課號」，手動課程為 manual-N。 */
  key: string;
  title: string;
  /** 官方課號（手動課程沒有）。 */
  code?: string;
  teacher?: string;
  credits: number;
  itemType: 'course' | 'club' | 'activity';
  meetings: Meeting[];
  events: CourseEvent[];
  delivery: Delivery;
  eligibility: EligibilityTarget;
  correctionId?: string;
  source?: 'official' | 'manual';
  /** 官方欄位與備註（選課規則提醒用；手動課程沒有）。 */
  official?: OfficialFields;
  restrictionText?: string;
  /** 給學生看的補充說明，例如手動課程尚未查證。 */
  note?: string;
}

export interface PlanItem {
  key: string;
  attendance: Attendance;
  /** planned＝排入；registered＝已灌檔；enrolled＝已選上。 */
  status: PlanItemStatus;
  locked: boolean;
  /** 加入或上次同步時，課程套用的人工更正；用來分辨「新更正」與「學生刻意改過的出席方式」。 */
  correctionId?: string;
}

export interface ScheduleEntry {
  course: ScheduleCourse;
  item: PlanItem;
}

export interface Conflict {
  type: 'weekly' | 'event';
  courseKeys: [string, string];
  message: string;
}

interface TimeRange {
  start: number;
  end: number;
}

const overlaps = (first: TimeRange, second: TimeRange) => first.start < second.end && second.start < first.end;

/** 實際佔用每週時段的上課時間；非同步修課不佔時段。 */
export function occupiedMeetings({ course, item }: ScheduleEntry): Meeting[] {
  return item.attendance === 'async' ? [] : course.meetings;
}

export function candidateScheduleSummary(course: ScheduleCourse, labels: readonly string[], attendance?: Attendance): string {
  if (attendance === 'async') return '非同步／時間彈性';
  const summaries = [...new Set(course.meetings.map((meeting) => formatNccuSchedule(meeting, labels)))];
  if (summaries.length) return summaries.join('・');
  if (course.delivery.asyncAllowed) return '非同步／時間彈性';
  return '時間未定';
}

export function findConflicts(entries: readonly ScheduleEntry[]): Conflict[] {
  const conflicts: Conflict[] = [];
  entries.forEach((first, index) => {
    entries.slice(index + 1).forEach((second) => {
      const weeklyOverlap = occupiedMeetings(first).some((a) => (
        occupiedMeetings(second).some((b) => a.day === b.day && overlaps(a, b))
      ));
      if (weeklyOverlap) {
        conflicts.push({
          type: 'weekly',
          courseKeys: [first.course.key, second.course.key],
          message: `${first.course.title} 與 ${second.course.title} 每週時段重疊`,
        });
      }
    });
  });
  // 一次性考試或活動即使非同步修課也必須到場；只有時間完整的活動才會比對，不捏造時間。
  entries.forEach((entry) => {
    entry.course.events.forEach((event) => {
      if (event.day === undefined || event.start === undefined || event.end === undefined) return;
      const timed = { day: event.day, start: event.start, end: event.end };
      entries.forEach((other) => {
        if (other.course.key === entry.course.key) return;
        if (occupiedMeetings(other).some((meeting) => meeting.day === timed.day && overlaps(timed, meeting))) {
          conflicts.push({
            type: 'event',
            courseKeys: [entry.course.key, other.course.key],
            message: `${entry.course.title}的${event.label}與 ${other.course.title} 時段重疊`,
          });
        }
      });
    });
  });
  return conflicts;
}

export function formatCourseEventReminder(course: { title: string }, event: Partial<CourseEvent>): string {
  const label = String(event.label ?? '').trim();
  const weekLabel = event.week && !label.includes(`第 ${event.week} 週`) ? `第 ${event.week} 週` : '';
  const timing = String(event.date || weekLabel).trim();
  return `${course.title}：${[timing, label].filter(Boolean).join(' ')}`;
}

export function totalCredits(entries: readonly ScheduleEntry[]): number {
  return entries.reduce((sum, { course }) => sum + (course.itemType === 'course' ? course.credits : 0), 0);
}

const findItem = (items: readonly PlanItem[], key: string) => items.find((candidate) => candidate.key === key);

export function addCourse(items: readonly PlanItem[], course: ScheduleCourse): PlanItem[] {
  if (findItem(items, course.key)) return [...items];
  const attendance: Attendance = course.delivery.asyncAllowed && course.delivery.defaultAttendance === 'async' ? 'async' : 'sync';
  return [...items, {
    key: course.key,
    attendance,
    status: 'planned',
    locked: false,
    ...(course.correctionId ? { correctionId: course.correctionId } : {}),
  }];
}

/** 先檢查資格：被擋下或查無開課的課不會加入。 */
export function addSelectableCourse(
  items: readonly PlanItem[],
  course: ScheduleCourse,
  profile: IdentityProfile,
  options: { termLabel?: string } = {},
): PlanItem[] {
  const { status } = evaluateEligibility(course.eligibility, profile, options);
  if (status === 'blocked' || status === 'unavailable') return [...items];
  return addCourse(items, course);
}

/** 鎖定的課不會被移除。 */
export function removeCourse(items: readonly PlanItem[], key: string): PlanItem[] {
  if (findItem(items, key)?.locked) return [...items];
  return items.filter((candidate) => candidate.key !== key);
}

export function toggleCourse(items: readonly PlanItem[], course: ScheduleCourse): PlanItem[] {
  return findItem(items, course.key) ? removeCourse(items, course.key) : addCourse(items, course);
}

export function toggleLock(items: readonly PlanItem[], key: string): PlanItem[] {
  return items.map((candidate) => (candidate.key === key ? { ...candidate, locked: !candidate.locked } : candidate));
}

/** 一個動作完成「加入並鎖定」；已鎖定則解鎖。 */
export function lockCandidateCourse(items: readonly PlanItem[], course: ScheduleCourse, profile: IdentityProfile): PlanItem[] {
  const existing = findItem(items, course.key);
  if (existing) return toggleLock(items, course.key);
  const added = addSelectableCourse(items, course, profile);
  return findItem(added, course.key) ? toggleLock(added, course.key) : added;
}

export function setAttendance(items: readonly PlanItem[], course: ScheduleCourse, attendance: Attendance): PlanItem[] {
  if (attendance === 'async' && !course.delivery.asyncAllowed) return [...items];
  return items.map((candidate) => (candidate.key === course.key ? { ...candidate, attendance } : candidate));
}

/** 已灌檔／已選上預設鎖定；改回排入時保留鎖定，由學生自己解鎖。 */
export function setStatus(items: readonly PlanItem[], key: string, status: PlanItemStatus): PlanItem[] {
  return items.map((candidate) => (candidate.key === key
    ? { ...candidate, status, locked: candidate.locked || status !== 'planned' }
    : candidate));
}

/** 官方資料更新後同步學生選擇：新的人工更正會套用預設出席方式，已看過的更正則尊重學生的改動。 */
export function refreshItems(items: readonly PlanItem[], catalog: ReadonlyMap<string, ScheduleCourse>): PlanItem[] {
  return items.map((candidate) => {
    const course = catalog.get(candidate.key);
    if (!course) return candidate;
    if (course.correctionId && course.correctionId !== candidate.correctionId) {
      return { ...candidate, attendance: course.delivery.defaultAttendance, correctionId: course.correctionId };
    }
    if (candidate.attendance === 'async' && !course.delivery.asyncAllowed) return { ...candidate, attendance: 'sync' };
    return candidate;
  });
}
