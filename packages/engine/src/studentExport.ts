// 全人系統匯出檔（exportStudentData.json）解析：只以白名單讀取學籍、歷年修課與學校畢業審查（設計 8.5）。
// 個人資料、宿舍、室友、導師、排名、操行、榮譽一律不讀；分數不保留，只留通過／未通過／停修。
// 格式調查見 docs/research/nccu-student-export.md（目前只見過一份無雙主修／輔系的樣本）。

import { normalizeSearchText } from './catalog.ts';
import type { IdentityProfile } from './eligibility.ts';
import type { Course } from './official/course.ts';
import { prerequisiteConditionId } from './official/notes.ts';
import { parseUntrustedJson } from './safeJson.ts';
import type { ScheduleEntry } from './schedule/selection.ts';

export interface CompletedCourse {
  /** 四碼學期，例：學年＋學期。 */
  term: string;
  code: string;
  title: string;
  credits: number;
  kind: 'required' | 'elective' | 'group' | 'other';
  /** 通識領域，例「社會」「人文」。 */
  generalEducation: string[];
  result: 'passed' | 'failed' | 'withdrawn' | 'unknown';
}

export interface GapItem {
  label: string;
  count: number;
  unit?: '門' | '科' | '學分';
}

export type GapArea = 'pe' | 'language' | 'liberal' | 'general' | 'chinese' | 'english' | 'group' | 'program';

export interface AuditGap {
  area: GapArea;
  label: string;
  /** 學校審查的原文。 */
  text: string;
  items: GapItem[];
}

export interface SchoolAudit {
  curriculumYear: string;
  /** 學校審查資料日期（YYYY-MM-DD）；無法辨識時為空字串。 */
  checkedAt: string;
  graduationCredits: number | null;
  earnedCredits: number | null;
  remainingCredits: number | null;
  requiredCredits: number | null;
  groupCredits: number | null;
  missingRequired: GapItem[];
  gaps: AuditGap[];
  /** 看不懂的審查文字，畫面原文顯示，不丟掉。 */
  unparsed: string[];
}

export interface StudentRecord {
  enrollment: { major: string; doubleMajor: string; minors: string[]; programs: string[]; className: string };
  /** 建議值，畫面須讓學生本人確認後才寫入身分條件。 */
  suggestedProfile: Pick<IdentityProfile, 'level' | 'year' | 'additionalMajor'>;
  courses: CompletedCourse[];
  /** 格式不符而略過的修課列數；大於 0 時畫面要提示匯入不完整。 */
  skippedCourseRows: number;
  audit: SchoolAudit;
}

export type StudentExportErrorCode = 'TOO_LARGE' | 'INVALID_JSON' | 'INVALID_FORMAT';

export type StudentExportResult =
  | { ok: true; record: StudentRecord }
  | { ok: false; error: { code: StudentExportErrorCode; message: string } };

const MAX_RAW_LENGTH = 2_000_000;
// 及格分數：學士班 60、碩博士班 70（政大學則）。
const PASSING_SCORE = { undergrad: 60, graduate: 70 } as const;
const MESSAGES: Record<StudentExportErrorCode, string> = {
  TOO_LARGE: '檔案太大，請確認是全人系統匯出的檔案。',
  INVALID_JSON: '檔案不是有效的 JSON。',
  INVALID_FORMAT: '這不是全人系統匯出的修課資料檔。',
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value: unknown) => {
  const text = str(value);
  const parsed = Number(text);
  return text !== '' && Number.isFinite(parsed) ? parsed : null;
};
const fail = (code: StudentExportErrorCode): StudentExportResult => ({ ok: false, error: { code, message: MESSAGES[code] } });

const KIND: Record<string, CompletedCourse['kind']> = { 必: 'required', 選: 'elective', 群: 'group' };
const COURSE_CODE = /^[0-9A-Z]{9}$/;
const TERM_CODE = /^\d{4}$/;

