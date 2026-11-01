import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { buildSyllabusArtifacts } from './src/qa/syllabusIndex.ts';

// 端到端測試以 CAMPUSWARD_DATA_DIR 指向合成資料。
const DATA_DIR = process.env.CAMPUSWARD_DATA_DIR ?? resolve(import.meta.dirname, '../../data');

const syllabusCache = new Map<string, ReturnType<typeof buildSyllabusArtifacts>>();

/** 把 data/snapshots、data/corrections 與課綱索引提供給網站：開發時直接讀檔，建置時輸出成靜態檔。 */
function courseData(): Plugin {
  const files = () => {
    const out = new Map<string, string>();
    const snapshotDir = join(DATA_DIR, 'snapshots');
    const index: unknown[] = [];
    for (const term of existsSync(snapshotDir) ? readdirSync(snapshotDir) : []) {
      const meta = join(snapshotDir, term, 'meta.json');
      const courses = join(snapshotDir, term, 'courses.json');
      if (!/^\d{4}$/.test(term) || !existsSync(meta) || !existsSync(courses)) continue;
      const { count, fetchedAt } = JSON.parse(readFileSync(meta, 'utf8')) as { count: number; fetchedAt: string };
      index.push({ term, count, fetchedAt });
      out.set(`snapshots/${term}/courses.json`, readFileSync(courses, 'utf8'));
    }
    out.set('snapshots/index.json', JSON.stringify(index));
    // 課綱語料 → 索引與每門課的全文檔（建索引要幾秒，依檔案修改時間快取）。
    const syllabusDir = join(DATA_DIR, 'syllabi');
    const syllabusTerms: string[] = [];
    for (const term of existsSync(syllabusDir) ? readdirSync(syllabusDir) : []) {
      const corpus = join(syllabusDir, term, 'corpus.jsonl');
      if (!/^\d{4}$/.test(term) || !existsSync(corpus)) continue;
      const stamp = `${corpus}:${statSync(corpus).mtimeMs}`;
      if (!syllabusCache.has(stamp)) syllabusCache.set(stamp, buildSyllabusArtifacts(readFileSync(corpus, 'utf8')));
      const built = syllabusCache.get(stamp)!;
      syllabusTerms.push(term);
      out.set(`syllabi/${term}/index.json`, built.index);
      built.courses.forEach((text, code) => out.set(`syllabi/${term}/courses/${code}.json`, text));
    }
    out.set('syllabi/index.json', JSON.stringify(syllabusTerms));
    const correctionDir = join(DATA_DIR, 'corrections');
    for (const name of existsSync(correctionDir) ? readdirSync(correctionDir) : []) {
      if (/^\d{4}\.json$/.test(name)) out.set(`corrections/${name}`, readFileSync(join(correctionDir, name), 'utf8'));
    }
    return out;
  };
  return {
    name: 'campusward-course-data',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]!.replace(/^\//, '');
        const body = files().get(path);
        if (body === undefined) return next();
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(body);
      });
    },
    generateBundle() {
      for (const [fileName, source] of files()) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}

/** public/_headers 裡「/*」那一段（Cloudflare Pages 格式），給 vite preview 用，讓端到端測試與正式站同一套標頭。 */
function siteHeaders(): Record<string, string> {
  const lines = readFileSync(resolve(import.meta.dirname, 'public/_headers'), 'utf8').split('\n');
  const headers: Record<string, string> = {};
  let inAll = false;
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inAll = line.trim() === '/*';
      continue;
    }
    const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
    if (inAll && match) headers[match[1]!.trim()] = match[2]!.trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), courseData()],
  // 不把小檔案內嵌成 data: 網址（CSP 的 font-src 只允許本站）。
  build: { sourcemap: false, assetsInlineLimit: 0 },
  preview: { headers: siteHeaders() },
});
