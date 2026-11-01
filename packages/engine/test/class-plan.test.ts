import { describe, expect, test } from 'vitest';
import { searchCourses } from '../src/catalog.ts';
import { rowToCourse, type Course } from '../src/official/course.ts';
import {
  chooseSections,
  classOptions,
  classRequiredCourses,
  formatClassName,
  freeStretch,
  parseClassName,
  suggestSectionSwap,
} from '../src/schedule/classPlan.ts';
import { toScheduleCourse } from '../src/schedule/catalog.ts';
import { addCourse, findConflicts, type ScheduleCourse, type ScheduleEntry } from '../src/schedule/selection.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

const make = (overrides: Record<string, unknown>): Course => {
  const { course } = rowToCourse(officialRow(overrides), TERM);
  if (!course) throw new Error('row rejected');
  return course;
};
const entry = (course: Course | ScheduleCourse): ScheduleEntry => {
  const scheduled = 'official' in course && 'term' in course ? toScheduleCourse(course as Course) : course as ScheduleCourse;
  return { course: scheduled, item: addCourse([], scheduled)[0]! };
};
const keyOf = (course: Course) => toScheduleCourse(course).key;

// 形狀照 115-1 快照：資訊二四門必修各一班（其中一門時間未定）、資管二三科各兩班、會計二分甲乙班、經濟系必修只寫系。
const catalog = [
  make({ subNum: '703007001', subNam: '離散數學', subGde: '資訊二', subTime: '二234' }),
  make({ subNum: '703008001', subNam: '資料結構', subGde: '資訊二', subTime: '四234' }),
  make({ subNum: '703017001', subNam: '機率論', subGde: '資訊二', subTime: '三D56' }),
  make({ subNum: '703056001', subNam: '程式能力檢定', subGde: '資訊二', subTime: '未定或彈性' }),
  make({ subNum: '703813001', subNam: '人工智慧導論', subGde: '資訊二', subTime: '一D56', subKind: '選修' }),
  make({ subNum: '306009001', subNam: '系統分析與設計', subGde: '資管二甲資管二乙', subTime: '二D56' }),
  make({ subNum: '306009011', subNam: '系統分析與設計', subGde: '資管二甲資管二乙', subTime: '五D56' }),
  make({ subNum: '306013001', subNam: '資料結構', subGde: '資管二甲資管二乙', subTime: '四234' }),
  make({ subNum: '306013011', subNam: '資料結構', subGde: '資管二甲資管二乙', subTime: '四D56' }),
  make({ subNum: '306047001', subNam: '資訊管理', subGde: '資管二甲資管二乙', subTime: '二234' }),
  make({ subNum: '306047011', subNam: '資訊管理', subGde: '資管二甲資管二乙', subTime: '三234' }),
  make({ subNum: '303013001', subNam: '稅務法規', subGde: '會計二甲', subTime: '三D56' }),
  make({ subNum: '303013011', subNam: '稅務法規', subGde: '會計二乙', subTime: '四D56' }),
  make({ subNum: '000356001', subNam: '個體經濟學', subGde: '經濟系', subTime: '一234' }),
  make({ subNum: '000357001', subNam: '總體經濟學', subGde: '經濟系', subTime: '三234' }),
  make({ subNum: '000358001', subNam: '經濟數學（一）', subGde: '經濟二', subTime: '五234' }),
  make({ subNum: '258901001', subNam: '計量經濟學', subGde: '經濟碩一', subTime: '二D56', gdeType: '碩士班' }),
];

describe('parseClassName / formatClassName', () => {
  test('reads the short official form with an optional class letter', () => {
    expect(parseClassName('資訊二')).toEqual({ department: '資訊', grade: '二', section: '' });
    expect(parseClassName('會計二甲')).toEqual({ department: '會計', grade: '二', section: '甲' });
    expect(formatClassName({ department: '會計', grade: '二', section: '甲' })).toBe('會計二甲');
  });

  test('accepts the long form students type', () => {
    expect(parseClassName('資訊系 二年級')).toEqual({ department: '資訊', grade: '二', section: '' });
    expect(parseClassName('會計系二年級甲班')).toEqual({ department: '會計', grade: '二', section: '甲' });
  });

  test('rejects graduate classes and text without a year', () => {
    expect(parseClassName('經濟碩一')).toBeNull();
    expect(parseClassName('經濟系')).toBeNull();
    expect(parseClassName('')).toBeNull();
  });
});

describe('classOptions', () => {
  test('lists undergraduate classes from the official 開課班級, with class letters when the data splits them', () => {
    const values = classOptions(catalog).map(({ value }) => value);
    expect(values).toEqual(expect.arrayContaining(['資訊二', '資管二', '資管二甲', '資管二乙', '會計二', '會計二甲', '會計二乙', '經濟二']));
    expect(values).not.toContain('經濟碩一');
    expect(new Set(values).size).toBe(values.length);
  });

  test('labels use the department name and the year in words', () => {
    const option = classOptions(catalog).find(({ value }) => value === '會計二甲');
    expect(option?.label).toBe('會計 二年級甲班');
  });
});

