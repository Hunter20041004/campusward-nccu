import { applyAiChangeSet, createPlannerState, rowToCourse, toScheduleCourse, type Course } from '@campusward/engine';
import { describe, expect, test } from 'vitest';
import snapshot from '../../../../data/snapshots/1151/courses.json' with { type: 'json' };
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { pickDemoCourse } from './demo.ts';

const courseOf = (code: string, title: string, subTime: string, lmtKind = ''): Course => {
  const { course } = rowToCourse(officialRow({ subNum: code, subNam: title, subTime, lmtKind }), { year: 115, semester: 1 });
  if (!course) throw new Error('rejected');
  return course;
};
const catalogOf = (courses: readonly Course[]) => new Map(courses.map((course) => [toScheduleCourse(course).key, toScheduleCourse(course)]));
const entriesOf = (keys: string[], catalog: ReturnType<typeof catalogOf>) => keys.map((key) => ({ course: catalog.get(key)!, item: { key, locked: false, status: 'planned' as const, attendance: 'sync' as const } }));

describe('pickDemoCourse', () => {
  test('picks a course by its general-education field, not by the word 通識 in the title', () => {
    const courses = [courseOf('900001001', '通識講座導論', '一234'), courseOf('900002001', '哲學與人生', '三D56', '人文通識')];
    expect(pickDemoCourse(courses, catalogOf(courses), [])).toBe('1151:900002001');
  });

  test('skips general-education courses that would clash or are already scheduled', () => {
    const courses = [
      courseOf('900001001', '統計學', '三D56'),
      courseOf('900002001', '哲學與人生', '三D5', '人文通識'),
      courseOf('900003001', '藝術欣賞', '四34', '人文通識'),
      courseOf('900004001', '生命科學', '五34', '自然通識'),
    ];
    const catalog = catalogOf(courses);
    expect(pickDemoCourse(courses, catalog, entriesOf(['1151:900001001', '1151:900003001'], catalog))).toBe('1151:900004001');
  });

  test('returns nothing when no general-education course fits', () => {
    const courses = [courseOf('900001001', '統計學', '一234')];
    expect(pickDemoCourse(courses, catalogOf(courses), [])).toBeUndefined();
  });

  test('on the real 115-1 snapshot, the demo adds a course to an empty timetable', () => {
    const courses = snapshot as unknown as Course[];
    const catalog = catalogOf(courses);
    const pick = pickDemoCourse(courses, catalog, []);
    expect(pick).toBeDefined();
    expect(catalog.get(pick!)?.official?.generalEducation).toBeTruthy();
    const result = applyAiChangeSet(createPlannerState(), [{ type: 'addToSchedule', key: pick! }], catalog, { profile: {} });
    expect(result.status).toBe('applied');
  });
});
