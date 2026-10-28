import { describe, expect, test } from 'vitest';
import { rowToCourse, type Course } from '../src/official/course.ts';
import { classifyOfficialNotes } from '../src/official/notes.ts';
import type { PlanItem, ScheduleEntry } from '../src/schedule/selection.ts';
import {
  findRetakes,
  matchMissingRequired,
  parseGapText,
  parseStudentExport,
  satisfiedPrerequisiteIds,
  type StudentRecord,
} from '../src/studentExport.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';
import exportFixture from './fixtures/synthetic/student-export.json' with { type: 'json' };

// 計畫 2.5：全人系統匯出檔解析。合成檔結構與真實匯出檔逐欄一致，內容虛構。
const raw = JSON.stringify(exportFixture);

function parsed(text = raw): StudentRecord {
  const result = parseStudentExport(text);
  if (!result.ok) throw new Error(result.error.code);
  return result.record;
}

// 測試用：改合成檔「課業學習」區塊中的巢狀欄位。
type Node = Record<string | number, unknown>;
function withFields(...changes: [(string | number)[], unknown][]): string {
  const data = JSON.parse(raw) as Node[];
  for (const [path, value] of changes) {
    let node = data[0]!['課業學習'] as Node;
    for (const key of path.slice(0, -1)) node = node[key] as Node;
    node[path.at(-1)!] = value;
  }
  return JSON.stringify(data);
}

describe('privacy', () => {
  test.each([
    ['chinese name', '王合成'],
    ['english name', 'SYNTHETIC, STUDENT'],
    ['student number', 'SYNTHETIC-0001'],
    ['phone', '0900000000'],
    ['email', 'student@example.com'],
    ['address', '合成地址'],
    ['emergency contact', '合成聯絡人'],
    ['dormitory', '合成宿舍'],
    ['roommate', '合成室友'],
    ['tutor email', 'tutor@example.com'],
    ['previous school', '合成高中'],
    ['club', '合成社團'],
    ['work', '合成單位'],
    ['honours', '合成獎勵事由'],
    ['a score', '87.00'],
    ['another score', '85.10'],
    ['ranking', '9 / 40'],
    ['average score', '80.00'],
  ])('never outputs the %s', (_, value) => {
    expect(JSON.stringify(parsed())).not.toContain(value);
  });

  test('outputs only the whitelisted sections', () => {
    expect(Object.keys(parsed()).sort()).toEqual(['audit', 'courses', 'enrollment', 'skippedCourseRows', 'suggestedProfile']);
  });
});

describe('enrollment and suggested profile', () => {
  test('reads the major and class', () => {
    expect(parsed().enrollment).toEqual({ major: '合成學系', doubleMajor: '', minors: [], programs: [], className: '合成四乙' });
  });

  test('suggests the year from the class name and no additional major', () => {
    expect(parsed().suggestedProfile).toEqual({ level: 'undergrad', year: 4, additionalMajor: 'none' });
  });

  test('suggests double major or minor from the enrollment fields', () => {
    const double = parsed(withFields([['aboutMe', 'doubleMajor'], '合成雙主修系']));
    expect(double.suggestedProfile.additionalMajor).toBe('double');
    expect(double.enrollment.doubleMajor).toBe('合成雙主修系');
    const minor = parsed(withFields([['aboutMe', 'minor1'], '合成輔系']));
    expect(minor.suggestedProfile.additionalMajor).toBe('minor');
    expect(minor.enrollment.minors).toEqual(['合成輔系']);
  });

  test('leaves the year unknown when the class name has no year', () => {
    expect(parsed(withFields([['aboutMe', 'departmentProgramGrade'], '合成碩專班'])).suggestedProfile.year).toBeUndefined();
  });
});

