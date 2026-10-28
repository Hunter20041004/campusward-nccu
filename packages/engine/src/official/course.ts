import { z } from 'zod';
import { parseMeetings, type Meeting } from '../periods.ts';
import { formatTerm, isRowInTerm, type Term } from '../term.ts';
import { classifyOfficialNotes, type ClassifiedNotes } from './notes.ts';
import { officialSyllabusState, type SyllabusState } from './syllabus.ts';
import { trustedNccuUrl } from './url.ts';

/** 官方欄位（設計 8.2 指定保留）。原值保留為字串，布林欄位轉成 boolean。 */
export interface OfficialFields {
  semesterSpan: string;
  degreeLevel: string;
  fee: string;
  targetGroup: string;
  requirementKind: string;
  generalEducation: string;
  language: string;
  enrollmentType: string;
  remoteMode: string;
  core: boolean;
  emi: boolean;
}

export interface CourseLinks {
  syllabus?: string;
  teacher?: string;
  remaining?: string;
  unitRule?: string;
  location?: string;
}

export type DeliveryMode = 'in-person' | 'asynchronous' | 'asynchronous-optional';

export interface Delivery {
  mode: DeliveryMode;
  /** 學生可選擇以非同步方式修課（不佔每週時段）。 */
  asyncAllowed: boolean;
  defaultAttendance: 'sync' | 'async';
}

/** 一次性的考試或活動；時間未知的欄位省略，不捏造。 */
export interface CourseEvent {
  label: string;
  date?: string;
  week?: number;
  day?: number;
  start?: number;
  end?: number;
}

/** 一門官方課程（某學期的某個開課班）。只放官方資料，不含學生的選擇。 */
export interface Course {
  term: string;
  code: string;
  title: string;
  teacher: string;
  credits: number;
  scheduleText: string;
  classroom: string;
  meetings: Meeting[];
  restrictionText: string;
  notes: ClassifiedNotes;
  official: OfficialFields;
  links: CourseLinks;
  syllabus: SyllabusState;
  delivery: Delivery;
  events: CourseEvent[];
  /** 套用的人工時段更正（data/corrections）。 */
  correctionId?: string;
}

export interface RowResult {
  course: Course | null;
  issues: string[];
}

const MAX_TEXT = 2000;
const MAX_CREDITS = 12;
// 去除控制字元（保留換行，備註以換行分段）。
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

const RowShape = z.record(z.string(), z.unknown());

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(CONTROL_CHARS, '').trim();
}

function text(value: unknown): string {
  return clean(value).slice(0, MAX_TEXT);
}

function officialNote(value: unknown): string {
  const normalized = clean(value).replace(/^＠備註\s*[:：]?\s*/, '').trim().slice(0, MAX_TEXT);
  return ['無', '無資料'].includes(normalized) ? '' : normalized;
}

const LINK_FIELDS: ReadonlyArray<[keyof CourseLinks, string]> = [
  ['syllabus', 'teaSchmUrl'],
  ['teacher', 'teaExpUrl'],
  ['remaining', 'subRemainUrl'],
  ['unitRule', 'subUnitRuleUrl'],
  ['location', 'subLocUrl'],
];

export function rowToCourse(raw: unknown, term: Term): RowResult {
  const parsed = RowShape.safeParse(raw);
  if (!parsed.success || Array.isArray(raw)) return { course: null, issues: ['列不是物件'] };
  const row = parsed.data;
  const code = text(row.subNum);
  const label = code || '(無課號)';
  const issues: string[] = [];

  const title = text(row.subNam);
  const credits = Number(text(row.subPoint));
  if (!code) issues.push(`${label}: 缺少課號`);
  if (!title) issues.push(`${label}: 缺少課名`);
  if (!Number.isFinite(credits) || text(row.subPoint) === '') issues.push(`${label}: 學分不是數字`);
  else if (credits < 0 || credits > MAX_CREDITS) issues.push(`${label}: 學分超出範圍`);
  if (issues.length) return { course: null, issues };

  const links: CourseLinks = {};
  for (const [key, field] of LINK_FIELDS) {
    const value = text(row[field]);
    if (!value) continue;
    const trusted = trustedNccuUrl(value);
    if (trusted) links[key] = trusted;
    else issues.push(`${code}: 不受信任的網址欄位 ${field}`);
  }

  const restrictionText = [...new Set([officialNote(row.note), officialNote(row.gdeTpeMsg)].filter(Boolean))].join('；');
  const scheduleText = text(row.subTime);

  return {
    course: {
      term: formatTerm(term),
      code,
      title,
      teacher: text(row.teaNam),
      credits,
      scheduleText,
      classroom: text(row.subClassroom),
      meetings: parseMeetings(scheduleText),
      restrictionText,
      notes: classifyOfficialNotes({ courseCode: code, restrictionText }),
      official: {
        semesterSpan: text(row.smtQty),
        degreeLevel: text(row.gdeType),
        fee: text(row.pay),
        targetGroup: text(row.subGde),
        requirementKind: text(row.subKind),
        generalEducation: text(row.lmtKind),
        language: text(row.langTpe),
        enrollmentType: text(row.tranTpe),
        remoteMode: officialNote(row.far),
        core: text(row.core) === '是',
        emi: text(row.emiType) === '是',
      },
      links,
      syllabus: officialSyllabusState({ sourceUrl: links.syllabus ?? '', lookupStatus: 'success' }),
      // 不從備註或彈性時間推斷非同步；只有人工更正表能改變上課方式。
      delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
      events: [],
    },
    issues,
  };
}

/** 把官方查詢回傳轉成課程；只保留指定學期，無效列記入 issues 而不中斷。 */
export function normalizeOfficialRows(rows: unknown, term: Term): { courses: Course[]; issues: string[] } {
  if (!Array.isArray(rows)) throw new Error('官方回傳格式不是陣列');
  const courses: Course[] = [];
  const issues: string[] = [];
  for (const row of rows) {
    if (row && typeof row === 'object' && !isRowInTerm(row as { y?: unknown; s?: unknown }, term)) continue;
    const result = rowToCourse(row, term);
    if (result.course) courses.push(result.course);
    issues.push(...result.issues);
  }
  return { courses, issues };
}
