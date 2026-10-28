/** 學期（民國學年＋上下學期）。全專案的學期都由資料或參數提供，不寫死。 */
export interface Term {
  year: number;
  semester: 1 | 2;
}

export function parseTerm(text: string): Term | null {
  const match = /^(\d{3})-?([12])$/.exec(String(text).trim());
  if (!match) return null;
  return { year: Number(match[1]), semester: match[2] === '1' ? 1 : 2 };
}

/** 官方查詢用的緊湊代碼：學年＋學期，例如「YYYS」。 */
export function formatTerm(term: Term): string {
  return `${term.year}${term.semester}`;
}

/** 給學生看的寫法：「學年-學期」。 */
export function termLabel(term: Term): string {
  return `${term.year}-${term.semester}`;
}

export function isRowInTerm(row: { y?: unknown; s?: unknown }, term: Term): boolean {
  return String(row.y) === String(term.year) && String(row.s) === String(term.semester);
}

const order = (term: Term) => term.year * 10 + term.semester;

/** 預設學期：已有課程資料的學期中最新的一個（設計第 5 節「最近一個要選課的學期」）。 */
export function pickDefaultTerm(available: readonly Term[]): Term | null {
  return available.reduce<Term | null>((latest, term) => (!latest || order(term) > order(latest) ? term : latest), null);
}