function readCourse(raw: unknown, level: 'undergrad' | 'graduate'): CompletedCourse | null {
  if (!isObject(raw)) return null;
  const code = str(raw.courseCode);
  const term = str(raw.academicYearSemester);
  const credits = num(raw.credit);
  const title = str(raw.courseName);
  if (!COURSE_CODE.test(code) || !TERM_CODE.test(term) || credits === null || credits < 0 || credits > 12 || !title) return null;
  // 分數空白的通過／不通過課程，結果寫在 scoreIfPass。
  const score = str(raw.score) || str(raw.scoreIfPass);
  const numericScore = num(score);
  const result: CompletedCourse['result'] = score === '停修'
    ? 'withdrawn'
    : numericScore !== null
      ? (numericScore >= PASSING_SCORE[level] ? 'passed' : 'failed')
      : /不通過|不及格/.test(score) ? 'failed'
        : /通過|及格|抵免/.test(score) ? 'passed' : 'unknown';
  return {
    term,
    code,
    title,
    credits,
    kind: KIND[str(raw.requiredOrElectiveCourse)] ?? 'other',
    generalEducation: str(raw.remark).split(/[、,，]/).map((area) => area.trim().replace(/通$/, '')).filter(Boolean),
    result,
  };
}

/** 解析學校審查文字：「[缺課名1]」「[體育欠1門]」「[通識欠4學分]」。看不懂的部分放在 rest。 */
export function parseGapText(text: string): { items: GapItem[]; rest: string } {
  const items: GapItem[] = [];
  const rest = text.replace(/\[([^\]]+)\]/g, (whole, inner: string) => {
    const missing = /^缺(.+?)(\d+(?:\.\d+)?)(門|科|學分)?$/.exec(inner);
    const owed = /^(.+?)欠(\d+(?:\.\d+)?)(門|科|學分)?$/.exec(inner);
    const match = missing ?? owed;
    if (!match?.[1] || !match[2]) return whole;
    const unit = match[3] as GapItem['unit'] | undefined;
    items.push({ label: match[1].trim(), count: Number(match[2]), ...(unit ? { unit } : {}) });
    return '';
  }).trim();
  return { items, rest };
}

const GAP_FIELDS: ReadonlyArray<[string, GapArea, string]> = [
  ['commonPhysical', 'pe', '體育'],
  ['commonLanguage', 'language', '語文'],
  ['liberalTotal', 'liberal', '通識總計'],
  ['liberalGeneral', 'general', '一般通識'],
  ['liberalChinese', 'chinese', '中文通識'],
  ['liberalEnglish', 'english', '外文通識'],
  ['groupRemark', 'group', '群修'],
  ['programRemark', 'program', '學程'],
];

