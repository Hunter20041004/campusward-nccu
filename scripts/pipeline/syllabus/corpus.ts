// 課綱語料（計畫 4.5 第 2 節的共用資料格式）：data/syllabi/<學期>/corpus.jsonl 與 meta.json。
// 一行一門課、依課號排序、欄位順序固定，同內容同位元組。所有文字欄位都已去個資。
// 原網址不存（網站由快照的 links.syllabus 取得）；沒有課綱或「尚未上傳」的課不寫入。

import { fetchSyllabusPages, sha256, syllabusTargets, type CourseLinks, type FetchPagesOptions } from './fetch.ts';
import { parseSyllabus, type WeekTopic } from './parse.ts';
import { addHits, scrub, type ScrubHits } from './scrub.ts';

export interface CorpusRecord {
  code: string;
  title: string;
  description: string;
  objectives: string;
  grading: string;
  prerequisite: string;
  weekly: WeekTopic[];
  weeklyText: string;
  /** 原始頁的 sha256。 */
  hash: string;
}

export interface CorpusMeta {
  term: string;
  fetchedAt: string;
  /** 成功取得的課綱頁（含尚未上傳頁）＝ parsed ＋ notUploaded。 */
  pages: number;
  parsed: number;
  notUploaded: number;
  /** 快照沒有可信任的課綱網址，或官方回 404。 */
  missing: number;
  /** 重試 3 次仍失敗、超過大小上限，或取得的頁面認不出來（維護頁、錯誤頁）。 */
  failed: number;
  scrubHits: ScrubHits;
}

export type RecordResult = { status: 'ok'; record: CorpusRecord; hits: ScrubHits } | { status: 'notUploaded' } | { status: 'unrecognized' };

export function buildRecord(code: string, bytes: Uint8Array): RecordResult {
  const parsed = parseSyllabus(bytes);
  if (parsed.status !== 'ok') return parsed;
  let hits: ScrubHits = {};
  const clean = (text: string) => {
    const result = scrub(text);
    hits = addHits(hits, result.hits);
    return result.text;
  };
  const { fields } = parsed;
  // 欄位順序即輸出順序，不要調整。
  const record: CorpusRecord = {
    code,
    title: clean(fields.title),
    description: clean(fields.description),
    objectives: clean(fields.objectives),
    grading: clean(fields.grading),
    prerequisite: clean(fields.prerequisite),
    weekly: fields.weekly.map(({ week, topic }) => ({ week, topic: clean(topic) })),
    weeklyText: clean(fields.weeklyText),
    hash: sha256(bytes),
  };
  return { status: 'ok', record, hits };
}

export function serializeCorpus(records: readonly CorpusRecord[]): string {
  return [...records]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((record) => `${JSON.stringify(record)}\n`)
    .join('');
}

export function serializeMeta(meta: CorpusMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export interface BuildOptions extends Omit<FetchPagesOptions, 'targets'> {
  term: string;
  courses: readonly CourseLinks[];
  fetchedAt: string;
  onPage?: (done: number, total: number, result: { code: string; status: string; changed?: boolean }) => void;
}

export async function buildCorpus(options: BuildOptions): Promise<{ corpus: string; meta: CorpusMeta; failures: string[]; changed: number }> {
  const { term, courses, fetchedAt, onPage, ...fetchOptions } = options;
  const { targets, missing } = syllabusTargets(courses);
  const records: CorpusRecord[] = [];
  const failures: string[] = [];
  let scrubHits: ScrubHits = {};
  let pages = 0;
  let notUploaded = 0;
  let missingCount = missing.length;
  let changed = 0;
  let done = 0;
  for await (const page of fetchSyllabusPages({ ...fetchOptions, targets })) {
    done += 1;
    if (page.status === 'missing') missingCount += 1;
    else if (page.status === 'failed') failures.push(`${page.code}：${page.reason}`);
    else {
      if (page.changed) changed += 1;
      const built = buildRecord(page.code, page.bytes);
      if (built.status === 'unrecognized') failures.push(`${page.code}：認不出的頁面（不是課綱範本，也不是「尚無教學大綱」公告）`);
      else {
        pages += 1;
        if (built.status === 'ok') {
          records.push(built.record);
          scrubHits = addHits(scrubHits, built.hits);
        } else notUploaded += 1;
      }
    }
    onPage?.(done, targets.length, { code: page.code, status: page.status, ...(page.status === 'ok' ? { changed: page.changed } : {}) });
  }
  return {
    corpus: serializeCorpus(records),
    meta: { term, fetchedAt, pages, parsed: records.length, notUploaded, missing: missingCount, failed: failures.length, scrubHits },
    failures,
    changed,
  };
}
