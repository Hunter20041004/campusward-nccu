import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { fetchSyllabusPages, syllabusTargets, type PageResult, type FetchPagesOptions } from '../fetch.ts';

const url = (code: string) => `https://newdoc.nccu.edu.tw/teaschm/1151/schmPrv.jsp-num=${code}.html`;
const html = (text: string) => `<html><body>${text}</body></html>`;

interface Served { status?: number; body?: string | Uint8Array; headers?: Record<string, string> }
type Handler = (request: { url: string; headers: Record<string, string> }) => Served | Error;

/** 假的伺服器與時鐘：sleep 會把時鐘往前推，用來檢查請求間隔。 */
function fakeServer(handler: Handler) {
  let clock = 0;
  const calls: { url: string; at: number; headers: Record<string, string>; init: RequestInit | undefined }[] = [];
  const fetchImpl = async (target: string, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url: target, at: clock, headers, init });
    const served = handler({ url: target, headers });
    if (served instanceof Error) throw served;
    return new Response(served.status === 304 ? null : served.body ?? '', { status: served.status ?? 200, headers: served.headers ?? {} });
  };
  return {
    calls,
    options: {
      fetchImpl,
      now: () => clock,
      sleep: async (ms: number) => { clock += ms; },
    } satisfies Partial<FetchPagesOptions>,
  };
}

async function collect(iterable: AsyncIterable<PageResult>) {
  const results: PageResult[] = [];
  for await (const result of iterable) results.push(result);
  return results;
}

let cacheDir = '';
beforeEach(() => { cacheDir = mkdtempSync(join(tmpdir(), 'syllabi-')); });
afterEach(() => { rmSync(cacheDir, { recursive: true, force: true }); });

describe('syllabusTargets', () => {
  test('only trusted NCCU https links are fetched; the rest are missing', () => {
    const { targets, missing } = syllabusTargets([
      { code: '000211011', links: { syllabus: url('000211011') } },
      { code: '000217001', links: { syllabus: 'http://newdoc.nccu.edu.tw/plain.html' } },
      { code: '000217002', links: { syllabus: 'https://evil.example.com/nccu.edu.tw.html' } },
      { code: '000217003', links: {} },
      { code: '000217004' },
    ]);
    expect(targets).toEqual([{ code: '000211011', url: url('000211011') }]);
    expect(missing).toEqual(['000217001', '000217002', '000217003', '000217004']);
  });
});

