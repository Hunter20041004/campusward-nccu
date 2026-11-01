// 單門課即時向官方確認（計畫 3.2）：只把學期與課號送到政大公開查詢，經同一套正規化後和快照比對。
// 引擎不直接用 fetch（見 eslint 規則），由呼叫端注入。

import { parseTerm } from '../term.ts';
import { rowToCourse, type Course } from './course.ts';

const OFFICIAL_ORIGIN = 'https://es.nccu.edu.tw';
export const LIVE_FIELDS = ['title', 'teacher', 'credits', 'scheduleText', 'classroom', 'meetings', 'restrictionText'] as const;
export type LiveField = (typeof LIVE_FIELDS)[number];

export type LiveCheck =
  | { status: 'same' }
  | { status: 'changed'; fields: LiveField[]; live: Course }
  | { status: 'missing' }
  | { status: 'failed' };

/** 官方查詢網址：`:sem=學期 關鍵字或條件 `。 */
export function officialQueryUrl(term: string, keyword: string): URL {
  return new URL(`/course/zh-TW/${encodeURIComponent(`:sem=${term} ${keyword} `)}/`, OFFICIAL_ORIGIN);
}

/** 官方的一列經正規化後，和快照不同的欄位；查不到或格式不對時回 missing。 */
export function diffOfficialCourse(course: Course, row: unknown): LiveCheck {
  if (!row) return { status: 'missing' };
  const term = parseTerm(course.term);
  const live = term ? rowToCourse(row, term).course : null;
  if (!live) return { status: 'missing' };
  const fields = LIVE_FIELDS.filter((field) => JSON.stringify(course[field]) !== JSON.stringify(live[field]));
  return fields.length ? { status: 'changed', fields, live } : { status: 'same' };
}

/** fetch 回應中用到的部分。 */
export interface LiveResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export async function checkCourseLive(course: Course, fetchImpl: (url: URL) => Promise<LiveResponse>): Promise<LiveCheck> {
  try {
    const response = await fetchImpl(officialQueryUrl(course.term, course.code));
    if (!response.ok) return { status: 'failed' };
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return { status: 'failed' };
    const row = rows.find((candidate) => String((candidate as { subNum?: unknown })?.subNum ?? '').trim() === course.code);
    return diffOfficialCourse(course, row);
  } catch {
    return { status: 'failed' };
  }
}
