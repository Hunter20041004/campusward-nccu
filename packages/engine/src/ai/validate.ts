// 套用前的確定性檢查：衝堂、資格、非同步、學分範圍、實習天數、空堂日。移植自舊 plan-validator。

import { evaluateEligibility, type IdentityProfile } from '../eligibility.ts';
import { calculateInternshipPlan, type InternshipPlan, type InternshipSettings } from '../internship.ts';
import { findConflicts, occupiedMeetings, totalCredits, type PlanItem, type ScheduleCourse, type ScheduleEntry } from '../schedule/selection.ts';

export type ViolationCode =
  | 'missing-locked-course' | 'invalid-async-course' | 'minimum-credits' | 'maximum-credits'
  | 'minimum-internship-days' | 'unavailable-course' | 'blocked-course' | 'weekly-conflict' | 'event-conflict'
  | 'free-day-occupied' | 'locked-course-removed' | 'unknown-course' | 'invalid-preference';

export interface Violation {
  code: ViolationCode | 'eligibility-review';
  message: string;
  courseKeys: string[];
}

export interface ScheduleValidation {
  valid: boolean;
  courseKeys: string[];
  asyncCourseKeys: string[];
  credits: number;
  internship: InternshipPlan | null;
  violations: Violation[];
  warnings: Violation[];
}

export interface ValidateScheduleInput {
  items: readonly PlanItem[];
  catalog: ReadonlyMap<string, ScheduleCourse>;
  profile: IdentityProfile;
  termLabel?: string;
  minimumCredits?: number;
  maximumCredits?: number;
  internshipSettings?: InternshipSettings | null;
  minimumInternshipDays?: number;
  freeDays?: readonly number[];
}

export function validateSchedule(input: ValidateScheduleInput): ScheduleValidation {
  const { items, catalog, profile } = input;
  const entries: ScheduleEntry[] = items.flatMap((item) => {
    const course = catalog.get(item.key);
    return course ? [{ course, item }] : [];
  });
  const violations: Violation[] = items
    .filter((item) => item.locked && !catalog.has(item.key))
    .map((item) => ({ code: 'missing-locked-course', message: `鎖定課程 ${item.key} 已不在候選課程中，無法產生完整方案。`, courseKeys: [item.key] }));
  const courseKeys = entries.map(({ course }) => course.key);
  const asyncCourseKeys = entries.filter(({ item }) => item.attendance === 'async').map(({ course }) => course.key);
  entries.forEach(({ course, item }) => {
    if (item.attendance === 'async' && !course.delivery.asyncAllowed) {
      violations.push({ code: 'invalid-async-course', message: `${course.title} 不支援非同步上課。`, courseKeys: [course.key] });
    }
  });
  const credits = totalCredits(entries);
  if (input.minimumCredits && credits < input.minimumCredits) {
    violations.push({ code: 'minimum-credits', message: `方案只有 ${credits} 學分，未達最低 ${input.minimumCredits} 學分。`, courseKeys });
  }
  if (input.maximumCredits !== undefined && credits > input.maximumCredits) {
    violations.push({ code: 'maximum-credits', message: `方案有 ${credits} 學分，超過上限 ${input.maximumCredits} 學分。`, courseKeys });
  }
  const internship = input.internshipSettings ? calculateInternshipPlan(entries, input.internshipSettings) : null;
  const minimumInternshipDays = input.minimumInternshipDays ?? 0;
  if (minimumInternshipDays > 0 && (!internship || internship.confirmedDays < minimumInternshipDays)) {
    violations.push({
      code: 'minimum-internship-days',
      message: `方案只能確認 ${internship?.confirmedDays ?? 0} 天實習，未達最低 ${minimumInternshipDays} 天。`,
      courseKeys,
    });
  }
  const freeDays = new Set(input.freeDays ?? []);
  if (freeDays.size) {
    const occupying = entries.filter((entry) => occupiedMeetings(entry).some((meeting) => freeDays.has(meeting.day))).map(({ course }) => course.key);
    if (occupying.length) violations.push({ code: 'free-day-occupied', message: '有課排在你想空下來的日子。', courseKeys: occupying });
  }
  const warnings: Violation[] = [];
  entries.forEach(({ course }) => {
    const eligibility = evaluateEligibility(course.eligibility, profile, input.termLabel ? { termLabel: input.termLabel } : {});
    if (eligibility.status === 'review') {
      warnings.push({ code: 'eligibility-review', message: `${course.title}：${eligibility.reasons.join('、')}`, courseKeys: [course.key] });
      return;
    }
    if (eligibility.status === 'blocked' || eligibility.status === 'unavailable') {
      violations.push({
        code: eligibility.status === 'unavailable' ? 'unavailable-course' : 'blocked-course',
        message: `${course.title}：${eligibility.reasons.join('、')}`,
        courseKeys: [course.key],
      });
    }
  });
  violations.push(...findConflicts(entries).map((conflict): Violation => ({
    code: conflict.type === 'event' ? 'event-conflict' : 'weekly-conflict',
    message: conflict.message,
    courseKeys: [...conflict.courseKeys],
  })));
  return { valid: violations.length === 0, courseKeys, asyncCourseKeys, credits, internship, violations, warnings };
}