describe('completed courses', () => {
  test('keeps pass, fail, or withdrawn instead of the score', () => {
    expect(parsed().courses).toEqual([
      { term: '1142', code: '900021011', title: '合成會計學（二）', credits: 3, kind: 'required', generalEducation: [], result: 'withdrawn' },
      { term: '1142', code: '900035011', title: '合成資訊系統（二）', credits: 2, kind: 'required', generalEducation: [], result: 'passed' },
      { term: '1141', code: '900033011', title: '合成會計學（一）', credits: 3, kind: 'required', generalEducation: [], result: 'passed' },
      { term: '1141', code: '002381001', title: '體育[男女合班]—合成球', credits: 1, kind: 'required', generalEducation: [], result: 'passed' },
      { term: '1141', code: '042089001', title: '合成通識課', credits: 2, kind: 'group', generalEducation: ['社會'], result: 'passed' },
      { term: '1141', code: '044049001', title: '合成跨域通識', credits: 2, kind: 'group', generalEducation: ['人文', '社會'], result: 'failed' },
      { term: '1141', code: '900830011', title: '合成程式設計', credits: 3, kind: 'elective', generalEducation: [], result: 'passed' },
    ]);
  });

  test('skips a course row with unusable credits or code', () => {
    const text = withFields(
      [['gradeRecordList', 0, 'GradeRecords', 0, 'credit'], '三'],
      [['gradeRecordList', 0, 'GradeRecords', 1, 'courseCode'], '<script>'],
    );
    expect(parsed(text).courses).toHaveLength(5);
  });
});

describe('school audit', () => {
  test('reads credits and the audit date', () => {
    expect(parsed().audit).toMatchObject({
      curriculumYear: '112',
      checkedAt: '2026-10-26',
      graduationCredits: 128,
      earnedCredits: 20,
      remainingCredits: 108,
      requiredCredits: 48,
      groupCredits: 3,
    });
  });

  test('lists missing required courses and other gaps', () => {
    const { audit } = parsed();
    expect(audit.missingRequired).toEqual([{ label: '合成審計', count: 1 }, { label: '合成會計學（二）', count: 1 }]);
    expect(audit.gaps).toEqual([{ area: 'pe', label: '體育', text: '[體育欠1門]', items: [{ label: '體育', count: 1, unit: '門' }] }]);
    expect(audit.unparsed).toEqual([]);
  });

  test('keeps unrecognized gap text instead of dropping it', () => {
    const text = withFields([['coursePlan', 'liberalGeneral'], '尚缺跨領域 2 學分']);
    const { audit } = parsed(text);
    expect(audit.gaps).toContainEqual({ area: 'general', label: '一般通識', text: '尚缺跨領域 2 學分', items: [] });
    expect(audit.unparsed).toEqual(['尚缺跨領域 2 學分']);
  });
});

describe('parseGapText', () => {
  test.each([
    ['[缺合成審計1]', [{ label: '合成審計', count: 1 }]],
    ['[缺合成會計學（二）1][缺合成審計2]', [{ label: '合成會計學（二）', count: 1 }, { label: '合成審計', count: 2 }]],
    ['[體育欠1門]', [{ label: '體育', count: 1, unit: '門' }]],
    ['[通識欠4學分]', [{ label: '通識', count: 4, unit: '學分' }]],
    ['', []],
  ])('parses %s', (text, items) => {
    expect(parseGapText(text).items).toEqual(items);
  });

  test('reports text it cannot read', () => {
    expect(parseGapText('[缺合成審計1]另需專題').rest).toBe('另需專題');
  });
});

describe('errors', () => {
  test.each([
    ['not JSON', '{bad', 'INVALID_JSON'],
    ['not an export', JSON.stringify({ hello: 1 }), 'INVALID_FORMAT'],
    ['missing the academic section', JSON.stringify([{ 個人資料: {} }]), 'INVALID_FORMAT'],
    ['a prototype key', '[{"課業學習":{"__proto__":{}}}]', 'INVALID_FORMAT'],
    ['too large', ' '.repeat(2_000_001), 'TOO_LARGE'],
  ])('rejects %s', (_, text, code) => {
    const result = parseStudentExport(text);
    expect(result.ok ? 'OK' : result.error.code).toBe(code);
  });
});