function readAudit(plan: Json, totalCredits: unknown): SchoolAudit {
  const unparsed: string[] = [];
  const required = parseGapText(str(plan.requiredRemark, 2000));
  if (required.rest) unparsed.push(required.rest);
  const gaps: AuditGap[] = [];
  GAP_FIELDS.forEach(([field, area, label]) => {
    const text = str(plan[field], 2000);
    if (!text) return;
    const parsed = parseGapText(text);
    if (parsed.rest) unparsed.push(parsed.rest);
    gaps.push({ area, label, text, items: parsed.items });
  });
  const stamp = /^(\d{4})(\d{2})(\d{2})$/.exec(str(plan.coursePlanTimestamp));
  const graduationCredits = num(plan.graduationCredit);
  const earnedCredits = num(totalCredits);
  return {
    curriculumYear: /^\d{3}$/.test(str(plan.coursePlanSchyy)) ? str(plan.coursePlanSchyy) : '',
    checkedAt: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}` : '',
    graduationCredits,
    earnedCredits,
    remainingCredits: graduationCredits !== null && earnedCredits !== null ? Math.max(0, graduationCredits - earnedCredits) : null,
    requiredCredits: num(plan.requiredPoint),
    groupCredits: num(plan.groupPoint),
    missingRequired: required.items,
    gaps,
    unparsed,
  };
}

const YEAR_DIGITS = '一二三四五六七';

export function parseStudentExport(raw: string): StudentExportResult {
  const parsed = parseUntrustedJson(raw, MAX_RAW_LENGTH);
  if (!parsed.ok) return fail(parsed.code === 'PROTOTYPE_KEY' ? 'INVALID_FORMAT' : parsed.code);
  const data = parsed.value;
  if (!Array.isArray(data)) return fail('INVALID_FORMAT');
  // 只取「課業學習」區塊；其餘區塊（個人資料等）完全不讀。
  const academic = data.find((section): section is Json => isObject(section) && isObject(section['課業學習']))?.['課業學習'];
  if (!isObject(academic) || !isObject(academic.aboutMe) || !isObject(academic.coursePlan) || !Array.isArray(academic.gradeRecordList)) {
    return fail('INVALID_FORMAT');
  }
  const about = academic.aboutMe;
  const doubleMajor = str(about.doubleMajor) || str(about.registerDoubleMajor);
  const minors = [...new Set([str(about.minor1), str(about.minor2), str(about.registerMinor)].filter(Boolean))];
  // 學程清單有值時的格式尚未見過：字串或含名稱的物件都接受，其他形狀回報為看不懂。
  let unknownProgramShape = false;
  const listedPrograms = (Array.isArray(about.registerOtherProgramList) ? about.registerOtherProgramList : []).map((program) => {
    const name = typeof program === 'string' ? str(program) : isObject(program) ? str(program.programName) || str(program.name) : '';
    if (!name) unknownProgramShape = true;
    return name;
  });
  const programs = [...new Set([str(about.program), ...listedPrograms].filter(Boolean))];
  const className = str(about.departmentProgramGrade);
  const level = /碩|博/.test(className) ? 'graduate' : 'undergrad';
  const yearChar = /([一二三四五六七])[甲乙丙丁戊己]?$/.exec(className)?.[1];
  const rows = academic.gradeRecordList.flatMap((year) => (isObject(year) && Array.isArray(year.GradeRecords) ? year.GradeRecords : []));
  const courses = rows.map((row) => readCourse(row, level)).filter((course): course is CompletedCourse => course !== null);
  const audit = readAudit(academic.coursePlan, academic.totalCredits);
  if (unknownProgramShape) audit.unparsed.push('學程資料格式無法辨識');
  return {
    ok: true,
    record: {
      enrollment: { major: str(about.registerMajor), doubleMajor, minors, programs, className },
      suggestedProfile: {
        level,
        ...(yearChar ? { year: YEAR_DIGITS.indexOf(yearChar) + 1 } : {}),
        additionalMajor: doubleMajor ? 'double' : minors.length ? 'minor' : 'none',
      },
      courses,
      skippedCourseRows: rows.length - courses.length,
      audit,
    },
  };
}

/** 學校審查缺的必修 → 本學期快照中同名（正規化後）的開課。 */
export function matchMissingRequired(missing: readonly GapItem[], courses: readonly Course[]): (GapItem & { offerings: Course[] })[] {
  return missing.map((item) => {
    const title = normalizeSearchText(item.label);
    return { ...item, offerings: courses.filter((course) => normalizeSearchText(course.title) === title) };
  });
}

/** 已通過的課 → 官方擋修條件 id（與 official/notes 的「prerequisite-course:課名」相同寫法）。只能比對同名，簡稱無法對應。 */
export function satisfiedPrerequisiteIds(record: StudentRecord): string[] {
  return [...new Set(record.courses.filter(({ result }) => result === 'passed').map(({ title }) => prerequisiteConditionId(title)))];
}

/** 課表中與已通過課程同名、或課號前六碼相同的課（選課須知：重複修習）。
 * 全學年課的上下學期課號前六碼與課名相同，所以全學年課只有在「同為上學期或同為下學期」時才算重修。 */
export interface Retake {
  key: string;
  passedTitle: string;
  reason: 'code' | 'title';
}

export function findRetakes(record: StudentRecord, entries: readonly ScheduleEntry[]): Retake[] {
  const passedCourses = record.courses.filter(({ result }) => result === 'passed');
  return entries.flatMap(({ course }): Retake[] => {
    const plannedSemester = /^\d{3}([12]):/.exec(course.key)?.[1];
    const fullYear = course.official?.semesterSpan === '全學年科目';
    const passed = passedCourses.filter(({ term }) => !(fullYear && plannedSemester && term.slice(3) !== plannedSemester));
    const byCode = course.code ? passed.find(({ code }) => code.slice(0, 6) === course.code!.slice(0, 6)) : undefined;
    if (byCode) return [{ key: course.key, passedTitle: byCode.title, reason: 'code' }];
    const byTitle = passed.find(({ title }) => normalizeSearchText(title) === normalizeSearchText(course.title));
    return byTitle ? [{ key: course.key, passedTitle: byTitle.title, reason: 'title' }] : [];
  });
}
