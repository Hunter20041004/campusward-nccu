import { describe, expect, test } from 'vitest';
import { rowToCourse } from '../src/official/course.ts';
import { periodsForRange } from '../src/periods.ts';
import { parseEnrollmentRules } from '../src/rules.ts';
import {
  buildFillPlans,
  isClassAutoEnrolled,
  lostCourseReplacements,
  pickGapCourse,
  swapFillCourse,
  type FillContext,
} from '../src/schedule/autofill.ts';
import { parseClassName } from '../src/schedule/classPlan.ts';
import { toScheduleCourse } from '../src/schedule/catalog.ts';
import { addCourse, findConflicts, type ScheduleCourse, type ScheduleEntry } from '../src/schedule/selection.ts';
import rulesJson from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

const RULES = parseEnrollmentRules(rulesJson);
const make = (overrides: Record<string, unknown>): ScheduleCourse => {
  const { course } = rowToCourse(officialRow(overrides), TERM);
  if (!course) throw new Error('row rejected');
  return toScheduleCourse(course);
};
const entry = (course: ScheduleCourse, status: 'planned' | 'registered' = 'planned'): ScheduleEntry => ({
  course,
  item: { ...addCourse([], course)[0]!, status, locked: status !== 'planned' },
});

// 全部虛構：資訊二三門必修、兩門系上選修、幾門通識（含中文、外文、早八、週五、碩士班），一門候選日文兩班。
const required = [
  make({ subNum: '703007001', subNam: '離散數學', subGde: '資訊二', subTime: '二234', tranTpe: '必修灌檔' }),
  make({ subNum: '703008001', subNam: '資料結構', subGde: '資訊二', subTime: '四234', tranTpe: '必修灌檔' }),
  make({ subNum: '703017001', subNam: '機率論', subGde: '資訊二', subTime: '三D56', tranTpe: '必修灌檔' }),
];
const department = [
  make({ subNum: '703813001', subNam: '人工智慧導論', subGde: '資訊二', subTime: '一D56', subKind: '選修' }),
  make({ subNum: '703060001', subNam: '資訊安全', subGde: '資訊二資訊三', subTime: '五234', subKind: '群修' }),
  make({ subNum: '703901001', subNam: '機器學習概論', subGde: '資訊三資訊四', subTime: '一234', subKind: '選修' }),
];
const general = [
  make({ subNum: '041001001', subNam: '哲學與人生', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一234' }),
  make({ subNum: '042001001', subNam: '社會學導論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '二D56' }),
  make({ subNum: '043001001', subNam: '生活中的物理', subGde: '通識', subKind: '', lmtKind: '自然通識', subTime: '三12' }),
  make({ subNum: '044001001', subNam: '資訊與社會', subGde: '通識', subKind: '', lmtKind: '資訊通識', subTime: '五D56' }),
  make({ subNum: '042002001', subNam: '心理學概論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '四D56' }),
  make({ subNum: '041002001', subNam: '藝術欣賞', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '四EF', subPoint: '2.0' }),
  make({ subNum: '031001001', subNam: '國文－現代文學', subGde: '中文系', subKind: '', lmtKind: '中文通識', subTime: '三234' }),
  make({ subNum: '031001011', subNam: '國文－現代文學', subGde: '中文系', subKind: '', lmtKind: '中文通識', subTime: '一EF' }),
  make({ subNum: '031002001', subNam: '國文－古典詩選讀', subGde: '中文系', subKind: '', lmtKind: '中文通識', subTime: '二EF' }),
  make({ subNum: '032001001', subNam: '英文（一）', subGde: '外文中心', subKind: '', lmtKind: '外文通識', subTime: '三EF', subPoint: '2.0' }),
  make({ subNum: '032002001', subNam: '英文（二）', subGde: '外文中心', subKind: '', lmtKind: '外文通識', subTime: '一56', subPoint: '2.0' }),
];
const graduate = make({ subNum: '258901001', subNam: '計量經濟學', subGde: '經濟碩一', subTime: '二EF', gdeType: '碩士班', subKind: '選修' });
const japanese = [
  make({ subNum: '507001001', subNam: '日文（一）', subGde: '日文系', subKind: '選修', subTime: '二234' }),
  make({ subNum: '507001011', subNam: '日文（一）', subGde: '日文系', subKind: '選修', subTime: '五EF' }),
];
const pe = [
  make({ subNum: '002008001', subNam: '體育－羽球初級', subGde: '體育', subPoint: '1.0', subTime: '二12' }),
  make({ subNum: '002008011', subNam: '體育－羽球初級', subGde: '體育', subPoint: '1.0', subTime: '三78' }),
];
const catalog = [...required, ...department, ...general, graduate, ...japanese, ...pe];

const className = parseClassName('資訊二')!;
const context = (overrides: Partial<FillContext> = {}): FillContext => ({
  entries: [],
  catalog,
  profile: { level: 'undergrad', year: 2, className: '資訊二' },
  preferences: { freeDays: [], noEarly: false },
  rules: RULES,
  maximumCredits: 25,
  ...overrides,
});
const EARLY = new Set(['A', 'B', '1']);
const coursesOf = (keys: readonly string[]) => keys.map((code) => catalog.find((course) => course.key === code)!);
const entriesOf = (base: readonly ScheduleEntry[], keys: readonly string[]) => [...base, ...coursesOf(keys).map((course) => entry(course))];
const creditsOf = (keys: readonly string[]) => coursesOf(keys).reduce((sum, course) => sum + course.credits, 0);

describe('buildFillPlans', () => {
  test('puts the class required courses into every plan and fills to the target without clashes', () => {
    const { plans, required: requiredPart } = buildFillPlans(context(), { className, candidateKeys: [], target: 18 });
    expect(requiredPart.unplaced).toEqual([]);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.length).toBeLessThanOrEqual(3);
    plans.forEach((plan) => {
      const keys = plan.picks.map(({ key: pick }) => pick);
      required.forEach((course) => expect(keys).toContain(course.key));
      expect(plan.picks.filter(({ source }) => source === 'required')).toHaveLength(3);
      expect(findConflicts(entriesOf([], keys))).toEqual([]);
      expect(plan.credits).toBe(creditsOf(keys));
      expect(plan.credits).toBeGreaterThanOrEqual(18);
      expect(plan.credits).toBeLessThanOrEqual(25);
      expect(plan.reached).toBe(true);
      expect(keys).not.toContain(graduate.key);
      // 體育不在排滿的範圍（體育交給畢業缺口）。
      pe.forEach((course) => expect(keys).not.toContain(course.key));
    });
  });

  test('gives distinct plans and the same answer every time', () => {
    const first = buildFillPlans(context(), { className, candidateKeys: [], target: 18 });
    const second = buildFillPlans(context(), { className, candidateKeys: [], target: 18 });
    expect(second).toEqual(first);
    const signatures = new Set(first.plans.map((plan) => plan.picks.map(({ key: pick }) => pick).sort().join('|')));
    expect(signatures.size).toBe(first.plans.length);
    expect(new Set(first.plans.map(({ id }) => id)).size).toBe(first.plans.length);
    first.plans.forEach((plan) => expect(plan.label).toMatch(/\S/));
  });

  test('respects free days and no early classes as hard rules', () => {
    const { plans } = buildFillPlans(context({ preferences: { freeDays: [5], noEarly: true } }), { className, candidateKeys: [], target: 21 });
    plans.forEach((plan) => coursesOf(plan.picks.map(({ key: pick }) => pick)).forEach((course) => {
      course.meetings.forEach((meeting) => {
        expect(meeting.day).not.toBe(5);
        expect(periodsForRange(meeting.start, meeting.end).some(({ code }) => EARLY.has(code))).toBe(false);
      });
    }));
  });

  test('takes one section per course title and keeps within the 初選 count caps', () => {
    const { plans } = buildFillPlans(context(), { className, candidateKeys: [], target: 25 });
    plans.forEach((plan) => {
      const picked = coursesOf(plan.picks.map(({ key: pick }) => pick));
      const titles = picked.map(({ title }) => title);
      expect(new Set(titles).size).toBe(titles.length);
      const ge = (name: string) => picked.filter((course) => course.official?.generalEducation === name).length;
      expect(ge('中文通識')).toBeLessThanOrEqual(1);
      expect(ge('外文通識')).toBeLessThanOrEqual(1);
      const generalCount = picked.filter((course) => /^(人文|社會|自然|資訊|跨領域|書院)/.test(course.official?.generalEducation ?? '')).length;
      expect(generalCount).toBeLessThanOrEqual(3);
      expect(plan.credits).toBeLessThanOrEqual(25);
    });
  });

  test('department electives for the class come before general education; other years of the department come last', () => {
    const { plans } = buildFillPlans(context({ catalog: [...required, ...department, general[1]!] }), { className, candidateKeys: [], target: 25 });
    const [plan] = plans;
    expect(plan!.picks.map(({ key: pick }) => pick)).toEqual([...required, department[0]!, department[1]!, general[1]!, department[2]!].map(({ key: pick }) => pick));
    expect(plan!.picks.map(({ source }) => source)).toEqual(['required', 'required', 'required', 'department', 'department', 'general', 'department']);
  });

  test('a candidate counts by title: any section that fits, before electives and general education', () => {
    // 收藏的是週二那班（和離散數學衝堂），應該挑週五晚上那班。
    const { plans } = buildFillPlans(context(), { className, candidateKeys: [japanese[0]!.key], target: 12 });
    plans.forEach((plan) => {
      const candidate = plan.picks.find(({ source }) => source === 'candidate');
      expect(candidate?.key).toBe(japanese[1]!.key);
    });
  });

  test('keeps what is already on the timetable and counts it towards the target and caps', () => {
    const fixed = [entry(required[0]!, 'registered'), entry(general[6]!)];
    const { plans } = buildFillPlans(context({ entries: fixed }), { className, candidateKeys: [], target: 15 });
    plans.forEach((plan) => {
      const keys = plan.picks.map(({ key: pick }) => pick);
      expect(keys).not.toContain(required[0]!.key);
      // 已經有一門中文通識：不再排第二門（也不重複排同名的另一班）。
      expect(coursesOf(keys).filter((course) => course.official?.generalEducation === '中文通識')).toEqual([]);
      expect(plan.credits).toBe(6 + creditsOf(keys));
      expect(findConflicts(entriesOf(fixed, keys))).toEqual([]);
    });
  });

  test('says when the target cannot be reached and never goes over the maximum', () => {
    const { plans } = buildFillPlans(context({ maximumCredits: 14 }), { className, candidateKeys: [], target: 30 });
    plans.forEach((plan) => {
      expect(plan.reached).toBe(false);
      expect(plan.credits).toBeLessThanOrEqual(14);
    });
  });

  test('class required courses also stay within the maximum: the ones that do not fit are reported, not added', () => {
    // 課表上已有 22 學分（都不和必修衝堂），上限 25：只排得下一門 3 學分的必修。
    const fixed = [
      make({ subNum: '901001001', subNam: '專題研究（一）', subGde: '資訊三', subKind: '選修', subPoint: '9.0', subTime: '一EF' }),
      make({ subNum: '901002001', subNam: '專題研究（二）', subGde: '資訊三', subKind: '選修', subPoint: '9.0', subTime: '五EF' }),
      make({ subNum: '901003001', subNam: '專題研究（三）', subGde: '資訊三', subKind: '選修', subPoint: '4.0', subTime: '一12' }),
    ].map((course) => entry(course));
    const { plans, required: requiredPart } = buildFillPlans(context({ entries: fixed }), { className, candidateKeys: [], target: 25 });
    expect(requiredPart.picks.map(({ key: pick }) => pick)).toEqual([required[0]!.key]);
    expect(requiredPart.unplaced).toEqual([
      { groupId: expect.stringContaining('703008'), reason: 'max', clashesWith: [] },
      { groupId: expect.stringContaining('703017'), reason: 'max', clashesWith: [] },
    ]);
    expect(plans.length).toBeGreaterThan(0);
    plans.forEach((plan) => {
      expect(plan.credits).toBeLessThanOrEqual(25);
      expect(plan.credits).toBe(25);
      expect(plan.reached).toBe(true);
    });
  });

  test('a class required course whose title is already on the timetable (another department) is reported, not added twice', () => {
    const other = make({ subNum: '701007001', subNam: '離散數學', subGde: '應數二', subTime: '五234' });
    const { plans, required: requiredPart } = buildFillPlans(context({ entries: [entry(other)], catalog: [...catalog, other] }), { className, candidateKeys: [], target: 18 });
    expect(requiredPart.picks.map(({ key: pick }) => pick)).not.toContain(required[0]!.key);
    expect(requiredPart.unplaced).toEqual([{ groupId: expect.stringContaining('703007'), reason: 'same', clashesWith: [other.key] }]);
    plans.forEach((plan) => {
      const titles = [other, ...coursesOf(plan.picks.map(({ key: pick }) => pick))].map(({ title }) => title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  });

  test('a class required course that clashes in every section says so', () => {
    const blocker = make({ subNum: '902001001', subNam: '專題討論', subGde: '資訊三', subKind: '選修', subTime: '二234' });
    const { required: requiredPart } = buildFillPlans(context({ entries: [entry(blocker)], catalog: [...catalog, blocker] }), { className, candidateKeys: [], target: 18 });
    expect(requiredPart.unplaced).toEqual([{ groupId: expect.stringContaining('703007'), reason: 'clash', clashesWith: [blocker.key] }]);
  });

  test('works without a class: general education and candidates only', () => {
    const { plans, required: requiredPart } = buildFillPlans(context({ profile: { level: 'undergrad', year: 2 } }), { candidateKeys: [], target: 9 });
    expect(requiredPart.picks).toEqual([]);
    plans.forEach((plan) => {
      expect(plan.picks.every(({ source }) => source === 'general')).toBe(true);
      expect(plan.credits).toBeGreaterThanOrEqual(9);
    });
  });

  test('skips courses the student already passed', () => {
    const passed = (course: ScheduleCourse) => course.title === '哲學與人生';
    const { plans } = buildFillPlans(context({ passed }), { className, candidateKeys: [], target: 25 });
    plans.forEach((plan) => expect(plan.picks.map(({ key: pick }) => pick)).not.toContain(general[0]!.key));
  });
});

describe('swapFillCourse', () => {
  test('replaces one course with another that fits and leaves the rest alone', () => {
    const request = { className, candidateKeys: [], target: 15 };
    const [plan] = buildFillPlans(context(), request).plans;
    const target = plan!.picks.find(({ source }) => source !== 'required')!;
    const swapped = swapFillCourse(context(), request, plan!, target.key, [target.key]);
    expect(swapped).not.toBeNull();
    const before = plan!.picks.map(({ key: pick }) => pick).filter((pick) => pick !== target.key);
    const after = swapped!.picks.map(({ key: pick }) => pick);
    expect(after).not.toContain(target.key);
    before.forEach((pick) => expect(after).toContain(pick));
    expect(after).toHaveLength(before.length + 1);
    expect(findConflicts(entriesOf([], after))).toEqual([]);
  });

  test('prefers a replacement that keeps the plan at the target', () => {
    const sociology = make({ subNum: '042001001', subNam: '社會學導論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '二D56' });
    const art = make({ subNum: '041002001', subNam: '藝術欣賞', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '三EF', subPoint: '2.0' });
    const psychology = make({ subNum: '042002001', subNam: '心理學概論', subGde: '通識', subKind: '', lmtKind: '社會通識', subTime: '五D56' });
    const small = context({ catalog: [...required, sociology, art, psychology] });
    const request = { className, candidateKeys: [], target: 12 };
    const [plan] = buildFillPlans(small, request).plans;
    expect(plan!.picks.at(-1)?.key).toBe(sociology.key);
    const swapped = swapFillCourse(small, request, plan!, sociology.key, [sociology.key]);
    expect(swapped?.picks.at(-1)?.key).toBe(psychology.key);
    expect(swapped?.reached).toBe(true);
  });

  test('does not swap a class required course and returns null when nothing else fits', () => {
    const request = { className, candidateKeys: [], target: 9 };
    const [plan] = buildFillPlans(context({ catalog: required }), request).plans;
    expect(swapFillCourse(context({ catalog: required }), request, plan!, required[0]!.key, [])).toBeNull();
  });
});

describe('pickGapCourse', () => {
  test('a missing required course: a fitting section of the same title', () => {
    const fixed = [entry(japanese[1]!)];
    const picked = pickGapCourse(context({ entries: fixed }), { type: 'title', title: '離散數學' });
    expect(picked).toEqual({ status: 'picked', key: required[0]!.key, source: 'title' });
    const japaneseGap = pickGapCourse(context({ entries: [entry(required[0]!)] }), { type: 'title', title: '日文（一）' });
    expect(japaneseGap).toEqual({ status: 'picked', key: japanese[1]!.key, source: 'title' });
  });

  test('a general education gap: a course in one of the categories', () => {
    const picked = pickGapCourse(context(), { type: 'category', categories: ['社會通識'] });
    expect(picked.status).toBe('picked');
    expect(picked.status === 'picked' && catalog.find((course) => course.key === picked.key)?.official?.generalEducation).toBe('社會通識');
  });

  test('a PE gap picks a PE class and avoids early classes when asked', () => {
    const picked = pickGapCourse(context({ preferences: { freeDays: [], noEarly: true } }), { type: 'pe' });
    expect(picked).toEqual({ status: 'picked', key: pe[1]!.key, source: 'pe' });
  });

  test('a PE gap never picks a class for one gender (the tool does not know it), but lists it as close', () => {
    const women = make({ subNum: '002012011', subNam: '體育[女]—排球初級', subGde: '體育', subPoint: '1.0', subTime: '一56' });
    const mixed = make({ subNum: '002008021', subNam: '體育[男女合班]—健康體適能', subGde: '體育', subPoint: '1.0', subTime: '五78' });
    expect(pickGapCourse(context({ catalog: [women, mixed] }), { type: 'pe' })).toEqual({ status: 'picked', key: mixed.key, source: 'pe' });
    const none = pickGapCourse(context({ catalog: [women] }), { type: 'pe' });
    expect(none).toEqual({ status: 'none', reason: '每一門都分男女班', closest: [{ key: women.key, problems: ['分男女班'] }] });
  });

  test('a group elective gap uses 群修 of the department', () => {
    const picked = pickGapCourse(context(), { type: 'group', department: '資訊' });
    expect(picked).toEqual({ status: 'picked', key: department[1]!.key, source: 'group' });
  });

  test('explains why nothing fits and lists the closest choices', () => {
    const fixed = [entry(required[0]!)];
    const none = pickGapCourse(context({ entries: fixed, preferences: { freeDays: [5], noEarly: false } }), { type: 'title', title: '日文（一）' });
    expect(none.status).toBe('none');
    if (none.status !== 'none') return;
    expect(none.reason).toMatch(/衝堂|空堂/);
    expect(none.closest.map(({ key: closest }) => closest)).toEqual(expect.arrayContaining([japanese[0]!.key, japanese[1]!.key]));
    expect(pickGapCourse(context(), { type: 'title', title: '不存在的課' })).toEqual({ status: 'none', reason: '本學期沒有開這門課', closest: [] });
  });

  test('a course already on the timetable covers the gap', () => {
    const fixed = [entry(general[1]!)];
    expect(pickGapCourse(context({ entries: fixed }), { type: 'category', categories: ['社會通識'] })).toEqual({ status: 'covered', key: general[1]!.key });
  });
});

describe('isClassAutoEnrolled', () => {
  test('必修灌檔 for the student own class only', () => {
    expect(isClassAutoEnrolled(required[0]!, className)).toBe(true);
    expect(isClassAutoEnrolled(required[0]!, parseClassName('資訊三')!)).toBe(false);
    expect(isClassAutoEnrolled(department[0]!, className)).toBe(false);
    const sectioned = make({ subNum: '303013001', subNam: '稅務法規', subGde: '會計二甲', tranTpe: '必修灌檔' });
    expect(isClassAutoEnrolled(sectioned, parseClassName('會計二甲')!)).toBe(true);
    expect(isClassAutoEnrolled(sectioned, parseClassName('會計二乙')!)).toBe(false);
    expect(isClassAutoEnrolled(sectioned, parseClassName('會計二')!)).toBe(true);
  });
});

// 2026-11-01 易用性審查第 10 名：初選沒選上的課，直接給替補（同課名別班、同一段時間排得進去的課），規則同幫我排滿。
describe('lostCourseReplacements', () => {
  const lost = general[0]!; // 哲學與人生 一234 人文通識
  const otherSection = make({ subNum: '041001011', subNam: '哲學與人生', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '三34' });
  const fridaySection = make({ subNum: '041001021', subNam: '哲學與人生', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '五34' });
  const sameCategory = make({ subNum: '041003001', subNam: '倫理學', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一34' });
  const notTouching = make({ subNum: '041004001', subNam: '美學', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一78' });
  const pool = [...catalog, otherSection, fridaySection, sameCategory, notTouching];
  // 選上的是離散數學（二234）與資料結構（四234）；沒選上的哲學與人生已經移出課表。
  const kept = [entry(required[0]!, 'registered'), entry(required[1]!, 'registered')];

  test('offers other sections of the same course that fit, and courses in the freed time slot', () => {
    const result = lostCourseReplacements(context({ catalog: pool, entries: kept }), lost);
    expect(result.sections.map(({ key }) => key)).toEqual([otherSection.key, fridaySection.key]);
    const sameSlot = result.sameSlot.map(({ title }) => title);
    // 同一類通識排前面；不碰到原本那段時間（一 78）的不算；同名的別班不重複列在這裡。
    expect(sameSlot[0]).toBe('倫理學');
    expect(sameSlot).not.toContain('美學');
    expect(sameSlot).not.toContain('哲學與人生');
    expect(sameSlot.length).toBeLessThanOrEqual(3);
    // 沒選上的是通識：同時段的替補也只列通識（和空堂找課預設「通識」一致），不塞別系的選修。
    expect(sameSlot).not.toContain('機器學習概論');
    expect(result.sameSlot.every((course) => course.official?.generalEducation)).toBe(true);
  });

  test('for a department course, same-slot replacements are courses of the same department or general education', () => {
    const lostElective = department[2]!; // 機器學習概論 一234（資訊系）
    const sameDepartment = make({ subNum: '703902001', subNam: '雲端運算', subGde: '資訊三', subTime: '一34', subKind: '選修' });
    const otherDepartment = make({ subNum: '507002001', subNam: '日文會話', subGde: '日文系', subKind: '選修', subTime: '一34' });
    const result = lostCourseReplacements(context({ catalog: [...pool, sameDepartment, otherDepartment], entries: kept }), lostElective);
    const titles = result.sameSlot.map(({ title }) => title);
    expect(titles[0]).toBe('雲端運算');
    expect(titles).not.toContain('日文會話');
  });

  test('follows the same rules as filling the timetable: free days, clashes, early classes', () => {
    const result = lostCourseReplacements(context({ catalog: pool, entries: kept, preferences: { freeDays: [5], noEarly: true } }), lost);
    expect(result.sections.map(({ key }) => key)).toEqual([otherSection.key]);
    const clashing = [...kept, entry(general[6]!)]; // 國文 三234 和三34 那班衝堂
    expect(lostCourseReplacements(context({ catalog: pool, entries: clashing }), lost).sections.map(({ key }) => key)).toEqual([fridaySection.key]);
    for (const course of lostCourseReplacements(context({ catalog: pool, entries: kept, preferences: { freeDays: [], noEarly: true } }), lost).sameSlot) {
      expect(course.meetings.flatMap(({ start, end }) => periodsForRange(start, end)).some(({ code }) => EARLY.has(code))).toBe(false);
    }
  });

  test('is deterministic and respects the limit', () => {
    const first = lostCourseReplacements(context({ catalog: pool, entries: kept }), lost, 1);
    expect(first.sections).toHaveLength(1);
    expect(first.sameSlot).toHaveLength(1);
    expect(lostCourseReplacements(context({ catalog: pool, entries: kept }), lost, 1)).toEqual(first);
  });
});
