import { expect, test } from 'vitest';
import { validateSchedule } from '../src/ai/validate.ts';
import type { CourseEvent } from '../src/official/course.ts';
import type { PlanItem, ScheduleCourse } from '../src/schedule/selection.ts';

// 移植自舊專案 tests/plan-validator.test.mjs。課程與學生選擇分開：
// plan.courseIds/asyncCourseIds → items（attendance）；lockedCourseIds → item.locked；courseIds 改為 courseKeys。
const profile = { level: 'undergrad', year: 3, conditionIds: [], rejectedConditionIds: [] } as const;

function course(key: string, title: string, extra: {
  credits?: number; meeting?: { day: number; start: number; end: number }; asyncAllowed?: boolean; events?: CourseEvent[];
  eligibility?: ScheduleCourse['eligibility'];
} = {}): ScheduleCourse {
  return {
    key, title, credits: extra.credits ?? 3, itemType: 'course', events: extra.events ?? [], eligibility: extra.eligibility ?? {},
    meetings: extra.meeting ? [{ ...extra.meeting, label: '' }] : [],
    delivery: { mode: extra.asyncAllowed ? 'asynchronous-optional' : 'in-person', asyncAllowed: Boolean(extra.asyncAllowed), defaultAttendance: 'sync' },
  };
}
const item = (key: string, extra: Partial<PlanItem> = {}): PlanItem => ({ key, attendance: 'sync', status: 'planned', locked: false, ...extra });
const catalogOf = (...courses: ScheduleCourse[]) => new Map(courses.map((value) => [value.key, value]));
const codes = (result: ReturnType<typeof validateSchedule>) => result.violations.map(({ code }) => code);

test('rejects a route whose physical courses overlap every week', () => {
  const result = validateSchedule({
    items: [item('a'), item('b')],
    catalog: catalogOf(course('a', '課程 A', { meeting: { day: 2, start: 550, end: 720 } }), course('b', '課程 B', { meeting: { day: 2, start: 610, end: 780 } })),
    profile,
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['weekly-conflict']);
  expect(result.courseKeys).toEqual(['a', 'b']);
});

test('rejects a route whose one-time exam overlaps another course', () => {
  const result = validateSchedule({
    items: [item('exam-course', { attendance: 'async' }), item('thursday-course')],
    catalog: catalogOf(
      course('exam-course', '非同步課程', { asyncAllowed: true, events: [{ label: '實體考試', day: 4, start: 790, end: 960 }] }),
      course('thursday-course', '週四課程', { meeting: { day: 4, start: 790, end: 960 } }),
    ),
    profile,
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['event-conflict']);
});

test('rejects a route when a locked course is missing from the candidate set', () => {
  const result = validateSchedule({
    items: [item('available'), item('deleted-locked-course', { locked: true })],
    catalog: catalogOf(course('available', '可用課程')),
    profile,
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['missing-locked-course']);
});

test('rejects a route containing a course the student explicitly cannot take', () => {
  const result = validateSchedule({
    items: [item('restricted')],
    catalog: catalogOf(course('restricted', '限制課程', {
      eligibility: { eligibilityRules: [{ conditionId: 'official:department', enforcement: 'required', rationale: '僅限本系學生修讀。' }] },
    })),
    profile: { ...profile, rejectedConditionIds: ['official:department'] },
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['blocked-course']);
});

test('rejects a route containing a course that is not open this term', () => {
  const result = validateSchedule({
    items: [item('closed')],
    catalog: catalogOf(course('closed', '未開課程', { eligibility: { available: false } })),
    profile,
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['unavailable-course']);
});

test('keeps a reviewable course valid but requires a visible eligibility warning', () => {
  const result = validateSchedule({
    items: [item('review')],
    catalog: catalogOf(course('review', '待確認課程', {
      eligibility: { eligibilityRules: [{ conditionId: 'official:review', enforcement: 'required', rationale: '須向系所確認資格。' }] },
    })),
    profile,
  });
  expect(result.valid).toBe(true);
  expect(result.warnings.map(({ code }) => code)).toEqual(['eligibility-review']);
});

test('rejects asynchronous attendance for a course that does not allow it', () => {
  const result = validateSchedule({
    items: [item('physical-only', { attendance: 'async' })],
    catalog: catalogOf(course('physical-only', '實體課')),
    profile,
  });
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['invalid-async-course']);
});

test('rejects a route below the requested minimum credits', () => {
  const result = validateSchedule({
    items: [item('a'), item('b')],
    catalog: catalogOf(course('a', '課程 A'), course('b', '課程 B')),
    profile,
    minimumCredits: 9,
  });
  expect(result.credits).toBe(6);
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['minimum-credits']);
});

test('rejects a route that cannot preserve the requested internship days', () => {
  const days = [1, 2, 3, 4].map((day) => course(`day-${day}`, `週${day}課程`, { credits: 1, meeting: { day, start: 540, end: 1080 } }));
  const result = validateSchedule({
    items: days.map(({ key }) => item(key)),
    catalog: catalogOf(...days),
    profile,
    internshipSettings: { targetDays: 2, start: '09:00', end: '18:00', mode: 'auto', fixedDays: {} },
    minimumInternshipDays: 2,
  });
  expect(result.internship?.availableDays).toBe(1);
  expect(result.valid).toBe(false);
  expect(codes(result)).toEqual(['minimum-internship-days']);
});

test('reports zero confirmed internship days when a physical course time is unresolved', () => {
  const result = validateSchedule({
    items: [item('flexible')],
    catalog: catalogOf(course('flexible', '另約討論')),
    profile,
    internshipSettings: { targetDays: 2.5, start: '09:00', end: '18:00', mode: 'auto', fixedDays: {} },
    minimumInternshipDays: 2.5,
  });
  expect(result.internship?.availableDays).toBe(5);
  expect(result.internship?.confirmedDays).toBe(0);
  expect(result.violations[0]?.message).toMatch(/只能確認 0 天實習/);
});

test('preserves asynchronous attendance for an already locked selected course', () => {
  const shared = { day: 2, start: 610, end: 720 };
  const result = validateSchedule({
    items: [item('locked-async', { attendance: 'async', locked: true }), item('physical')],
    catalog: catalogOf(course('locked-async', '鎖定非同步課', { asyncAllowed: true, meeting: shared }), course('physical', '實體課', { meeting: shared })),
    profile,
  });
  expect(result.valid).toBe(true);
  expect(result.asyncCourseKeys).toEqual(['locked-async']);
});

// 新增（設計 6.1）：學分上限、空堂日偏好
test('rejects a route above the maximum credits', () => {
  const result = validateSchedule({ items: [item('a'), item('b')], catalog: catalogOf(course('a', 'A'), course('b', 'B')), profile, maximumCredits: 5 });
  expect(codes(result)).toEqual(['maximum-credits']);
});

test('rejects a route that occupies a requested free day', () => {
  const result = validateSchedule({
    items: [item('fri'), item('fri-async', { attendance: 'async' })],
    catalog: catalogOf(course('fri', '週五課', { meeting: { day: 5, start: 490, end: 600 } }), course('fri-async', '週五遠距', { asyncAllowed: true, meeting: { day: 5, start: 610, end: 720 } })),
    profile,
    freeDays: [5],
  });
  expect(codes(result)).toEqual(['free-day-occupied']);
  expect(result.violations[0]?.courseKeys).toEqual(['fri']);
});