describe('using the record', () => {
  const offering = (code: string, title: string): Course => {
    const { course } = rowToCourse(officialRow({ subNum: code, subNam: title }), TERM);
    if (!course) throw new Error('rejected');
    return course;
  };

  test('matches missing required courses to this semester’s offerings', () => {
    const snapshot = [offering('900777001', '合成審計'), offering('900777002', '合成 審計'), offering('900888001', '其他課')];
    expect(matchMissingRequired(parsed().audit.missingRequired, snapshot).map(({ label, offerings }) => ({ label, codes: offerings.map(({ code }) => code) }))).toEqual([
      { label: '合成審計', codes: ['900777001', '900777002'] },
      { label: '合成會計學（二）', codes: [] },
    ]);
  });

  test('turns passed courses into satisfied prerequisite conditions', () => {
    const ids = satisfiedPrerequisiteIds(parsed());
    expect(ids).toContain('prerequisite-course:合成會計學(一)');
    expect(ids).not.toContain('prerequisite-course:合成會計學(二)');
    expect(ids).not.toContain('prerequisite-course:合成跨域通識');
  });

  test('warns about planning a course already passed', () => {
    const entry = (code: string, title: string): ScheduleEntry => {
      const item: PlanItem = { key: `1151:${code}`, attendance: 'sync', status: 'planned', locked: false };
      return { course: { key: item.key, code, title, credits: 3, itemType: 'course', meetings: [], events: [], eligibility: {}, delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' } }, item };
    };
    const retakes = findRetakes(parsed(), [entry('900033099', '合成會計學（一）新班'), entry('900021012', '合成會計學（二）'), entry('900999001', '合成程式設計')]);
    expect(retakes).toEqual([
      { key: '1151:900033099', passedTitle: '合成會計學（一）', reason: 'code' },
      { key: '1151:900999001', passedTitle: '合成程式設計', reason: 'title' },
    ]);
  });
});

// 程式碼審查修正（2026-10-28）
describe('review fixes', () => {
  test('does not treat the second half of a full-year course as a retake', () => {
    const fullYear = (key: string, code: string, title: string): ScheduleEntry => ({
      course: {
        key, code, title, credits: 3, itemType: 'course', meetings: [], events: [], eligibility: {},
        delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
        official: { semesterSpan: '全學年科目', degreeLevel: '學士班', fee: '免費', targetGroup: '', requirementKind: '必修', generalEducation: '', language: '中文', enrollmentType: '一般', remoteMode: '', core: false, emi: false },
      },
      item: { key, attendance: 'sync', status: 'planned', locked: false },
    });
    // 合成檔中 900033011「合成會計學（一）」於學期代碼結尾 1 通過；下學期（結尾 2）的全學年下半不算重修，同為上學期才算。
    expect(findRetakes(parsed(), [fullYear('1152:900033012', '900033012', '合成會計學（一）')])).toEqual([]);
    expect(findRetakes(parsed(), [fullYear('1151:900033012', '900033012', '合成會計學（一）')])).toHaveLength(1);
  });

  test('suggests a graduate profile for a graduate class and uses the graduate pass mark', () => {
    const record = parsed(withFields(
      [['aboutMe', 'departmentProgramGrade'], '合成碩一'],
      [['gradeRecordList', 0, 'GradeRecords', 1, 'score'], '65.00'],
    ));
    expect(record.suggestedProfile).toEqual({ level: 'graduate', year: 1, additionalMajor: 'none' });
    expect(record.courses.find(({ code }) => code === '900035011')?.result).toBe('failed');
  });

  test('reads pass/fail courses from scoreIfPass', () => {
    const record = parsed(withFields(
      [['gradeRecordList', 0, 'GradeRecords', 1, 'score'], ''],
      [['gradeRecordList', 0, 'GradeRecords', 1, 'scoreIfPass'], '通過'],
      [['gradeRecordList', 0, 'GradeRecords', 2, 'score'], ''],
      [['gradeRecordList', 0, 'GradeRecords', 2, 'scoreIfPass'], '不通過'],
    ));
    expect(record.courses.map(({ result }) => result).slice(1, 3)).toEqual(['passed', 'failed']);
  });

  test('parses missing items with a unit after the number', () => {
    expect(parseGapText('[缺專題研究2學分][缺合成審計1門]').items).toEqual([{ label: '專題研究', count: 2, unit: '學分' }, { label: '合成審計', count: 1, unit: '門' }]);
  });

  test('counts course rows that could not be read', () => {
    const text = withFields([['gradeRecordList', 0, 'GradeRecords', 0, 'credit'], '三']);
    expect(parsed(text).skippedCourseRows).toBe(1);
    expect(parsed().skippedCourseRows).toBe(0);
  });

  test('reads program entries given as objects and reports unknown shapes', () => {
    const record = parsed(withFields([['aboutMe', 'registerOtherProgramList'], [{ programName: '合成學程' }, 42]]));
    expect(record.enrollment.programs).toEqual(['合成學程']);
    expect(record.audit.unparsed).toEqual(['學程資料格式無法辨識']);
  });

  test('produces prerequisite ids in the same form as official notes', () => {
    const fromNotes = classifyOfficialNotes({ courseCode: '900001001', restrictionText: '擋修合成會計學（一）' }).eligibilityRules[0]?.conditionId;
    expect(satisfiedPrerequisiteIds(parsed())).toContain(fromNotes);
  });
});
