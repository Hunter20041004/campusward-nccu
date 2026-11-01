// 搜尋已載入的課綱索引。只用型別引用 MiniSearch，首頁程式包不會帶入 MiniSearch。
import { tokenizeForSearch, type SyllabusSection } from '@campusward/engine';
import type { SyllabusIndex } from './syllabusIndex.ts';

const SECTIONS: SyllabusSection[] = ['課名', '簡介', '目標', '評分', '先修', '每週主題', '每週進度'];

export interface SyllabusHit {
  code: string;
  section: SyllabusSection;
  /** 段落在這門課全文檔裡的序號。 */
  passage: number;
  score: number;
}

// 問句的填充詞（「哪些課」「有教…的課嗎」）會比對到大量段落、蓋過真正的關鍵詞。只在句首、句尾去掉，
// 句中的「課程」「相關」可能是主題詞（課程發展、相關分析），不動。
const LEADING = /^(?:請問|我想|想要|想學|有沒有|有教|有|哪些|哪一?門|什麼)+/;
const TRAILING = /(?:的課程|的課|課程|相關的課|課嗎|嗎|呢|有哪些)+$/;

export function searchSyllabi(index: SyllabusIndex, query: string, limit = 20): SyllabusHit[] {
  const trimmed = query.normalize('NFKC').replace(/[?？。，,！!\s]+$/u, '').trim();
  const cleaned = trimmed.replace(LEADING, '').replace(TRAILING, '').trim() || trimmed || query;
  if (!tokenizeForSearch(cleaned).length) return [];
  return index.search.search(cleaned, { combineWith: 'OR' }).slice(0, limit).flatMap((result) => {
    const id = Number(result.id);
    const passage = index.passages[id];
    return passage ? [{ code: passage[0], section: SECTIONS[passage[1]]!, passage: id - (index.firstPassage.get(passage[0]) ?? id), score: result.score }] : [];
  });
}
