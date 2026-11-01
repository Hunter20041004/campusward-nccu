// 快照抽查（計畫 3.0）：平均抽 N 門，向官方查詢逐門比對主要欄位。npm run pipeline:spotcheck -- --term 1151
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffOfficialCourse, LIVE_FIELDS, parseTerm, type Course } from '../../packages/engine/src/index.ts';
import { buildQueryUrl, type OfficialRow } from './fetch.ts';


/** 依課號排序後等距抽樣，同一份快照每次抽到同一批。 */
export function sampleCodes(codes: readonly string[], count: number): string[] {
  const sorted = [...codes].sort();
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, index) => sorted[Math.floor((index * sorted.length) / count)]!);
}

/** 官方即時資料經同一套正規化後，和快照不同的欄位。 */
export function compareWithOfficial(course: Course, row: OfficialRow | null): string[] {
  const result = diffOfficialCourse(course, row);
  return result.status === 'changed' ? result.fields : result.status === 'same' ? [] : ['missing'];
}

export const COMPARED_FIELDS = LIVE_FIELDS;

if (process.argv[1]?.endsWith('spotcheck.ts')) {
  const termIndex = process.argv.indexOf('--term');
  const term = process.argv[termIndex + 1] ?? '';
  const count = Number(process.argv[process.argv.indexOf('--count') + 1]) || 20;
  if (!parseTerm(term)) {
    console.error('用法：npm run pipeline:spotcheck -- --term <四碼學期> [--count 20]');
    process.exit(1);
  }
  const courses = JSON.parse(readFileSync(join('data', 'snapshots', term, 'courses.json'), 'utf8')) as Course[];
  const byCode = new Map(courses.map((course) => [course.code, course]));
  let mismatches = 0;
  for (const code of sampleCodes([...byCode.keys()], count)) {
    await new Promise((resolve) => { setTimeout(resolve, 800); });
    const response = await fetch(buildQueryUrl(term, code), { headers: { accept: 'application/json' } });
    const rows = (await response.json()) as OfficialRow[];
    const row = rows.find((candidate) => String(candidate.subNum).trim() === code) ?? null;
    const differences = compareWithOfficial(byCode.get(code)!, row);
    if (differences.length) mismatches += 1;
    console.log(`${code} ${byCode.get(code)!.title}：${differences.length ? `不同 ${differences.join('、')}` : '相同'}`);
  }
  console.log(`抽查 ${count} 門，${mismatches} 門與官方不同。`);
  process.exitCode = mismatches ? 1 : 0;
}
