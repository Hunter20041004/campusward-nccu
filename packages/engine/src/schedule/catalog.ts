// 候選清單：官方課程與學生手動新增的課程／活動。移植自舊 planner-core。

import type { Course } from '../official/course.ts';
import { formatNccuSchedule, toMinutes } from '../periods.ts';
import type { PlanItem, ScheduleCourse } from './selection.ts';

const DAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export function courseKey(course: Pick<Course, 'term' | 'code'>): string {
  return `${course.term}:${course.code}`;
}

export function toScheduleCourse(course: Course): ScheduleCourse {
  return {
    key: courseKey(course),
    title: course.title,
    credits: course.credits,
    itemType: 'course',
    meetings: course.meetings,
    events: course.events,
    delivery: course.delivery,
    eligibility: { title: course.title, eligibilityRules: course.notes.eligibilityRules },
    ...(course.correctionId ? { correctionId: course.correctionId } : {}),
    source: 'official',
  };
}

export interface ManualCourseInput {
  title?: string;
  itemType?: 'course' | 'club' | 'activity';
  credits?: string | number;
  mode?: 'physical' | 'async';
  day?: string | number;
  start?: string;
  end?: string;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateManualCourse(input: ManualCourseInput): { field: string; message: string } | null {
  if (!input.title?.trim()) return { field: 'title', message: '請輸入名稱。' };
  if ((input.itemType ?? 'course') === 'course') {
    const credits = Number(input.credits);
    const hasValidCredits = String(input.credits ?? '').trim()
      && Number.isFinite(credits)
      && credits >= 0
      && credits <= 12
      && Number.isInteger(credits * 2);
    if (!hasValidCredits) return { field: 'credits', message: '課程學分必須是 0 到 12 之間，並以 0.5 學分為單位。' };
  }
  if (input.mode !== 'async') {
    for (const field of ['start', 'end'] as const) {
      if (!CLOCK.test(input[field] ?? '')) return { field, message: '請輸入 HH:MM 格式的時間。' };
    }
    if (toMinutes(input.end ?? '') <= toMinutes(input.start ?? '')) {
      return { field: 'end', message: '結束時間必須晚於開始時間。' };
    }
  }
  return null;
}

/** 呼叫前應先通過 validateManualCourse。 */
export function createManualCourse(input: ManualCourseInput, sequence: number): ScheduleCourse {
  const itemType = input.itemType ?? 'course';
  const isAsync = input.mode === 'async';
  const day = Number(input.day);
  const start = toMinutes(input.start ?? '00:00');
  const end = toMinutes(input.end ?? '00:00');
  const label = itemType === 'course'
    ? formatNccuSchedule({ day, start, end }, DAY_LABELS)
    : `${DAY_LABELS[day] ?? ''} ${input.start}–${input.end}`;
  return {
    key: `manual-${sequence}`,
    title: (input.title ?? '').trim(),
    itemType,
    credits: itemType === 'course' ? Number(input.credits) : 0,
    source: 'manual',
    meetings: isAsync ? [] : [{ day, start, end, label }],
    events: [],
    delivery: isAsync
      ? { mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' }
      : { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
    eligibility: {},
    note: itemType === 'course' ? '手動新增，尚未查證官方資料' : '自訂每週行程',
  };
}

export function restoreOfficialCatalog(candidates: readonly ScheduleCourse[]): ScheduleCourse[] {
  return candidates.filter((candidate) => candidate.source !== 'manual');
}

/** 從候選清單刪除會一併移出課表，即使已鎖定（刪除是學生明確的動作）。 */
export function deleteCandidate(
  state: { candidates: readonly ScheduleCourse[]; items: readonly PlanItem[] },
  key: string,
): { candidates: ScheduleCourse[]; items: PlanItem[]; deleted: ScheduleCourse | null } {
  const deleted = state.candidates.find((candidate) => candidate.key === key) ?? null;
  if (!deleted) return { candidates: [...state.candidates], items: [...state.items], deleted: null };
  return {
    candidates: state.candidates.filter((candidate) => candidate.key !== key),
    items: state.items.filter((candidate) => candidate.key !== key),
    deleted,
  };
}

export function buildCandidateCatalog(
  official: readonly ScheduleCourse[],
  manual: readonly ScheduleCourse[] = [],
  deletedKeys: readonly string[] = [],
): ScheduleCourse[] {
  const deleted = new Set(deletedKeys);
  return [...official.filter((candidate) => !deleted.has(candidate.key)), ...manual];
}
