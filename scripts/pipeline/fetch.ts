// 建置期抓取某學期的全校課程（計畫 2.1）。官方查詢單次最多回 500 筆，沒有分頁或排序參數。
// 2026-11-01 調查（官方前端 qrysub.nccu.edu.tw 原始碼＋實測，見 docs/verification/）：關鍵字是全文比對，
// 單一字母幾乎每門課都命中，舊的課號前綴切法會爆量且證明不了完整。改成只帶過濾條件、不帶關鍵字：
// 未定時段＋星期一到日共 8 格；某格回滿 500 筆就不採用，依序改切時段（4）、語言（3）、餘額（2）。
// 另以開課單位查一遍交叉驗證：只有單位查得到的課代表時段格式沒涵蓋到，要併入並回報。

import { officialQueryUrl } from '../../packages/engine/src/index.ts';

/** 官方前端的開課單位清單；交叉驗證用第一層。 */
export const UNIT_LIST_URL = 'https://qrysub.nccu.edu.tw/assets/api/unit.json';

export type OfficialRow = Record<string, unknown> & { subNum?: unknown; y?: unknown; s?: unknown };

/** 一格查詢條件。week 0 是「未定或彈性」（實測與關鍵字「未定或彈性」結果相同）。 */
export interface Cell {
  week?: number;
  /** 1 早上、2 中午、3 下午、4 晚上。 */
  dsec?: number;
  /** 1 中文、2 英文、9 其他。 */
  lan?: '1' | '2' | '9';
  /** 1 尚有餘額、0 額滿。選課期間會變動，只在最後才用。 */
  rcnt?: '1' | '0';
  dp1?: string;
}

export const START_CELLS: readonly Cell[] = Object.freeze(Array.from({ length: 8 }, (_, week) => ({ week })));

/** 條件順序照官方前端（getData）：lan、week、dsec、rcnt，單位放最後。 */
export function cellKeyword(cell: Cell): string {
  return [
    cell.lan && `:lan=${cell.lan}`,
    cell.week !== undefined && `:week=${cell.week}`,
    cell.dsec !== undefined && `:dsec=${cell.dsec}`,
    cell.rcnt && `:rcnt=${cell.rcnt}`,
    cell.dp1 && `:dp1=${cell.dp1}`,
  ].filter(Boolean).join(' ');
}

/** 與網站的單門課確認共用同一個網址格式（引擎 official/live）。 */
export const buildQueryUrl = officialQueryUrl;

/** 回滿上限的格子往下切：時段（未定那格沒有時段）→ 語言 → 餘額；都切過就沒有子格。 */
function children(cell: Cell): Cell[] {
  if (cell.dp1 === undefined && cell.dsec === undefined && cell.week !== 0) return [1, 2, 3, 4].map((dsec) => ({ ...cell, dsec }));
  if (!cell.lan) return (['1', '2', '9'] as const).map((lan) => ({ ...cell, lan }));
  if (!cell.rcnt) return (['1', '0'] as const).map((rcnt) => ({ ...cell, rcnt }));
  return [];
}

export interface FetchOptions {
  term: string;
  fetchImpl?: (url: URL) => Promise<Response>;
  cap?: number;
  minIntervalMs?: number;
  /** 最壞情況 8＋28＋84＋168＋9＝297 次；另加單位交叉驗證。 */
  maxQueries?: number;
  attempts?: number;
  /** 交叉驗證用的開課單位第一層代碼；不給就不做。 */
  units?: readonly string[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onProgress?: (done: number, pending: number) => void;
}

export interface CrossCheck {
  unitQueries: number;
  /** 只有單位查詢找得到的課：時段切分沒涵蓋到，應為 0。 */
  onlyInUnits: string[];
  /** 只有時段查詢找得到的課（例如不在單位清單裡的單位），屬預期內。 */
  onlyInTimes: number;
}

export interface FetchResult {
  rows: OfficialRow[];
  queries: number;
  /** 所有切法都用完仍回滿上限的格子：這些格子底下可能有遺漏。 */
  truncated: string[];
  crossCheck: CrossCheck;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function fetchTermRows(options: FetchOptions): Promise<FetchResult> {
  const {
    term,
    fetchImpl = (url) => fetch(url, { headers: { accept: 'application/json' } }),
    cap = 500,
    minIntervalMs = 800,
    maxQueries = 400,
    attempts = 3,
    units = [],
    sleep = defaultSleep,
    now = Date.now,
    onProgress,
  } = options;
  const year = term.slice(0, 3);
  const semester = term.slice(3);
  let queries = 0;
  let lastRequest = Number.NEGATIVE_INFINITY;

  // 一次只送一個請求，兩次之間至少隔 minIntervalMs。
  const throttle = async () => {
    const wait = lastRequest + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequest = now();
  };

  const query = async (keyword: string): Promise<OfficialRow[]> => {
    queries += 1;
    if (queries > maxQueries) throw new Error(`查詢次數超過上限 ${maxQueries}`);
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

  /** 走完一組起始格子；回滿上限的格子不採用，改查子格。 */
  const enumerate = async (start: readonly Cell[], truncated: string[]) => {
    const found = new Map<string, OfficialRow>();
    const queue = [...start];
    while (queue.length) {
      const cell = queue.shift()!;
      const keyword = cellKeyword(cell);
      const result = await query(keyword);
      onProgress?.(queries, queue.length);
      if (result.length >= cap) {
        const next = children(cell);
        if (next.length) queue.push(...next);
        else truncated.push(keyword);
        continue;
      }
      for (const candidate of result) {
        if (String(candidate.y) !== year || String(candidate.s) !== semester) continue;
        const code = String(candidate.subNum ?? '').trim();
        if (code && !found.has(code)) found.set(code, candidate);
      }
    }
    return found;
  };

  const truncated: string[] = [];
  const rows = await enumerate(START_CELLS, truncated);
  const before = queries;
  const byUnit = units.length ? await enumerate(units.map((dp1) => ({ dp1 })), truncated) : new Map<string, OfficialRow>();
  const onlyInUnits = [...byUnit.keys()].filter((code) => !rows.has(code)).sort();
  onlyInUnits.forEach((code) => rows.set(code, byUnit.get(code)!));
  return {
    rows: [...rows.values()],
    queries,
    truncated,
    crossCheck: {
      unitQueries: queries - before,
      onlyInUnits,
      onlyInTimes: units.length ? [...rows.keys()].filter((code) => !byUnit.has(code)).length : 0,
    },
  };
}

/** 官方開課單位清單 → 第一層代碼（略過「請選擇」）。 */
export function unitCodes(list: unknown): string[] {
  if (!Array.isArray(list)) throw new Error('開課單位清單格式不對');
  return list
    .map((entry) => String((entry as { utCodL1?: unknown })?.utCodL1 ?? '').trim())
    .filter((code) => /^[0-9A-Z]{1,4}$/.test(code) && code !== '0');
}

const SCHEDULE_TEXT = /^(?:[一二三四五六日][1-8A-H]+)+$/;

/** 不變量：上課時間只能是「星期＋節次」重複，或「未定或彈性」。其他寫法代表時段切分可能漏課。 */
export function scheduleTextAnomalies(rows: readonly OfficialRow[]): string[] {
  return rows
    .filter((candidate) => {
      const text = String(candidate.subTime ?? '').trim();
      return text !== '未定或彈性' && !SCHEDULE_TEXT.test(text);
    })
    .map((candidate) => String(candidate.subNum ?? ''));
}
