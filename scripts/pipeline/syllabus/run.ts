// 建置期抓某學期的課綱語料：npm run pipeline:syllabi -- --term <四碼學期>
// 讀 data/snapshots/<學期>/courses.json，寫 data/syllabi/<學期>/corpus.jsonl 與 meta.json；
// 原始頁只放 .cache/syllabi/<學期>/（不進版控）。每秒最多 1 個請求，全校約 2,900 頁需時約 50 分鐘。
// 加 --offline 只用快取重建（改了解析或去個資規則後用），不送任何請求，抓取時間沿用上一版。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCorpus, serializeMeta } from './corpus.ts';
import type { CourseLinks } from './fetch.ts';

/** 失敗超過這個比例就不覆蓋上一版。 */
const MAX_FAILED_RATIO = 0.02;

const termIndex = process.argv.indexOf('--term');
const term = termIndex >= 0 ? process.argv[termIndex + 1] : undefined;
if (!term || !/^\d{4}$/.test(term)) {
  console.error('用法：npm run pipeline:syllabi -- --term <四碼學期>');
  process.exit(1);
}

const snapshotPath = join('data', 'snapshots', term, 'courses.json');
if (!existsSync(snapshotPath)) {
  console.error(`找不到課程快照 ${snapshotPath}，請先跑 npm run pipeline -- --term ${term}`);
  process.exit(1);
}
const offline = process.argv.includes('--offline');
const dir = join('data', 'syllabi', term);
const metaPath = join(dir, 'meta.json');
const previousFetchedAt = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as { fetchedAt?: string }).fetchedAt : undefined;
if (offline && !previousFetchedAt) {
  console.error('離線重建需要上一版 meta.json 的抓取時間，請先完整抓一次。');
  process.exit(1);
}
const courses = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CourseLinks[];

const started = Date.now();
const { corpus, meta, failures, changed } = await buildCorpus({
  term,
  courses,
  cacheDir: join('.cache', 'syllabi', term),
  fetchedAt: offline ? previousFetchedAt! : new Date().toISOString(),
  offline,
  onPage: (done, total) => {
    if (done % 100 === 0 || done === total) {
      const minutes = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`已處理 ${done}/${total} 頁（${minutes} 分鐘）`);
    }
  },
});

if (failures.length) console.warn(`抓取失敗 ${failures.length} 頁：\n${failures.join('\n')}`);
if (meta.failed > courses.length * MAX_FAILED_RATIO) {
  console.error(`失敗 ${meta.failed} 頁超過 ${MAX_FAILED_RATIO * 100}%，保留上一版語料。`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'corpus.jsonl'), corpus);
writeFileSync(metaPath, serializeMeta(meta));
console.log(`完成：${courses.length} 門課、取得 ${meta.pages} 頁（內容有變 ${changed} 頁）、寫入 ${meta.parsed} 門、尚未上傳 ${meta.notUploaded}、沒有課綱 ${meta.missing}、失敗 ${meta.failed}`);
console.log(`去個資：${JSON.stringify(meta.scrubHits)}；耗時 ${((Date.now() - started) / 60000).toFixed(1)} 分鐘`);
