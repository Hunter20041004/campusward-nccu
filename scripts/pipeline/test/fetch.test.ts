import { describe, expect, test } from 'vitest';
import { buildQueryUrl, fetchTermRows, START_KEYS } from '../fetch.ts';

const row = (subNum: string, extra: Record<string, unknown> = {}) => ({ y: '115', s: '1', subNum, subNam: `課${subNum}`, ...extra });

/** 假的官方查詢：關鍵字出現在課號中就算命中（與真實的包含比對相同性質），超過上限就截斷。 */
function fakeOfficial(rows: Record<string, unknown>[], { cap = 500, failures = new Map<string, number>() } = {}) {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL) => {
    const keyword = decodeURIComponent(new URL(String(url)).pathname).replace('/course/zh-TW/:sem=1151 ', '').replace(/ \/$/, '');
    calls.push(keyword);
    const remaining = failures.get(keyword) ?? 0;
    if (remaining > 0) {
      failures.set(keyword, remaining - 1);
      return new Response('busy', { status: 503 });
    }
    return Response.json(rows.filter((candidate) => String(candidate.subNum).includes(keyword)).slice(0, cap));
  };
  return { fetchImpl, calls };
}

const fast = { minIntervalMs: 0, sleep: async () => {} };

test('builds the official keyword URL', () => {
  expect(decodeURIComponent(buildQueryUrl('1151', '35').pathname)).toBe('/course/zh-TW/:sem=1151 35 /');
});

// 2026-10-28 實跑：從單字元出發，兩三碼的查詢幾乎都撞上限、展開爆量（3,000 次仍有 5,784 個待查）。
// 改用舊專案驗證過的做法：三碼數字前綴＋單一字母出發，只收課號真的以前綴開頭的列。
test('starts from three-digit prefixes and single letters', () => {
  expect(START_KEYS).toHaveLength(1000 + 26);
  expect(START_KEYS.slice(0, 2)).toEqual(['000', '001']);
  expect(START_KEYS.at(999)).toBe('999');
  expect(START_KEYS.at(-1)).toBe('Z');
});

test('keeps only rows whose code starts with the query', async () => {
  const { fetchImpl } = fakeOfficial([row('351026011'), row('000351001'), row('ZM1010001')]);
  const result = await fetchTermRows({ term: '1151', fetchImpl, ...fast });
  expect(result.rows.map(({ subNum }) => subNum).sort()).toEqual(['000351001', '351026011', 'ZM1010001']);
});

test('reports prefixes still truncated at the maximum length', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => row(`35102601${index}`));
  const { fetchImpl } = fakeOfficial(rows, { cap: 3 });
  const result = await fetchTermRows({ term: '1151', fetchImpl, cap: 3, maxPrefixLength: 4, ...fast });
  expect(result.truncated).toContain('3510');
});

describe('fetchTermRows', () => {
  test('collects every row once even when several queries return it', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011'), row('351034001'), row('ZM1010001')]);
    const result = await fetchTermRows({ term: '1151', fetchImpl, ...fast });
    expect(result.rows.map(({ subNum }) => subNum).sort()).toEqual(['351026011', '351034001', 'ZM1010001']);
  });

  test('splits a query that hits the result cap, including letters inside codes', async () => {
    const rows = [...Array.from({ length: 11 }, (_, index) => row(`351${String(index).padStart(2, '0')}0001`)), row('351F00021')];
    const { fetchImpl, calls } = fakeOfficial(rows, { cap: 5 });
    const result = await fetchTermRows({ term: '1151', fetchImpl, cap: 5, ...fast });
    expect(result.rows).toHaveLength(12);
    expect(calls).toContain('3510');
    expect(calls).toContain('351F');
  });

  test('ignores rows from another semester', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011'), row('351026012', { s: '2' })]);
    const result = await fetchTermRows({ term: '1151', fetchImpl, ...fast });
    expect(result.rows.map(({ subNum }) => subNum)).toEqual(['351026011']);
  });

  test('retries a failing query and then succeeds', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011')], { failures: new Map([['351', 2]]) });
    const result = await fetchTermRows({ term: '1151', fetchImpl, ...fast });
    expect(result.rows).toHaveLength(1);
  });

  test('fails the whole run after three failed attempts', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011')], { failures: new Map([['351', 3]]) });
    await expect(fetchTermRows({ term: '1151', fetchImpl, ...fast })).rejects.toThrow('查詢「351」失敗 3 次');
  });

  test('stops when the total query limit is exceeded', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => row(`9${String(index).padStart(8, '0')}`));
    const { fetchImpl } = fakeOfficial(rows, { cap: 1 });
    await expect(fetchTermRows({ term: '1151', fetchImpl, cap: 1, maxQueries: 1100, ...fast })).rejects.toThrow('查詢次數超過上限 1100');
  });

  test('never runs more than the allowed number of requests at once', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return Response.json([]);
    };
    await fetchTermRows({ term: '1151', fetchImpl, concurrency: 4, ...fast });
    expect(peak).toBeLessThanOrEqual(4);
  });

  test('waits between requests', async () => {
    const waits: number[] = [];
    const { fetchImpl } = fakeOfficial([]);
    let clock = 0;
    await fetchTermRows({
      term: '1151',
      fetchImpl,
      minIntervalMs: 200,
      now: () => clock,
      sleep: async (ms) => { waits.push(ms); clock += ms; },
    });
    expect(waits.length).toBeGreaterThan(0);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(200);
  });

  test('reports how many queries it made', async () => {
    const { fetchImpl } = fakeOfficial([]);
    expect((await fetchTermRows({ term: '1151', fetchImpl, ...fast })).queries).toBe(1026);
  });
});
