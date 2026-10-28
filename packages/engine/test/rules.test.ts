import { describe, expect, test } from 'vitest';
import enrollment11407 from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import type { OfficialFields } from '../src/official/course.ts';
import { checkEnrollmentRules, parseEnrollmentRules, type RuleReminder } from '../src/rules.ts';
import type { PlanItem, ScheduleCourse, ScheduleEntry } from '../src/schedule/selection.ts';

// 新增（計畫 1.9）：選課規則只提醒、不阻擋；每則附選課須知出處。
const rules = parseEnrollmentRules(enrollment11407);

const OFFICIAL: OfficialFields = {
  semesterSpan: '單學期科目', degreeLevel: '學士班', fee: '免費', targetGroup: '合成系', requirementKind: '選修',
  generalEducation: '', language: '中文', enrollmentType: '一般', remoteMode: '', core: false, emi: false,
};

let sequence = 0;
function entry(options: {
  code?: string; title?: string; credits?: number; official?: Partial<OfficialFields>; restrictionText?: string; status?: PlanItem['status'];
} = {}): ScheduleEntry {
  sequence += 1;
  const code = options.code ?? `9${String(sequence).padStart(5, '0')}001`;
  const course: ScheduleCourse = {
    key: `1151:${code}`, code, title: options.title ?? `合成課程${sequence}`, credits: options.credits ?? 3, itemType: 'course',
    meetings: [], events: [], delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' }, eligibility: {},
    source: 'official', official: { ...OFFICIAL, ...options.official }, restrictionText: options.restrictionText ?? '',
  };
  return { course, item: { key: course.key, attendance: 'sync', status: options.status ?? 'planned', locked: false } };
}
const credits = (total: number) => Array.from({ length: total / 3 }, () => entry());
const ids = (reminders: RuleReminder[]) => reminders.map(({ id }) => id);
const undergrad = (year: number, additionalMajor: 'none' | 'minor' | 'double' = 'none') => ({ level: 'undergrad' as const, year, additionalMajor });

describe('credit limits', () => {
  test.each([
    [1, 9, true], [3, 9, true], [3, 12, false], [4, 9, true], [4, 12, false],
  ])('year %i with %i credits → below minimum: %s', (year, total, warns) => {
    const reminders = checkEnrollmentRules(credits(total), undergrad(year), rules);
    expect(ids(reminders).includes('credit-minimum')).toBe(warns);
  });

  test('year four minimum is 10 credits', () => {
    const tenCredits = [entry({ credits: 4 }), entry({ credits: 3 }), entry({ credits: 3 })];
    expect(ids(checkEnrollmentRules(tenCredits, undergrad(4), rules))).not.toContain('credit-minimum');
    expect(ids(checkEnrollmentRules(tenCredits, undergrad(3), rules))).toContain('credit-minimum');
  });

  test.each([
    ['none', 27, true], ['none', 24, false], ['minor', 27, false], ['minor', 30, true], ['double', 30, false], ['double', 33, true],
  ] as const)('%s with %i credits → above maximum: %s', (major, total, warns) => {
    const reminders = checkEnrollmentRules(credits(total), undergrad(2, major), rules);
    expect(ids(reminders).includes('credit-maximum')).toBe(warns);
  });

  test('explains the overload application and cites the source', () => {
    const [reminder] = checkEnrollmentRules(credits(27), undergrad(2), rules).filter(({ id }) => id === 'credit-maximum');
    expect(reminder).toMatchObject({ severity: 'warn' });
    expect(reminder?.message).toContain('25');
    expect(reminder?.message).toContain('超減修習學分數');
    expect(reminder?.source).toBe('選課須知 114.07 版 8-1 二、(一)2；8-2 (四)4');
  });

  test('does not apply undergraduate credit limits to graduate students', () => {
    expect(ids(checkEnrollmentRules(credits(3), { level: 'graduate', year: 1 }, rules))).toEqual([]);
  });

  test('skips credit limits until the student sets their year', () => {
    expect(ids(checkEnrollmentRules(credits(3), { level: 'undergrad' }, rules))).not.toContain('credit-minimum');
  });
});

