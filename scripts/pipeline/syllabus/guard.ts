// 語料寫入門檻（獨立審查 2026-11-01）：只看「失敗」擋不住官方站整批回 404 或「尚無教學大綱」的情況，
// 那些頁算成沒有課綱或尚未上傳，失敗數是 0。所以也比對上一版寫入的門數，掉太多就保留上一版。

import type { CorpusMeta } from './corpus.ts';

/** 失敗超過這個比例就不覆蓋上一版。 */
export const MAX_FAILED_RATIO = 0.02;
/** 寫入門數比上一版少超過這個比例就不覆蓋上一版（正常學期間的課綱增減遠小於此）。 */
export const MAX_PARSED_DROP_RATIO = 0.05;

/** 不該寫入時回傳原因；可以寫入回傳 null。 */
export function writeBlocker(meta: CorpusMeta, courseCount: number, previous?: Pick<CorpusMeta, 'parsed'>): string | null {
  if (meta.failed > courseCount * MAX_FAILED_RATIO) {
    return `失敗 ${meta.failed} 頁超過 ${MAX_FAILED_RATIO * 100}%，保留上一版語料。`;
  }
  if (previous && meta.parsed < previous.parsed * (1 - MAX_PARSED_DROP_RATIO)) {
    return `這次只寫入 ${meta.parsed} 門，比上一版 ${previous.parsed} 門少超過 ${MAX_PARSED_DROP_RATIO * 100}%（可能是官方站整批回 404 或維護頁），保留上一版語料。`;
  }
  if (meta.parsed === 0) return '這次寫入 0 門課，保留上一版語料。';
  return null;
}