describe('classRequiredCourses', () => {
  test('資訊二: the four official 必修 of that class, not its electives', () => {
    const { required, maybe } = classRequiredCourses(catalog, parseClassName('資訊二')!);
    expect(required.map(({ title }) => title)).toEqual(['離散數學', '資料結構', '機率論', '程式能力檢定']);
    expect(required.every(({ courses }) => courses.length === 1)).toBe(true);
    expect(maybe).toEqual([]);
  });

  test('資管二: three subjects, each with both sections grouped together', () => {
    const { required } = classRequiredCourses(catalog, parseClassName('資管二')!);
    expect(required.map(({ title, courses }) => [title, courses.map(({ code }) => code)])).toEqual([
      ['系統分析與設計', ['306009001', '306009011']],
      ['資料結構', ['306013001', '306013011']],
      ['資訊管理', ['306047001', '306047011']],
    ]);
  });

  test('會計二甲 only gets the 甲 section; 會計二 (no letter) gets both', () => {
    expect(classRequiredCourses(catalog, parseClassName('會計二甲')!).required[0]!.courses.map(({ code }) => code)).toEqual(['303013001']);
    expect(classRequiredCourses(catalog, parseClassName('會計二')!).required[0]!.courses.map(({ code }) => code)).toEqual(['303013001', '303013011']);
  });

  test('經濟二: courses whose 開課班級 names only the department go to "maybe", never "required"', () => {
    const { required, maybe } = classRequiredCourses(catalog, parseClassName('經濟二')!);
    expect(required.map(({ title }) => title)).toEqual(['經濟數學（一）']);
    expect(maybe.map(({ title }) => title)).toEqual(['個體經濟學', '總體經濟學']);
  });
});

describe('chooseSections', () => {
  const groupsFor = (className: string) => classRequiredCourses(catalog, parseClassName(className)!).required
    .map(({ id, courses }) => ({ id, options: courses.map(toScheduleCourse) }));

  test('picks one section per subject with no clash among them or with the timetable', () => {
    // 已排一門週二 234 的課：資訊管理只能選週三那班，系統分析選哪班都可以。
    const fixed = [entry(make({ subNum: '900001001', subNam: '已排的課', subGde: '合成系', subTime: '二234' }))];
    const result = chooseSections(groupsFor('資管二'), fixed, {});
    expect(result.unplaced).toEqual([]);
    expect(result.truncated).toBe(false);
    const picked = result.picks.map(({ key }) => key.split(':')[1]);
    expect(picked).toContain('306047011');
    const entries = [...fixed, ...result.picks.map(({ key }) => entry(catalog.find((course) => keyOf(course) === key)!))];
    expect(findConflicts(entries)).toEqual([]);
  });

  test('avoids free days and early periods when another section fits', () => {
    const groups = [{
      id: 'stats',
      options: [
        toScheduleCourse(make({ subNum: '900201001', subNam: '統計學', subTime: '五234' })),
        toScheduleCourse(make({ subNum: '900201011', subNam: '統計學', subTime: '一12' })),
        toScheduleCourse(make({ subNum: '900201021', subNam: '統計學', subTime: '三D56' })),
      ],
    }];
    expect(chooseSections(groups, [], { freeDays: [5], noEarly: true }).picks[0]!.key).toBe('1151:900201021');
    // 沒有偏好時照第一個可行的班（依星期與時間排序，結果固定）。
    expect(chooseSections(groups, [], {}).picks[0]!.key).toBe('1151:900201011');
  });

  test('is deterministic', () => {
    const first = chooseSections(groupsFor('資管二'), [], { noEarly: true });
    const second = chooseSections(groupsFor('資管二'), [], { noEarly: true });
    expect(second).toEqual(first);
  });

  test('reports a subject it cannot place and which courses block it, instead of adding a clash', () => {
    const fixed = [entry(make({ subNum: '900001001', subNam: '已鎖的課', subGde: '合成系', subTime: '三D56' }))];
    const result = chooseSections(groupsFor('資訊二'), fixed, {});
    expect(result.picks.map(({ key }) => key.split(':')[1])).toEqual(['703007001', '703008001', '703056001']);
    expect(result.unplaced).toEqual([{ groupId: expect.stringContaining('703017'), clashesWith: ['1151:900001001'] }]);
  });

  test('when two required subjects only clash with each other, places one and reports the other', () => {
    const groups = [
      { id: 'a', options: [toScheduleCourse(make({ subNum: '900301001', subNam: '甲課', subTime: '二234' }))] },
      { id: 'b', options: [toScheduleCourse(make({ subNum: '900302001', subNam: '乙課', subTime: '二34' }))] },
    ];
    const result = chooseSections(groups, [], {});
    expect(result.picks).toEqual([{ groupId: 'a', key: '1151:900301001' }]);
    expect(result.unplaced).toEqual([{ groupId: 'b', clashesWith: ['1151:900301001'] }]);
  });

  test('is bounded: a huge search stops at the limit, says so, and still returns a clash-free choice', () => {
    const days = ['一', '二', '三', '四', '五'];
    const groups = Array.from({ length: 12 }, (_, index) => ({
      id: `g${index}`,
      // 每科 4 班，大多數組合都會衝堂，逼搜尋走很多步。
      options: days.slice(0, 4).map((day, section) => toScheduleCourse(make({
        subNum: `9${String(index).padStart(2, '0')}40${section}001`.slice(0, 9),
        subNam: `科目${index}`,
        subTime: `${days[(index + section) % 5]}${['1', '2', '3', '4', 'D', '5', '6', '7'][index % 8]}`,
      }))),
    }));
    const result = chooseSections(groups, [], { freeDays: [1, 2, 3], noEarly: true }, { limit: 200 });
    expect(result.explored).toBeLessThanOrEqual(200);
    expect(result.truncated).toBe(true);
    const chosen = result.picks.map(({ groupId, key }) => groups.find(({ id }) => id === groupId)!.options.find((option) => option.key === key)!);
    expect(findConflicts(chosen.map(entry))).toEqual([]);
    expect(result.picks.length + result.unplaced.length).toBe(12);
  });

  test('the default limit is a few thousand combinations', () => {
    const groups = Array.from({ length: 10 }, (_, index) => ({
      id: `g${index}`,
      options: ['一', '二', '三', '四'].map((day, section) => toScheduleCourse(make({ subNum: `91${index}50${section}001`.slice(0, 9), subNam: `科${index}`, subTime: `${day}${index % 2 ? '34' : '23'}` }))),
    }));
    const result = chooseSections(groups, [], { freeDays: [1] });
    expect(result.explored).toBeLessThanOrEqual(5000);
  });
});

