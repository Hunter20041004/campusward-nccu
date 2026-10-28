// 產生端到端測試用的合成課程快照（內容虛構，結構同真實快照）。執行：npx tsx apps/web/e2e/make-fixture.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { officialRow } from '../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { buildSnapshot, serializeSnapshot } from '../../../scripts/pipeline/snapshot.ts';

const rows = [
  officialRow({ subNum: '900001001', subNam: '統計學', teaNam: '王合成', subTime: '一234' }),
  officialRow({ subNum: '900002001', subNam: '會計學', teaNam: '林範例', subTime: '一34' }),
  officialRow({ subNum: '900003001', subNam: '英文（一）', teaNam: '陳虛構', subTime: '二D56', lmtKind: '外文通識', emiType: '是' }),
  officialRow({ subNum: '900004001', subNam: '夜間設計', teaNam: '黃合成', subTime: '三EF' }),
  officialRow({ subNum: '900005001', subNam: '收費專題', teaNam: '張範例', subTime: '五78', pay: '收費', gdeType: '碩士班', note: '＠備註:限本系學生' }),
];
const result = buildSnapshot({ rows, term: '1151', queries: 0, fetchedAt: '2026-10-28T00:00:00.000Z' });
if (!result.ok) throw new Error(result.reason);
const dir = join(import.meta.dirname, 'fixtures', 'data', 'snapshots', '1151');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'courses.json'), serializeSnapshot(result.courses));
writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(result.meta, null, 2)}\n`);
console.log(`寫入 ${result.courses.length} 門合成課程`);
