import { describe, expect, test } from 'vitest';
import { countActiveCatalogFilters, filterCandidateCourses, normalizeSearchText, searchCourses } from '../src/catalog.ts';
import { rowToCourse, type Course } from '../src/official/course.ts';
import type { Meeting } from '../src/periods.ts';
import type { ScheduleCourse } from '../src/schedule/selection.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

// 移植自舊專案 tests/catalog-filters.test.mjs（候選清單篩選）。課程改為 ScheduleCourse，
// 'physical' 改稱 'sync'；舊版 course.attendance 改由 attendanceByCourse 提供（學生選擇與課程分開）。
const candidate = (key: string, meetings: Omit<Meeting, 'label'>[] = [], extra: Partial<ScheduleCourse> = {}): ScheduleCourse => ({
  key, title: key, credits: 3, itemType: 'course', events: [], eligibility: {},
  meetings: meetings.map((meeting) => ({ label: '', ...meeting })),
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
  ...extra,
});
const ASYNC_OK = { delivery: { mode: 'asynchronous-optional', asyncAllowed: true, defaultAttendance: 'sync' } } as const;
const keys = (courses: { key: string }[]) => courses.map(({ key }) => key);

describe('filterCandidateCourses', () => {
  test('keeps only courses meeting on one selected weekday', () => {
    const courses = [candidate('tue', [{ day: 2, start: 490, end: 600 }]), candidate('thu', [{ day: 4, start: 610, end: 720 }]), candidate('flexible')];
    expect(keys(filterCandidateCourses(courses, { weekdays: [4] }))).toEqual(['thu']);
  });

  test('treats multiple selected weekdays as alternatives', () => {
    const courses = [
      candidate('mon', [{ day: 1, start: 490, end: 600 }]),
      candidate('thu', [{ day: 4, start: 610, end: 720 }]),
      candidate('fri', [{ day: 5, start: 790, end: 900 }]),
    ];
    expect(keys(filterCandidateCourses(courses, { weekdays: [1, 5] }))).toEqual(['mon', 'fri']);
  });

  test('requires weekday and daypart to match the same fixed meeting', () => {
    const courses = [candidate('split', [{ day: 2, start: 490, end: 600 }, { day: 4, start: 790, end: 900 }])];
    expect(filterCandidateCourses(courses, { weekdays: [2], dayparts: ['afternoon'] })).toEqual([]);
    expect(keys(filterCandidateCourses(courses, { weekdays: [4], dayparts: ['afternoon'] }))).toEqual(['split']);
  });

  test('matches flexible courses without treating async capability as the chosen schedule', () => {
    const courses = [
      candidate('async', [{ day: 2, start: 490, end: 600 }], ASYNC_OK),
      candidate('undecided'),
      candidate('capable-only', [{ day: 4, start: 790, end: 900 }], ASYNC_OK),
    ];
    const attendanceByCourse = { async: 'async' } as const;
    expect(keys(filterCandidateCourses(courses, { dayparts: ['flexible'], attendanceByCourse }))).toEqual(['async', 'undecided']);
    expect(filterCandidateCourses(courses, { weekdays: [2], dayparts: ['flexible'], attendanceByCourse })).toEqual([]);
  });

  test('uses the currently selected attendance when filtering flexible courses', () => {
    const courses = [candidate('remote-course', [{ day: 4, start: 790, end: 900 }], ASYNC_OK)];
    expect(keys(filterCandidateCourses(courses, { dayparts: ['flexible'], attendanceByCourse: { 'remote-course': 'async' } }))).toEqual(['remote-course']);
  });

  test('combines status alternatives with weekday requirements', () => {
    const courses = [
      candidate('selected-mon', [{ day: 1, start: 490, end: 600 }]),
      candidate('remote-thu', [{ day: 4, start: 790, end: 900 }], ASYNC_OK),
      candidate('review-thu', [{ day: 4, start: 790, end: 900 }]),
    ];
    expect(keys(filterCandidateCourses(courses, {
      statuses: ['selected', 'remote'],
      weekdays: [4],
      selectedKeys: ['selected-mon'],
      eligibilityStatuses: { 'review-thu': 'review' },
    }))).toEqual(['remote-thu']);
  });

  test('keeps keyword search independent and counts checked filter conditions', () => {
    const courses = [
      candidate('hci', [{ day: 2, start: 490, end: 600 }], { title: '人機互動', teacher: '王合成', code: '900426001' }),
      candidate('finance', [{ day: 4, start: 790, end: 900 }], { title: '金融科技導論', teacher: '林範例', code: '900424001' }),
    ];
    const filters = { query: '王合成', statuses: ['selected', 'remote'], selectedKeys: ['hci'], weekdays: [2, 4], dayparts: ['morning'] } as const;
    expect(keys(filterCandidateCourses(courses, filters))).toEqual(['hci']);
    expect(countActiveCatalogFilters(filters)).toBe(5);
  });
});

