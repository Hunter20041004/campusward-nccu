// 課綱索引（計畫 4.5）：建置時由 data/syllabi/<學期>/corpus.jsonl 產生，瀏覽器載入後在本機搜尋。
// 調查（2026-11-01）：詞轉十六進位才載得快；去掉出現在 2% 以上段落的常見詞，索引才壓得進 3 MB。

import { parseSyllabusLine, syllabusPassages, toSearchTerm, tokenizeForSearch, type SyllabusSection } from '@campusward/engine';
import MiniSearch from 'minisearch';

const COMMON_RATIO = 0.02;
const SECTIONS: SyllabusSection[] = ['課名', '簡介', '目標', '評分', '先修', '每週主題', '每週進度'];

interface PassageDoc {
  id: number;
  text: string;
}

export interface SyllabusIndexFile {
  /** MiniSearch.toJSON() 的字串。 */
  index: string;
  /** 段落編號 → [課號, 區塊編號]。 */
  passages: [string, number][];
  /** 去掉的常見詞（原字，不是十六進位）。 */
  common: string[];
}

export interface SyllabusIndex {
  search: MiniSearch<PassageDoc>;
  passages: [string, number][];
  /** 課號 → 這門課第一個段落的編號。 */
  firstPassage: Map<string, number>;
}


const options = (common: ReadonlySet<string>) => ({
  fields: ['text'],
  idField: 'id',
  tokenize: (text: string) => tokenizeForSearch(text),
  processTerm: (term: string) => (common.has(term) ? null : toSearchTerm(term)),
});

export function buildSyllabusArtifacts(corpus: string) {
  const courses = new Map<string, string>();
  const docs: PassageDoc[] = [];
  const passages: [string, number][] = [];
  let skipped = 0;
  const entries = corpus.split('\n').filter((line) => line.trim()).flatMap((line) => {
    const entry = parseSyllabusLine(line);
    if (!entry) skipped += 1;
    return entry ? [entry] : [];
  }).sort((a, b) => (a.code < b.code ? -1 : 1));
  entries.forEach((entry) => {
    const parts = syllabusPassages(entry);
    courses.set(entry.code, JSON.stringify({ code: entry.code, passages: parts.map(({ section, text }) => ({ section, text })) }));
    parts.forEach(({ section, text }) => {
      docs.push({ id: docs.length, text });
      passages.push([entry.code, SECTIONS.indexOf(section)]);
    });
  });
  const frequency = new Map<string, number>();
  docs.forEach(({ text }) => new Set(tokenizeForSearch(text)).forEach((token) => frequency.set(token, (frequency.get(token) ?? 0) + 1)));
  // 小語料（測試、剛開學只有幾門課）不去常見詞，避免把所有詞都去掉。
  const common = docs.length >= 200
    ? [...frequency].filter(([, count]) => count / docs.length >= COMMON_RATIO).map(([token]) => token).sort()
    : [];
  const search = new MiniSearch<PassageDoc>(options(new Set(common)));
  search.addAll(docs);
  const file: SyllabusIndexFile = { index: JSON.stringify(search), passages, common };
  return { index: JSON.stringify(file), courses, stats: { courses: entries.length, passages: docs.length, common: common.length, skipped } };
}

export function loadSyllabusIndex(text: string): SyllabusIndex {
  const file = JSON.parse(text) as SyllabusIndexFile;
  const firstPassage = new Map<string, number>();
  file.passages.forEach(([code], id) => {
    if (!firstPassage.has(code)) firstPassage.set(code, id);
  });
  return { search: MiniSearch.loadJSON<PassageDoc>(file.index, options(new Set(file.common))), passages: file.passages, firstPassage };
}

export { searchSyllabi, type SyllabusHit } from './syllabusSearch.ts';
