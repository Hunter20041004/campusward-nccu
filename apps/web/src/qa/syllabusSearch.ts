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

export function searchSyllabi(index: SyllabusIndex, query: string, limit = 20): SyllabusHit[] {
  if (!tokenizeForSearch(query).length) return [];
  return index.search.search(query, { combineWith: 'OR' }).slice(0, limit).flatMap((result) => {
    const id = Number(result.id);
    const passage = index.passages[id];
    return passage ? [{ code: passage[0], section: SECTIONS[passage[1]]!, passage: id - (index.firstPassage.get(passage[0]) ?? id), score: result.score }] : [];
  });
}