describe('freeStretch', () => {
  const fixed = [
    entry(make({ subNum: '900001001', subNam: '早上的課', subTime: '一234' })),
    entry(make({ subNum: '900002001', subNam: '下午的課', subTime: '一67' })),
  ];

  test('extends the clicked free period to the whole run of free periods that day', () => {
    expect(freeStretch(fixed, 1, 'D')).toEqual({ day: 1, period: 'D', start: 730, end: 900, codes: ['C', 'D', '5'] });
  });

  test('an empty day is free from the first to the last period', () => {
    const stretch = freeStretch([], 3, '5');
    expect(stretch?.codes[0]).toBe('A');
    expect(stretch?.codes.at(-1)).toBe('H');
  });

  test('a period that already has a course is not free', () => {
    expect(freeStretch(fixed, 1, '3')).toBeNull();
  });
});

describe('searchCourses within a free stretch and outside free days', () => {
  const courses = [
    make({ subNum: '900401001', subNam: '剛好塞得下', subTime: '一C' }),
    make({ subNam: '跨出空堂', subNum: '900402001', subTime: '一D56' }),
    make({ subNam: '別天', subNum: '900403001', subTime: '二C' }),
    make({ subNam: '兩天上課', subNum: '900404001', subTime: '一D五34' }),
  ];
  const codes = (found: Course[]) => found.map(({ code }) => code);

  test('within keeps courses whose meeting that day touches the clicked period and stays inside the stretch', () => {
    const within = { day: 1, start: 730, end: 840, period: 'D' };
    expect(codes(searchCourses(courses, { within }))).toEqual(['900404001']);
    expect(codes(searchCourses(courses, { within: { ...within, period: 'C' } }))).toEqual(['900401001']);
  });

  test('excludeDays drops courses that meet on any of those days', () => {
    expect(codes(searchCourses(courses, { text: '', excludeDays: [5] }))).toEqual(['900401001', '900402001', '900403001']);
  });
});

describe('suggestSectionSwap', () => {
  const taiwan = make({ subNum: '042112001', subNam: '臺灣政治', subTime: '三78E' });
  const civilA = make({ subNum: '000603001', subNam: '民法概要', subTime: '三78' });
  const civilB = make({ subNum: '000603011', subNam: '民法概要', subTime: '一D56' });
  const civilC = make({ subNum: '000603021', subNam: '民法概要', subTime: '三E' });
  const all = [taiwan, civilA, civilB, civilC].map(toScheduleCourse);

  test('offers the first course in the given order that has a clash-free section', () => {
    const entries = [entry(taiwan), entry(civilA)];
    const swap = suggestSectionSwap(entries, [keyOf(civilA), keyOf(taiwan)], all);
    expect(swap).toEqual({ key: keyOf(civilA), sections: [expect.objectContaining({ key: keyOf(civilB) })] });
  });

  test('skips locked courses and returns null when nothing can move', () => {
    const locked = entry(civilA);
    locked.item.locked = true;
    expect(suggestSectionSwap([entry(taiwan), locked], [keyOf(civilA), keyOf(taiwan)], all)).toBeNull();
  });
});
