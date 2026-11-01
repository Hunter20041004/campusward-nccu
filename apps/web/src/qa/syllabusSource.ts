// 課綱資料來源：索引檔在第一次問答時才載入（MiniSearch 不進首頁的程式包），並存進 Cache API。
import type { SyllabusSection } from '@campusward/engine';
import type { SyllabusIndex } from './syllabusIndex.ts';

export interface CourseSyllabus {
  code: string;
  passages: { section: SyllabusSection; text: string }[];
}

export interface SyllabusSource {
  terms(): Promise<string[]>;
  loadIndex(term: string): Promise<SyllabusIndex>;
  loadCourse(term: string, code: string): Promise<CourseSyllabus | null>;
}

const CACHE = 'campusward-syllabi';

async function cachedText(url: string): Promise<string> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.text();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(url, response.clone());
    return await response.text();
  } catch {
    // 不支援 Cache API（或被封鎖）時直接抓。
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
}

export const httpSyllabusSource: SyllabusSource = {
  async terms() {
    const response = await fetch('/syllabi/index.json');
    return response.ok ? ((await response.json()) as string[]) : [];
  },
  async loadIndex(term) {
    const [{ loadSyllabusIndex }, text] = await Promise.all([import('./syllabusIndex.ts'), cachedText(`/syllabi/${term}/index.json`)]);
    return loadSyllabusIndex(text);
  },
  async loadCourse(term, code) {
    if (!/^[0-9A-Z]{9}$/.test(code)) return null;
    const response = await fetch(`/syllabi/${term}/courses/${code}.json`);
    return response.ok ? ((await response.json()) as CourseSyllabus) : null;
  },
};
