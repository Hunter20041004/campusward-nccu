// 一次性抓取某學期的全校課程快照：npm run pipeline -- --term 1151
// 每日自動排程（計畫 2.4）依使用者決定暫緩。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchTermRows, scheduleTextAnomalies, UNIT_LIST_URL, unitCodes } from './fetch.ts';
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
const unitResponse = await fetch(UNIT_LIST_URL, { headers: { accept: 'application/json' } });
if (!unitResponse.ok) {
  console.error(`讀不到開課單位清單（HTTP ${unitResponse.status}），保留上一版。`);
  process.exit(1);
}
const units = unitCodes(await unitResponse.json());
const { rows, queries, truncated, crossCheck } = await fetchTermRows({
  term,
  units,
  onProgress: (done, pending) => {
    if (done % 10 === 0) console.log(`已查詢 ${done} 次，待查 ${pending}`);
  },
});
if (truncated.length) {
  console.error(`下列查詢切到最細仍回滿 500 筆，可能有遺漏，保留上一版：${truncated.join('、')}`);
  process.exit(1);
}
const result = buildSnapshot({ rows, term, queries, fetchedAt: new Date().toISOString(), ...(previousCount ? { previousCount } : {}) });
if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}
const anomalies = scheduleTextAnomalies(rows);
if (crossCheck.onlyInUnits.length) console.warn(`只有開課單位查得到的課（已併入，時段切分可能沒涵蓋）：${crossCheck.onlyInUnits.join('、')}`);
if (anomalies.length) console.warn(`上課時間格式不符的課：${anomalies.join('、')}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'courses.json'), serializeSnapshot(result.courses));
const meta = { ...result.meta, crossCheck: { units: units.length, ...crossCheck }, scheduleTextAnomalies: anomalies };
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`完成：${result.meta.count} 門課、查詢 ${queries} 次（含單位交叉驗證 ${crossCheck.unitQueries} 次）、略過 ${result.meta.rowIssues} 列、耗時 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