describe('fetchSyllabusPages', () => {
  test('one request at a time, at least a second apart, without following redirects', async () => {
    const server = fakeServer(() => ({ body: html('ok') }));
    const targets = ['a', 'b', 'c'].map((code) => ({ code, url: url(code) }));
    const results = await collect(fetchSyllabusPages({ targets, cacheDir, ...server.options }));
    expect(results.map(({ status }) => status)).toEqual(['ok', 'ok', 'ok']);
    const gaps = server.calls.slice(1).map((call, index) => call.at - server.calls[index]!.at);
    expect(gaps.every((gap) => gap >= 1000)).toBe(true);
    expect(server.calls.every(({ init }) => init?.redirect === 'error')).toBe(true);
  });

  test('retries three times with the same spacing, then reports failure', async () => {
    let attempts = 0;
    const server = fakeServer(() => { attempts += 1; return attempts < 3 ? { status: 503 } : { body: html('third time') }; });
    const [first] = await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, ...server.options }));
    expect(first?.status).toBe('ok');
    expect(server.calls).toHaveLength(3);
    expect(server.calls[2]!.at - server.calls[1]!.at).toBeGreaterThanOrEqual(1000);

    const broken = fakeServer(() => new Error('network down'));
    const [failed] = await collect(fetchSyllabusPages({ targets: [{ code: 'b', url: url('b') }], cacheDir, ...broken.options }));
    expect(failed).toMatchObject({ code: 'b', status: 'failed' });
    expect(broken.calls).toHaveLength(3);
  });

  test('a 404 means the course has no syllabus page', async () => {
    const server = fakeServer(() => ({ status: 404 }));
    const [result] = await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, ...server.options }));
    expect(result).toEqual({ code: 'a', status: 'missing' });
    expect(server.calls).toHaveLength(1);
  });

  test('pages over the size cap fail without retrying', async () => {
    const big = new Uint8Array(2_000);
    const declared = fakeServer(() => ({ body: big, headers: { 'content-length': String(big.length) } }));
    const [tooLong] = await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, maxBytes: 1_000, ...declared.options }));
    expect(tooLong).toMatchObject({ status: 'failed' });
    expect(declared.calls).toHaveLength(1);

    const streamed = fakeServer(() => ({ body: big }));
    const [alsoTooLong] = await collect(fetchSyllabusPages({ targets: [{ code: 'b', url: url('b') }], cacheDir, maxBytes: 1_000, ...streamed.options }));
    expect(alsoTooLong).toMatchObject({ status: 'failed' });
    expect(existsSync(join(cacheDir, 'b.html'))).toBe(false);
  });

  test('the default cap is 1.5 MB', async () => {
    const server = fakeServer(() => ({ body: new Uint8Array(1_500_001) }));
    const [result] = await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, ...server.options }));
    expect(result).toMatchObject({ status: 'failed' });
  });

  test('conditional requests reuse the cached page and changes are decided by content hash', async () => {
    let version = 'v1';
    const server = fakeServer(({ headers }) => {
      if (headers['if-none-match'] === `"${version}"`) return { status: 304 };
      return { body: html(version === 'v3' ? 'v2' : version), headers: { etag: `"${version}"`, 'last-modified': 'Wed, 09 Sep 2026 01:58:23 GMT' } };
    });
    const run = async () => (await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, ...server.options })))[0]!;

    const first = await run();
    expect(first).toMatchObject({ status: 'ok', changed: true, notModified: false });
    expect(server.calls[0]!.headers['if-none-match']).toBeUndefined();

    const second = await run();
    expect(server.calls[1]!.headers).toMatchObject({ 'if-none-match': '"v1"', 'if-modified-since': 'Wed, 09 Sep 2026 01:58:23 GMT' });
    expect(second).toMatchObject({ status: 'ok', changed: false, notModified: true });
    if (second.status === 'ok' && first.status === 'ok') {
      expect(new TextDecoder().decode(second.bytes)).toBe(html('v1'));
      expect(second.sha256).toBe(first.sha256);
    }

    version = 'v2';
    expect(await run()).toMatchObject({ status: 'ok', changed: true, notModified: false });
    // 伺服器換了 ETag 但內容一樣：不算變動。
    version = 'v3';
    expect(await run()).toMatchObject({ status: 'ok', changed: false, notModified: false });
  });

  test('raw HTML is kept only in the cache directory, keyed by course code', async () => {
    const server = fakeServer(() => ({ body: html('raw'), headers: { etag: '"x"' } }));
    await collect(fetchSyllabusPages({ targets: [{ code: '000211011', url: url('000211011') }], cacheDir, ...server.options }));
    expect(readdirSync(cacheDir).sort()).toEqual(['000211011.html', '000211011.json']);
    expect(readFileSync(join(cacheDir, '000211011.html'), 'utf8')).toBe(html('raw'));
    expect(JSON.parse(readFileSync(join(cacheDir, '000211011.json'), 'utf8'))).toMatchObject({ url: url('000211011'), etag: '"x"' });
  });

  test('a cached page for a different address is not reused', async () => {
    const server = fakeServer(() => ({ body: html('page'), headers: { etag: '"same"' } }));
    await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a') }], cacheDir, ...server.options }));
    await collect(fetchSyllabusPages({ targets: [{ code: 'a', url: url('a-moved') }], cacheDir, ...server.options }));
    expect(server.calls[1]!.headers['if-none-match']).toBeUndefined();
  });
});
