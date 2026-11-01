// 課綱索引（計畫 4.5）：建置時由 data/syllabi/<學期>/corpus.jsonl 產生，瀏覽器載入後在本機搜尋。
// 調查（2026-11-01）：詞轉十六進位才載得快；去掉出現在 2% 以上段落的常見詞，索引才壓得進 3 MB。

import { parseSyllabusLine, syllabusPassages, toSearchTerm, tokenizeForSearch, type SyllabusSection } from '@campusward/engine';
import MiniSearch from 'minisearch';

const COMMON_RATIO = 0.004;
const SECTIONS: SyllabusSection[] = ['課名', '簡介', '目標', '評分', '先修', '每週主題', '每週進度'];
// 真實語料全部索引 gzip 3.72 MB，超過 3 MB 門檻；去掉每週進度原文後 2.95 MB（2026-11-01 實測）。
const INDEXED = new Set<SyllabusSection>(['課名', '簡介', '目標', '評分', '先修', '每週主題']);

interface PassageDoc {
  id: number;
  text: string;
  /** 評分區塊另放一個欄位、不剔除常見詞：「期中考」「出席」「報告」這些詞到處都有，但問評分時正需要它們。 */
  grading: string;
  /** 課名也另放、不剔除：「統計」「哲學」這類學科詞在全語料很常見，但課名很短、佔空間小，必須找得到。 */
  title: string;
}

export interface SyllabusIndexFile {
  /** MiniSearch.toJSON() 的結果（直接存物件，避免再包一層字串產生大量跳脫字元）。 */
  index: ReturnType<MiniSearch['toJSON']>;
  /** 依段落編號順序，每門課一列：[課號, 各段落的區塊編號串成的字串]。 */
  courses: [string, string][];
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
  fields: ['title', 'text', 'grading'],
  idField: 'id',
  tokenize: (text: string) => tokenizeForSearch(text),
  processTerm: (term: string, field?: string) => (field === 'text' && common.has(term) ? null : toSearchTerm(term)),
  // 查詢時不剔除：常見詞在一般欄位本來就不存在，只會比對到評分欄位。
  searchOptions: { processTerm: (term: string) => toSearchTerm(term) },
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
      // 每週進度原文（沒有週次表的課）只放全文檔、不進索引：它是最後一個區塊，不影響其他段落的序號。
      if (!INDEXED.has(section)) return;
      docs.push({
        id: docs.length,
        title: section === '課名' ? text : '',
        grading: section === '評分' ? text : '',
        text: section === '課名' || section === '評分' ? '' : text,
      });
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
  const grouped: [string, string][] = [];
  passages.forEach(([code, section]) => {
    const last = grouped.at(-1);
    if (last?.[0] === code) last[1] += String(section);
    else grouped.push([code, String(section)]);
  });
  const file: SyllabusIndexFile = { index: search.toJSON(), courses: grouped, common };
  return { index: JSON.stringify(file), courses, stats: { courses: entries.length, passages: docs.length, common: common.length, skipped } };
}

export function loadSyllabusIndex(text: string): SyllabusIndex {
  const file = JSON.parse(text) as SyllabusIndexFile;
  const firstPassage = new Map<string, number>();
  const passages: [string, number][] = [];
  file.courses.forEach(([code, sections]) => {
    firstPassage.set(code, passages.length);
    [...sections].forEach((section) => passages.push([code, Number(section)]));
  });
  return { search: MiniSearch.loadJS<PassageDoc>(file.index, options(new Set(file.common))), passages, firstPassage };
}

export { searchSyllabi, type SyllabusHit } from './syllabusSearch.ts';
