import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

/** 把 data/snapshots 與 data/corrections 提供給網站：開發時直接讀檔，建置時輸出成靜態檔。 */
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

export default defineConfig({
  plugins: [react(), tailwindcss(), courseData()],
  build: { sourcemap: false },
});
