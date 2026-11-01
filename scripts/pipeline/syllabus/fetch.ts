// 建置期抓課綱頁（計畫 4.5 第 3 節）。只抓快照 links.syllabus 中經 trustedNccuUrl 放行的網址；
// 一次一個請求、兩次之間至少 1 秒（含重試）、最多 3 次、單頁 1.5 MB 上限、不跟隨轉址。
// 原始 HTML 只放在快取目錄（.cache/，不進版控），並記下 ETag／Last-Modified 供下次條件請求；
// 「有沒有變」以內容 sha256 判斷，不信任伺服器的 ETag。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { trustedNccuUrl } from '../../../packages/engine/src/index.ts';

export interface Target {
  code: string;
  url: string;
}

export interface CourseLinks {
  code: string;
  links?: { syllabus?: unknown };
}

/** 快照課程 → 要抓的頁面；沒有網址或網址不受信任的課算「沒有課綱」。 */
export function syllabusTargets(courses: readonly CourseLinks[]): { targets: Target[]; missing: string[] } {
  const targets: Target[] = [];
  const missing: string[] = [];
  for (const course of courses) {
    const url = trustedNccuUrl(course.links?.syllabus);
    if (url) targets.push({ code: course.code, url });
    else missing.push(course.code);
  }
  return { targets, missing };
}

export type PageResult =
  | { code: string; status: 'ok'; bytes: Uint8Array; sha256: string; changed: boolean; notModified: boolean }
  | { code: string; status: 'missing' }
  | { code: string; status: 'failed'; reason: string };

export interface FetchPagesOptions {
  targets: readonly Target[];
  cacheDir: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  minIntervalMs?: number;
  attempts?: number;
  maxBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface CacheEntry {
  url: string;
  etag?: string;
  lastModified?: string;
  sha256: string;
}

export const MAX_PAGE_BYTES = 1_500_000;
const USER_AGENT = 'CampuswardSyllabusPipeline/1.0 (+https://github.com/Hunter20041004/campusward-nccu)';

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

class TooLarge extends Error {}

/** 讀回應本文，超過上限立刻中止（不把整頁讀進記憶體）。 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new TooLarge(`頁面 ${declared} 位元組超過上限`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TooLarge(`頁面超過 ${maxBytes} 位元組上限`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function readCache(cacheDir: string, target: Target): { entry: CacheEntry; bytes: Uint8Array } | null {
  const metaPath = join(cacheDir, `${target.code}.json`);
  const htmlPath = join(cacheDir, `${target.code}.html`);
  if (!existsSync(metaPath) || !existsSync(htmlPath)) return null;
  try {
    const entry = JSON.parse(readFileSync(metaPath, 'utf8')) as CacheEntry;
    const bytes = new Uint8Array(readFileSync(htmlPath));
    if (entry.url !== target.url || sha256(bytes) !== entry.sha256) return null;
    return { entry, bytes };
  } catch {
    return null;
  }
}

function writeCache(cacheDir: string, code: string, entry: CacheEntry, bytes: Uint8Array) {
  writeFileSync(join(cacheDir, `${code}.html`), bytes);
  writeFileSync(join(cacheDir, `${code}.json`), `${JSON.stringify(entry)}\n`);
}

export async function* fetchSyllabusPages(options: FetchPagesOptions): AsyncGenerator<PageResult> {
  const {
    targets,
    cacheDir,
    fetchImpl = (url, init) => fetch(url, init),
    minIntervalMs = 1000,
    attempts = 3,
    maxBytes = MAX_PAGE_BYTES,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  mkdirSync(cacheDir, { recursive: true });
  let lastRequest = Number.NEGATIVE_INFINITY;
  const throttle = async () => {
    const wait = lastRequest + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequest = now();
  };

  for (const target of targets) {
    const cached = readCache(cacheDir, target);
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'text/html' };
    if (cached?.entry.etag) headers['if-none-match'] = cached.entry.etag;
    if (cached?.entry.lastModified) headers['if-modified-since'] = cached.entry.lastModified;

    let result: PageResult | null = null;
    let reason = '';
    for (let attempt = 1; attempt <= attempts && !result; attempt += 1) {
      await throttle();
      try {
        const response = await fetchImpl(target.url, { headers, redirect: 'error' });
        if (response.status === 304 && cached) {
          await response.body?.cancel();
          result = { code: target.code, status: 'ok', bytes: cached.bytes, sha256: cached.entry.sha256, changed: false, notModified: true };
        } else if (response.status === 404) {
          await response.body?.cancel();
          result = { code: target.code, status: 'missing' };
        } else if (!response.ok) {
          await response.body?.cancel();
          reason = `HTTP ${response.status}`;
        } else {
          const bytes = await readCapped(response, maxBytes);
          const hash = sha256(bytes);
          const entry: CacheEntry = { url: target.url, sha256: hash };
          const etag = response.headers.get('etag');
          const lastModified = response.headers.get('last-modified');
          if (etag) entry.etag = etag;
          if (lastModified) entry.lastModified = lastModified;
          writeCache(cacheDir, target.code, entry, bytes);
          result = { code: target.code, status: 'ok', bytes, sha256: hash, changed: hash !== cached?.entry.sha256, notModified: false };
        }
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
        if (error instanceof TooLarge) break; // 超過上限不重試
      }
    }
    yield result ?? { code: target.code, status: 'failed', reason };
  }
}
