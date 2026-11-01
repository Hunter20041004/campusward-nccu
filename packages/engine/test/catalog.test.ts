import { describe, expect, test } from 'vitest';
import {
  countActiveCatalogFilters,
  filterCandidateCourses,
  formatTargetGroup,
  normalizeSearchText,
  offeringDepartments,
  parseTargetGroup,
  searchCourses,
} from '../src/catalog.ts';
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

describe('offering groups (開課班級)', () => {
  test('splits the official text into department and grade', () => {
    expect(parseTargetGroup('經濟系')).toEqual([{ department: '經濟', grade: '' }]);
    expect(parseTargetGroup('經濟二甲經濟二乙經濟三甲')).toEqual([
      { department: '經濟', grade: '二' }, { department: '經濟', grade: '二' }, { department: '經濟', grade: '三' },
    ]);
    expect(parseTargetGroup('法律碩一法律博一')).toEqual([{ department: '法律', grade: '碩一' }, { department: '法律', grade: '博一' }]);
    expect(parseTargetGroup('法碩專一')).toEqual([{ department: '法', grade: '碩專一' }]);
    expect(parseTargetGroup('台史所')).toEqual([{ department: '台史', grade: '' }]);
    expect(parseTargetGroup('商院學士')).toEqual([{ department: '商院', grade: '學士' }]);
  });

  test('reads land economics groups (地一土管) as 地政', () => {
    expect(parseTargetGroup('地一土管地一土資')).toEqual([{ department: '地政', grade: '一' }, { department: '地政', grade: '一' }]);
  });

  test('keeps text it cannot split as one unit without a grade', () => {
    expect(parseTargetGroup('教務處通識教育中心')).toEqual([{ department: '教務處通識教育中心', grade: '' }]);
    expect(parseTargetGroup('')).toEqual([]);
  });

  test('formats the group compactly for a result row', () => {
    expect(formatTargetGroup('經濟二甲經濟二乙經濟三甲經濟三乙')).toBe('經濟二、三');
    expect(formatTargetGroup('經濟系')).toBe('經濟系');
    expect(formatTargetGroup('法律碩一法律博一')).toBe('法律碩一、博一');
    expect(formatTargetGroup('教務處通識教育中心')).toBe('教務處通識教育中心');
  });

  test('lists departments with their grades, using the 系／所 name when the data has it', () => {
    const make = (code: string, subGde: string) => rowToCourse(officialRow({ subNum: code, subGde }), TERM).course!;
    const departments = offeringDepartments([
      make('900001001', '經濟系'), make('900002001', '經濟三甲經濟三乙'), make('900003001', '經濟二甲'),
      make('900004001', '經濟碩一'), make('900005001', '應數一'),
    ]);
    expect(departments.find(({ department }) => department === '經濟')).toEqual({ department: '經濟', label: '經濟系', grades: ['二', '三', '碩一'], count: 4 });
    expect(departments.find(({ department }) => department === '應數')).toEqual({ department: '應數', label: '應數', grades: ['一'], count: 1 });
  });
});

describe('searchCourses filters for finding courses', () => {
  const make = (overrides: Record<string, unknown>): Course => {
    const { course } = rowToCourse(officialRow(overrides), TERM);
    if (!course) throw new Error('row rejected');
    return course;
  };
  const courses = [
    make({ subNum: '900101001', subNam: '個體經濟學', subGde: '經濟二甲經濟二乙', subTime: '一12', gdeType: '學士班' }),
    make({ subNum: '900102001', subNam: '經濟學', subGde: '經濟系', subTime: '二34', gdeType: '學士班', emiType: '是' }),
    make({ subNum: '900103001', subNam: '計量經濟', subGde: '經濟碩一', subTime: '三D5', gdeType: '碩士班' }),
    make({ subNum: '900104001', subNam: '線性代數', subGde: '應數一', subTime: '四B12', gdeType: '學士班' }),
    make({ subNum: '900105001', subNam: '人際溝通', subGde: '教務處通識教育中心', subTime: '五78', lmtKind: '社會通識', gdeType: '學士班' }),
    make({ subNum: '900106001', subNam: '地政法規', subGde: '地二土管地二土資', subTime: '五34', gdeType: '學士班' }),
  ];
  const codes = (found: Course[]) => found.map(({ code }) => code);

  test('filters by department, including department-wide courses', () => {
    expect(codes(searchCourses(courses, { department: '經濟' }))).toEqual(['900101001', '900102001', '900103001']);
  });

  test('filters by department and grade; undergraduate grades include department-wide courses', () => {
    expect(codes(searchCourses(courses, { department: '經濟', grade: '二' }))).toEqual(['900101001', '900102001']);
    expect(codes(searchCourses(courses, { department: '經濟', grade: '碩一' }))).toEqual(['900103001']);
  });

  test('keywords can also match the offering group, general education and tags', () => {
    const wide = (text: string) => codes(searchCourses(courses, { text, matchDetails: true }));
    expect(wide('經濟系')).toEqual(['900101001', '900102001', '900103001']);
    expect(wide('應數')).toEqual(['900104001']);
    expect(wide('地政')).toEqual(['900106001']);
    expect(wide('通識')).toEqual(['900105001']);
    expect(wide('社會通識')).toEqual(['900105001']);
    expect(wide('英語授課')).toEqual(['900102001']);
    expect(wide('emi')).toEqual(['900102001']);
    expect(codes(searchCourses(courses, { text: '經濟系' }))).toEqual([]);
  });

  test('filters any general education category', () => {
    expect(codes(searchCourses(courses, { anyGeneralEducation: true }))).toEqual(['900105001']);
  });

  test('filters by degree level', () => {
    expect(codes(searchCourses(courses, { text: '經濟', degree: 'graduate' }))).toEqual(['900103001']);
    expect(codes(searchCourses(courses, { text: '經濟', degree: 'undergrad' }))).toEqual(['900101001', '900102001']);
  });

  test('filters English-taught courses', () => {
    expect(codes(searchCourses(courses, { emi: true }))).toEqual(['900102001']);
  });

  test('can exclude early periods', () => {
    expect(codes(searchCourses(courses, { excludePeriods: ['A', 'B', '1'] }))).toEqual(['900102001', '900103001', '900105001', '900106001']);
  });
});
