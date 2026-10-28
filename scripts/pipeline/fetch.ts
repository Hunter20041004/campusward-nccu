// 建置期抓取某學期的全校課程（計畫 2.1）。官方查詢是「包含比對」（課號、教室、備註都會命中）且單次最多回 500 筆。
// 做法（舊專案在 115-1 驗證過，並補上字母開頭的課號）：以三碼數字前綴與單一字母查詢，只收課號真的以前綴開頭的列；
// 回傳達上限才補一碼（數字或字母）往下切，最多切到 6 碼，仍被截斷的前綴回報出來。限制併發與請求間隔。
// 2026-10-28 實跑：從單字元出發會因模糊比對展開爆量（3,000 次查詢仍有 5,784 個待查），故改為三碼起跳。

const CODE_CHARS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
export const START_KEYS = [
  ...Array.from({ length: 1000 }, (_, index) => String(index).padStart(3, '0')),
  ...CODE_CHARS.slice(10),
];
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
  maxPrefixLength?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onProgress?: (done: number, pending: number) => void;
}

export interface FetchResult {
  rows: OfficialRow[];
  queries: number;
  /** 切到最大長度仍撞上限的前綴：這些前綴底下可能有遺漏。 */
  truncated: string[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function fetchTermRows(options: FetchOptions): Promise<FetchResult> {
  const {
    term,
    fetchImpl = (url) => fetch(url, { headers: { accept: 'application/json' } }),
    cap = 500,
    concurrency = 4,
    minIntervalMs = 200,
    maxQueries = 5000,
    attempts = 3,
    maxPrefixLength = 6,
    sleep = defaultSleep,
    now = Date.now,
    onProgress,
  } = options;
  const year = term.slice(0, 3);
  const semester = term.slice(3);
  const rows = new Map<string, OfficialRow>();
  const queue = [...START_KEYS];
  const truncated: string[] = [];
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
      if (result.length >= cap) {
        if (keyword.length < maxPrefixLength) queue.push(...CODE_CHARS.map((char) => `${keyword}${char}`));
        else truncated.push(keyword);
      }
      for (const candidate of result) {
        if (String(candidate.y) !== year || String(candidate.s) !== semester) continue;
        const code = String(candidate.subNum ?? '').trim();
        // 模糊比對會帶回其他單位的課；只收真的以前綴開頭的，其餘交給對應前綴的查詢。
        if (code.startsWith(keyword) && !rows.has(code)) rows.set(code, candidate);
      }
      onProgress?.(queries, queue.length);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { rows: [...rows.values()], queries, truncated };
}
