// 課程資料來源：建置期快照（data/snapshots/<學期>/）與人工時段更正（data/corrections/<學期>.json）。
// 以介面注入，測試時換成假資料。

import {
  applyCorrections,
  parseCorrections,
  parseTerm,
  pickDefaultTerm,
  type Course,
  type Term,
} from '@campusward/engine';

export interface TermInfo {
  term: string;
  count: number;
  fetchedAt: string;
}

export interface CatalogSource {
  listTerms(): Promise<TermInfo[]>;
  loadCourses(term: string): Promise<Course[]>;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json() as Promise<unknown>;
}

export const httpCatalogSource: CatalogSource = {
  async listTerms() {
    return (await getJson('/snapshots/index.json')) as TermInfo[];
  },
  async loadCourses(term) {
    const courses = (await getJson(`/snapshots/${term}/courses.json`)) as Course[];
    const corrections = await getJson(`/corrections/${term}.json`).then(parseCorrections).catch(() => null);
    return corrections ? courses.map((course) => applyCorrections(course, corrections)) : courses;
  },
};

/** 預設學期：已有資料的最新學期。 */
export function defaultTerm(terms: readonly TermInfo[]): string | null {
  const parsed = terms.map(({ term }) => parseTerm(term)).filter((term): term is Term => term !== null);
  const picked = pickDefaultTerm(parsed);
  return picked ? `${picked.year}${picked.semester}` : null;
}
