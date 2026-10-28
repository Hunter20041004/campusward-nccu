// 快照檢查與寫出（計畫 2.2）：轉成引擎的課程格式、檢查筆數與格式錯誤率、固定排序。

import { normalizeOfficialRows, parseTerm, type Course } from '../../packages/engine/src/index.ts';

export interface SnapshotMeta {
  term: string;
  fetchedAt: string;
  count: number;
  queries: number;
  rowIssues: number;
  issueSamples: string[];
}

export type SnapshotResult =
  | { ok: true; courses: Course[]; meta: SnapshotMeta }
  | { ok: false; reason: string };

const MIN_RATIO = 0.9;
const MAX_ISSUE_RATE = 0.01;

export function buildSnapshot(input: { rows: unknown[]; term: string; queries: number; fetchedAt: string; previousCount?: number }): SnapshotResult {
  const term = parseTerm(input.term);
  if (!term) return { ok: false, reason: `學期代碼不正確：${input.term}` };
  if (!input.rows.length) return { ok: false, reason: '沒有抓到任何課程，保留上一版。' };
  const { courses, issues } = normalizeOfficialRows(input.rows, term);
  // 一列可能有多個問題（例如不受信任的網址），以「被拒絕的列」計算錯誤率。
  const rejected = input.rows.length - courses.length;
  const rate = rejected / input.rows.length;
  if (rate > MAX_ISSUE_RATE) {
    return { ok: false, reason: `格式錯誤 ${rejected} 列（${(rate * 100).toFixed(1)}%）超過 1%，保留上一版。` };
  }
  if (input.previousCount && courses.length < input.previousCount * MIN_RATIO) {
    return { ok: false, reason: `筆數 ${courses.length} 低於上一版 ${input.previousCount} 的 90%，保留上一版。` };
  }
  const sorted = [...courses].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return {
    ok: true,
    courses: sorted,
    meta: {
      term: input.term,
      fetchedAt: input.fetchedAt,
      count: sorted.length,
      queries: input.queries,
      rowIssues: rejected,
      issueSamples: issues.slice(0, 20),
    },
  };
}

export function serializeSnapshot(courses: readonly Course[]): string {
  return `${JSON.stringify(courses)}\n`;
}