// 新增（計畫 1.8）：全校課程快照搜尋
describe('searchCourses', () => {
  const make = (overrides: Record<string, unknown>): Course => {
    const { course } = rowToCourse(officialRow(overrides), TERM);
    if (!course) throw new Error('row rejected');
    return course;
  };
  const courses = [
    make({ subNum: '900001001', subNam: 'Python 程式設計', teaNam: '王合成', subGde: '資科系', subTime: '一234', lmtKind: '' }),
    make({ subNum: '900002001', subNam: '英文（一）', teaNam: '林範例', subGde: '外文中', subTime: '二D56', lmtKind: '外文通識' }),
    make({ subNum: '900003001', subNam: '統計學', teaNam: '陳虛構', subGde: '統計系', subTime: '四78', lmtKind: '' }),
    make({ subNum: '900004001', subNam: '彈性專題', teaNam: '王合成', subGde: '資科系', subTime: '未定或彈性', lmtKind: '' }),
  ];
  const codes = (found: Course[]) => found.map(({ code }) => code);

  test('returns every course for an empty query', () => {
    expect(searchCourses(courses, {})).toHaveLength(4);
  });

  test('matches title text ignoring case, width, and spaces', () => {
    expect(codes(searchCourses(courses, { text: 'ｐｙｔｈｏｎ程式' }))).toEqual(['900001001']);
    expect(codes(searchCourses(courses, { text: '英文(一)' }))).toEqual(['900002001']);
  });

  test('matches teacher name', () => {
    expect(codes(searchCourses(courses, { text: '王合成' }))).toEqual(['900001001', '900004001']);
  });

  test('matches course code prefix', () => {
    expect(codes(searchCourses(courses, { text: '900003' }))).toEqual(['900003001']);
  });

  test('requires every space-separated word to match', () => {
    expect(codes(searchCourses(courses, { text: '王合成 專題' }))).toEqual(['900004001']);
  });

  test('filters by offering group', () => {
    expect(codes(searchCourses(courses, { unit: '統計' }))).toEqual(['900003001']);
  });

  test('filters by general education category', () => {
    expect(codes(searchCourses(courses, { generalEducation: ['外文通識'] }))).toEqual(['900002001']);
  });

  test('filters by weekday', () => {
    expect(codes(searchCourses(courses, { weekdays: [2, 4] }))).toEqual(['900002001', '900003001']);
  });

  test('filters by NCCU period codes on the selected weekdays', () => {
    expect(codes(searchCourses(courses, { periods: ['D'] }))).toEqual(['900002001']);
    expect(codes(searchCourses(courses, { weekdays: [1], periods: ['D'] }))).toEqual([]);
  });

  test('can include courses without a fixed time', () => {
    expect(codes(searchCourses(courses, { weekdays: [3], includeUnscheduled: true }))).toEqual(['900004001']);
  });

  test('normalizes search text', () => {
    expect(normalizeSearchText(' Ａｂ　Ｃ（一） ')).toBe('abc(一)');
  });
});
