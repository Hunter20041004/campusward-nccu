// 一次性抓取某學期的全校課程快照：npm run pipeline -- --term 1151
// 每日自動排程（計畫 2.4）依使用者決定暫緩。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchTermRows } from './fetch.ts';
import { buildSnapshot, serializeSnapshot } from './snapshot.ts';

const termIndex = process.argv.indexOf('--term');
const term = termIndex >= 0 ? process.argv[termIndex + 1] : undefined;
if (!term || !/^\d{4}$/.test(term)) {
  console.error('用法：npm run pipeline -- --term <四碼學期>');
  process.exit(1);
}

const dir = join('data', 'snapshots', term);
const metaPath = join(dir, 'meta.json');
const previousCount = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as { count?: number }).count : undefined;

const started = Date.now();
const { rows, queries, truncated } = await fetchTermRows({
  term,
  onProgress: (done, pending) => {
    if (done % 50 === 0) console.log(`已查詢 ${done} 次，待查 ${pending}`);
  },
});
const result = buildSnapshot({ rows, term, queries, fetchedAt: new Date().toISOString(), ...(previousCount ? { previousCount } : {}) });
if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}
if (truncated.length) console.warn(`下列前綴切到最長仍被截斷，可能有遺漏：${truncated.join('、')}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'courses.json'), serializeSnapshot(result.courses));
writeFileSync(metaPath, `${JSON.stringify(result.meta, null, 2)}\n`);
console.log(`完成：${result.meta.count} 門課、查詢 ${queries} 次、略過 ${result.meta.rowIssues} 列、耗時 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
