import { describe, expect, test } from 'vitest';
import { normalizeOfficialRows, rowToCourse } from '../src/official/course.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

const course = (overrides: Record<string, unknown> = {}) => {
  const result = rowToCourse(officialRow(overrides), TERM);
  if (!result.course) throw new Error(`expected a course, got issues: ${result.issues.join('; ')}`);
  return result.course;
};

describe('rowToCourse basics', () => {
  test('maps identity, credits, and meetings', () => {
    const c = course();
    expect(c).toMatchObject({
      term: '1151',
      code: '900123001',
      title: '合成課程概論',
      teacher: '王合成',
      credits: 3,
      scheduleText: '四D56',
      classroom: '綜合900101',
    });
    expect(c.meetings).toEqual([{ day: 4, start: 790, end: 960, label: '四D56' }]);
  });

  test('keeps an unscheduled course with no meetings', () => {
    expect(course({ subTime: '未定或彈性' }).meetings).toEqual([]);
  });

  test('strips the official note prefix and drops empty markers', () => {
    expect(course({ note: '＠備註:經濟系學生優先。', gdeTpeMsg: '' }).restrictionText).toBe('經濟系學生優先。');
    expect(course({ note: '＠備註:無', gdeTpeMsg: '無資料' }).restrictionText).toBe('');
  });

  test('merges graduate-type messages into restriction text', () => {
    expect(course({ note: '＠備註:限本系學生', gdeTpeMsg: '碩士班課程' }).restrictionText).toBe('限本系學生；碩士班課程');
  });

  test('classifies notes into typed metadata', () => {
    const c = course({ courseCode: undefined, note: '＠備註:僅限合成系及雙主修學生修讀。' });
    expect(c.notes.eligibilityRules[0]).toMatchObject({
      conditionId: 'official-restriction:900123001',
      conditionLabel: '我是合成系或雙主修學生',
      source: 'nccu-official',
    });
  });
});

// 設計 8.2：保留舊 adapter 丟掉的官方欄位
describe('official fields are preserved', () => {
  test.each([
    ['smtQty', '全學年科目', 'semesterSpan'],
    ['gdeType', '碩士班', 'degreeLevel'],
    ['pay', '收費', 'fee'],
    ['subGde', '合成系', 'targetGroup'],
    ['subKind', '群修', 'requirementKind'],
    ['lmtKind', '外文通識', 'generalEducation'],
    ['langTpe', '英文', 'language'],
    ['tranTpe', '必修灌檔', 'enrollmentType'],
    ['far', '非同步遠距', 'remoteMode'],
  ])('%s → %s', (field, value, key) => {
    expect(course({ [field]: value }).official[key as keyof ReturnType<typeof course>['official']]).toBe(value);
  });

  test.each([
    ['core', '是', 'core', true],
    ['core', '否', 'core', false],
    ['emiType', '是', 'emi', true],
    ['emiType', '否', 'emi', false],
  ])('%s=%s → %s', (field, value, key, expected) => {
    expect(course({ [field]: value }).official[key as 'core' | 'emi']).toBe(expected);
  });

  test('general education category is not mixed into restrictions', () => {
    const c = course({ lmtKind: '外文通識', note: '＠備註:無' });
    expect(c.restrictionText).toBe('');
    expect(c.notes.eligibilityRules).toEqual([]);
  });
});

describe('links', () => {
  test('keeps trusted official links', () => {
    expect(course().links).toEqual({
      syllabus: 'https://newdoc.nccu.edu.tw/teaschm/1151/schmPrv.jsp-yy=115&smt=1&num=900123&gop=00&s=1.html',
      teacher: 'https://newdoc.nccu.edu.tw/teaschm/1151/teaExpC.jsp-yy=115&smt=1&num=900123&gop=00&s=1.htm',
      remaining: 'https://selectcourse.nccu.edu.tw/remain/goGenDetail.aspx?view=SYNTHETIC',
      unitRule: 'https://newdoc.nccu.edu.tw/generalcourse/emptyforqry.htm',
      location: 'https://sgnweb.nccu.edu.tw/mnccuqa/index.html?roomid=900101',
    });
  });

  test('drops an untrusted link and records a data issue', () => {
    const result = rowToCourse(officialRow({ subRemainUrl: 'javascript:alert(1)', teaExpUrl: 'https://evil.example.com/x' }), TERM);
    expect(result.course?.links.remaining).toBeUndefined();
    expect(result.course?.links.teacher).toBeUndefined();
    expect(result.issues).toEqual([
      '900123001: 不受信任的網址欄位 teaExpUrl',
      '900123001: 不受信任的網址欄位 subRemainUrl',
    ]);
  });

  test('marks the syllabus state from the syllabus link', () => {
    expect(course().syllabus.status).toBe('available');
    expect(course({ teaSchmUrl: '' }).syllabus.status).toBe('not_uploaded');
  });
});

describe('untrusted text', () => {
  test('removes control characters', () => {
    expect(course({ subNam: '合成\u0000課程\u001b[31m' }).title).toBe('合成課程[31m');
  });

  test('truncates over-long strings', () => {
    expect(course({ note: `＠備註:${'長'.repeat(5000)}` }).restrictionText.length).toBe(2000);
  });
});

describe('rejections', () => {
  test.each([
    [{ subNum: '' }, '缺少課號'],
    [{ subNam: '' }, '缺少課名'],
    [{ subPoint: 'abc' }, '學分不是數字'],
    [{ subPoint: '99' }, '學分超出範圍'],
  ])('rejects %o', (overrides, reason) => {
    const result = rowToCourse(officialRow(overrides), TERM);
    expect(result.course).toBeNull();
    expect(result.issues.join()).toContain(reason);
  });

  test('rejects a non-object row', () => {
    expect(rowToCourse('nope', TERM)).toEqual({ course: null, issues: ['列不是物件'] });
  });
});

describe('normalizeOfficialRows', () => {
  test('keeps only rows from the requested semester', () => {
    const { courses } = normalizeOfficialRows([
      officialRow(),
      officialRow({ subNum: '900123002', s: '2' }),
      officialRow({ subNum: '900123003', y: '114' }),
    ], TERM);
    expect(courses.map(({ code }) => code)).toEqual(['900123001']);
  });

  test('collects issues from invalid rows without throwing', () => {
    const { courses, issues } = normalizeOfficialRows([officialRow(), officialRow({ subNam: '' })], TERM);
    expect(courses).toHaveLength(1);
    expect(issues).toHaveLength(1);
  });

  test('throws when the response is not an array', () => {
    expect(() => normalizeOfficialRows({ rows: [] }, TERM)).toThrow('官方回傳格式不是陣列');
  });
});
