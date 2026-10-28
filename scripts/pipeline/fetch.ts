// 建置期抓取某學期的全校課程（計畫 2.1）。官方查詢是「包含比對」且單次最多回 500 筆：
// 從 0–9、A–Z 出發，回傳達上限就多加一碼往下切，最後依課號去重。限制併發與請求間隔，不給官方主機添負擔。

export const START_KEYS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const OFFICIAL_ORIGIN = 'https://es.nccu.edu.tw';

export type OfficialRow = Record<string, unknown> & { subNum?: unknown; y?: unknown; s?: unknown };

export function buildQueryUrl(term: string, keyword: string): URL {
  return new URL(`/course/zh-TW/${encodeURIComponent(`:sem=${term} ${keyword} `)}/`, OFFICIAL_ORIGIN);
}

export interface FetchOptions {
  term: string;
  fetchImpl?: (url: URL) => Promise<Response>;
  cap?: number;
  concurrency?: number;
  minIntervalMs?: number;
  maxQueries?: number;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onProgress?: (done: number, pending: number) => void;
}

export interface FetchResult {
  rows: OfficialRow[];
  queries: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function fetchTermRows(options: FetchOptions): Promise<FetchResult> {
  const {
    term,
    fetchImpl = (url) => fetch(url, { headers: { accept: 'application/json' } }),
    cap = 500,
    concurrency = 4,
    minIntervalMs = 200,
    maxQueries = 3000,
    attempts = 3,
    sleep = defaultSleep,
    now = Date.now,
    onProgress,
  } = options;
  const year = term.slice(0, 3);
  const semester = term.slice(3);
  const rows = new Map<string, OfficialRow>();
  const queue = [...START_KEYS];
  let queries = 0;
  let nextSlot = 0;

  // 全域節流：每個請求依序預約時間槽，兩次請求間隔至少 minIntervalMs。
  const throttle = async () => {
    const current = now();
    const slot = Math.max(current, nextSlot);
    nextSlot = slot + minIntervalMs;
    if (slot > current) await sleep(slot - current);
  };

  const query = async (keyword: string): Promise<OfficialRow[]> => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await throttle();
      try {
        const response = await fetchImpl(buildQueryUrl(term, keyword));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error('回傳不是陣列');
        return body as OfficialRow[];
      } catch {
        // 重試；用完次數才整體失敗（保留上一版快照由呼叫端處理）。
      }
    }
    throw new Error(`查詢「${keyword}」失敗 ${attempts} 次`);
  };

  const worker = async () => {
    while (queue.length) {
      const keyword = queue.shift()!;
      queries += 1;
      if (queries > maxQueries) throw new Error(`查詢次數超過上限 ${maxQueries}`);
      const result = await query(keyword);
      if (result.length >= cap) queue.push(...START_KEYS.map((key) => `${keyword}${key}`));
      for (const candidate of result) {
        if (String(candidate.y) !== year || String(candidate.s) !== semester) continue;
        const code = String(candidate.subNum ?? '').trim();
        if (code && !rows.has(code)) rows.set(code, candidate);
      }
      onProgress?.(queries, queue.length);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { rows: [...rows.values()], queries };
}