describe('initial distribution caps', () => {
  const ge = (generalEducation: string, code?: string) => entry({ official: { generalEducation }, ...(code ? { code } : {}) });

  test.each([
    ['Chinese', [ge('中文通識'), ge('中文通識')]],
    ['foreign-language', [ge('外文通識'), ge('外文通識')]],
    ['PE (by code prefix)', [entry({ code: '002001001' }), entry({ code: '002002001' })]],
    ['college (by code prefix)', [entry({ code: '045001001' }), entry({ code: '045002001' })]],
    ['general plus college', [ge('社會通識'), ge('人文通識'), ge('自然通識'), ge('社會通識')]],
  ])('warns when %s courses exceed the cap', (_, entries) => {
    expect(ids(checkEnrollmentRules(entries, undergrad(2), rules))).toContain('distribution-cap');
  });

  test('allows one Chinese, one foreign, three general and one PE course', () => {
    const entries = [ge('中文通識'), ge('外文通識'), ge('社會通識'), ge('人文通識'), entry({ code: '045001001' }), entry({ code: '002001001' })];
    expect(ids(checkEnrollmentRules(entries, undergrad(2), rules))).not.toContain('distribution-cap');
  });

  test('ignores courses that are already registered or enrolled', () => {
    const entries = [ge('中文通識'), entry({ official: { generalEducation: '中文通識' }, status: 'registered' })];
    expect(ids(checkEnrollmentRules(entries, undergrad(2), rules))).not.toContain('distribution-cap');
  });
});

describe('initial selection stages', () => {
  test('stage one accepts only professional courses', () => {
    const entries = [entry({ official: { generalEducation: '社會通識' } }), entry()];
    const reminders = checkEnrollmentRules(entries, undergrad(2), rules, { phase: 'stage1' });
    const reminder = reminders.find(({ id }) => id === 'stage1-professional-only');
    expect(reminder?.courseKeys).toEqual([entries[0]?.course.key]);
  });

  test('stage one losers are not waitlisted', () => {
    expect(ids(checkEnrollmentRules([entry()], undergrad(2), rules, { phase: 'stage1' }))).toContain('stage1-no-waitlist');
    expect(ids(checkEnrollmentRules([entry()], undergrad(2), rules, { phase: 'stage2' }))).not.toContain('stage1-no-waitlist');
  });
});

describe('same course', () => {
  test('warns when two courses share the first six code digits', () => {
    const entries = [entry({ code: '900777001' }), entry({ code: '900777002' })];
    const reminder = checkEnrollmentRules(entries, undergrad(2), rules).find(({ id }) => id === 'same-course');
    expect(reminder?.courseKeys).toEqual(['1151:900777001', '1151:900777002']);
    expect(reminder?.message).toContain('只會選上一門');
  });

  test('warns when two courses share a title', () => {
    expect(ids(checkEnrollmentRules([entry({ title: '統計學' }), entry({ title: '統計學' })], undergrad(2), rules))).toContain('same-course');
  });
});

describe('course labels', () => {
  test.each([
    ['graduate-course', { official: { degreeLevel: '碩士班' } }],
    ['fee', { official: { fee: '收費' } }],
    ['restricted', { restrictionText: '限本系學生' }],
    ['restricted', { restrictionText: '限三年級以上' }],
    ['full-year', { official: { semesterSpan: '全學年科目' } }],
    ['auto-enrolled', { official: { enrollmentType: '必修灌檔' } }],
  ] as const)('labels %s', (id, options) => {
    const reminder = checkEnrollmentRules([entry(options)], undergrad(2), rules).find((candidate) => candidate.id === id);
    expect(reminder?.severity).toBe('info');
    expect(reminder?.courseKeys).toHaveLength(1);
  });

  test('does not label a graduate course for a graduate student', () => {
    expect(ids(checkEnrollmentRules([entry({ official: { degreeLevel: '碩士班' } })], { level: 'graduate' }, rules))).not.toContain('graduate-course');
  });

  test('does not label a course open to undergraduates and graduates', () => {
    expect(ids(checkEnrollmentRules([entry({ official: { degreeLevel: '學士班、碩士班' } })], undergrad(2), rules))).not.toContain('graduate-course');
  });
});

test('every reminder cites the enrollment rules', () => {
  const entries = [...credits(30), entry({ code: '002001001' }), entry({ code: '002002001' }), entry({ official: { fee: '收費' } })];
  for (const reminder of checkEnrollmentRules(entries, undergrad(2), rules, { phase: 'stage1' })) {
    expect(reminder.source).toMatch(/^選課須知 114\.07 版 8-\d/);
  }
});

test('only reminds and never changes the selection', () => {
  const entries = Object.freeze([entry({ official: { fee: '收費' } }), ...credits(30)].map((value) => Object.freeze(value)));
  const before = JSON.stringify(entries);
  checkEnrollmentRules(entries, undergrad(2), rules);
  expect(JSON.stringify(entries)).toBe(before);
});

test('rejects malformed rules data', () => {
  expect(() => parseEnrollmentRules({ ...enrollment11407, credits: { minimum: {} } })).toThrow();
});
