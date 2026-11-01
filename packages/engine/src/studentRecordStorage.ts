// 全人系統資料（已縮減的 StudentRecord）存在這台瀏覽器（設計第 9 節；2026-11-01 使用者要求匯入一次、各功能共用）。
// 只存白名單欄位：學籍、修課結果（通過／未通過／停修，不含分數）、學校審查。姓名、學號、個人資料一律不在其中。
// 不進匯出檔（exportTransfer 只挑課表欄位）、不送 AI；清除本機資料時一併清掉。

import { z } from 'zod';
import { parseUntrustedJson } from './safeJson.ts';
import type { StorageLike } from './storage.ts';
import type { StudentRecord } from './studentExport.ts';

export const RECORD_KEY = 'campusward:v1:student-record';
const MAX_LENGTH = 400_000;

const Text = (max = 200) => z.string().max(max);
const GapItemSchema = z.object({ label: Text(), count: z.number().min(0).max(999), unit: z.enum(['門', '科', '學分']).optional() }).strict();
const RecordSchema = z.object({
  enrollment: z.object({
    major: Text(), doubleMajor: Text(), minors: z.array(Text()).max(5), programs: z.array(Text()).max(20), className: Text(),
  }).strict(),
  suggestedProfile: z.object({
    level: z.enum(['undergrad', 'graduate']).optional(),
    year: z.number().int().min(1).max(7).optional(),
    additionalMajor: z.enum(['none', 'minor', 'double']).optional(),
  }).strict(),
  courses: z.array(z.object({
    term: z.string().regex(/^\d{4}$/),
    code: z.string().regex(/^[0-9A-Z]{9}$/),
    title: Text(),
    credits: z.number().min(0).max(12),
    kind: z.enum(['required', 'elective', 'group', 'other']),
    generalEducation: z.array(Text(20)).max(10),
    result: z.enum(['passed', 'failed', 'withdrawn', 'unknown']),
  }).strict()).max(400),
  skippedCourseRows: z.number().int().min(0).max(10_000),
  audit: z.object({
    curriculumYear: Text(10),
    checkedAt: Text(10),
    graduationCredits: z.number().nullable(),
    earnedCredits: z.number().nullable(),
    remainingCredits: z.number().nullable(),
    requiredCredits: z.number().nullable(),
    groupCredits: z.number().nullable(),
    missingRequired: z.array(GapItemSchema).max(100),
    gaps: z.array(z.object({
      area: z.enum(['pe', 'language', 'liberal', 'general', 'chinese', 'english', 'group', 'program']),
      label: Text(),
      text: Text(2000),
      items: z.array(GapItemSchema).max(100),
    }).strict()).max(20),
    unparsed: z.array(Text(2000)).max(30),
  }).strict(),
}).strict();

const StoredSchema = z.object({ version: z.literal(1), record: RecordSchema }).strict();

const cut = (text: string, max = 200) => text.slice(0, max);

/** 依白名單重建，呼叫端多傳的欄位（例如分數）不會被存進去；解析器沒有的上限在這裡截斷，存檔不會因長度失敗。 */
function whitelist(record: StudentRecord): StudentRecord {
  const { enrollment, suggestedProfile, audit } = record;
  return {
    enrollment: {
      major: cut(enrollment.major),
      doubleMajor: cut(enrollment.doubleMajor),
      minors: enrollment.minors.slice(0, 5).map((minor) => cut(minor)),
      programs: enrollment.programs.slice(0, 20).map((program) => cut(program)),
      className: cut(enrollment.className),
    },
    suggestedProfile: {
      ...(suggestedProfile.level ? { level: suggestedProfile.level } : {}),
      ...(suggestedProfile.year ? { year: suggestedProfile.year } : {}),
      ...(suggestedProfile.additionalMajor ? { additionalMajor: suggestedProfile.additionalMajor } : {}),
    },
    courses: record.courses.slice(0, 400).map(({ term, code, title, credits, kind, generalEducation, result }) => ({
      term, code, title: cut(title), credits, kind, generalEducation: generalEducation.slice(0, 10).map((area) => cut(area, 20)), result,
    })),
    skippedCourseRows: record.skippedCourseRows,
    audit: {
      curriculumYear: audit.curriculumYear,
      checkedAt: audit.checkedAt,
      graduationCredits: audit.graduationCredits,
      earnedCredits: audit.earnedCredits,
      remainingCredits: audit.remainingCredits,
      requiredCredits: audit.requiredCredits,
      groupCredits: audit.groupCredits,
      missingRequired: audit.missingRequired.slice(0, 100).map(({ label, count, unit }) => ({ label: cut(label), count, ...(unit ? { unit } : {}) })),
      gaps: audit.gaps.slice(0, 20).map(({ area, label, text, items }) => ({
        area, label: cut(label), text: cut(text, 2000), items: items.slice(0, 100).map(({ label: itemLabel, count, unit }) => ({ label: cut(itemLabel), count, ...(unit ? { unit } : {}) })),
      })),
      unparsed: audit.unparsed.slice(0, 30).map((text) => cut(text, 2000)),
    },
  };
}

/** 存檔前一樣驗證；不合格就丟出錯誤，不存半套。 */
export function saveStudentRecord(storage: StorageLike, record: StudentRecord): void {
  const value = { version: 1, record: whitelist(record) };
  StoredSchema.parse(value);
  storage.setItem(RECORD_KEY, JSON.stringify(value));
}

export function loadStudentRecord(storage: StorageLike): StudentRecord | null {
  let raw: string | null;
  try {
    raw = storage.getItem(RECORD_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const parsed = parseUntrustedJson(raw, MAX_LENGTH);
  if (!parsed.ok) return null;
  const result = StoredSchema.safeParse(parsed.value);
  return result.success ? (result.data.record as StudentRecord) : null;
}

export function clearStudentRecord(storage: StorageLike): void {
  storage.setItem(RECORD_KEY, '');
}
