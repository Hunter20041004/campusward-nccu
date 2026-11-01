import { describe, expect, test } from 'vitest';
import { buildQueryUrl, cellKeyword, fetchTermRows, scheduleTextAnomalies, START_CELLS, unitCodes } from '../fetch.ts';

// 2026-11-01 調查（官方前端 qrysub.nccu.edu.tw 原始碼＋實測）：關鍵字是全文比對，單一字母幾乎每門課都命中，
// 舊的「課號前綴」切法會爆量且證明不了完整。改成只帶星期／時段／語言／餘額過濾、不帶關鍵字：1151 實跑 20 次、2,932 門。
interface FakeRow extends Record<string, unknown> { subNum: string; subTime: string }
const row = (subNum: string, subTime: string, extra: Record<string, unknown> = {}): FakeRow => (
  { y: '115', s: '1', subNum, subNam: `課${subNum}`, subTime, langTpe: '中文', unit: '01', remain: '1', ...extra }
);
const DAYS = '一二三四五六日';
const SEGMENTS: Record<string, string> = { 1: 'AB1234', 2: 'CD', 3: '5678', 4: 'EFGH' };
const LANGUAGES: Record<string, string> = { 1: '中文', 2: '英文', 9: '其他' };

/** 假的官方查詢：照伺服器規則過濾（上課日含 d 且節次含 s；未定或彈性＝week 0），超過上限截斷。 */
function fakeOfficial(rows: FakeRow[], { cap = 500, failures = new Map<string, number>() } = {}) {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL) => {
    const text = decodeURIComponent(new URL(String(url)).pathname).replace('/course/zh-TW/:sem=1151 ', '').replace(/ ?\/$/, '').trim();
    calls.push(text);
    const remaining = failures.get(text) ?? 0;
    if (remaining > 0) {
      failures.set(text, remaining - 1);
      return new Response('busy', { status: 503 });
    }
    const filters = Object.fromEntries([...text.matchAll(/:(\w+)=(\S+)/g)].map((match) => [match[1], match[2]]));
    const matches = rows.filter((candidate) => {
      const timed = candidate.subTime !== '未定或彈性';
      const slots = [...candidate.subTime.matchAll(/([一二三四五六日])([1-8A-H]+)/g)].map((match) => ({ day: DAYS.indexOf(match[1]!) + 1, periods: match[2]! }));
      if (filters.week === '0' && timed) return false;
      if (filters.week && filters.week !== '0') {
        const days = slots.filter(({ day }) => String(day) === filters.week);
        if (!days.length) return false;
        if (filters.dsec && !days.some(({ periods }) => [...periods].some((period) => SEGMENTS[filters.dsec!]!.includes(period)))) return false;
      }
      if (filters.lan && candidate.langTpe !== LANGUAGES[filters.lan]) return false;
      if (filters.rcnt && candidate.remain !== filters.rcnt) return false;
      if (filters.dp1 && candidate.unit !== filters.dp1) return false;
      return true;
    });
    return Response.json(matches.slice(0, cap));
  };
  return { fetchImpl, calls };
}

const fast = { minIntervalMs: 0, sleep: async () => {} };
const codes = (rows: { subNum?: unknown }[]) => rows.map(({ subNum }) => String(subNum)).sort();

test('builds the official filter URL in the same order as the official front end', () => {
  expect(decodeURIComponent(buildQueryUrl('1151', ':week=2 :dsec=3').pathname)).toBe('/course/zh-TW/:sem=1151 :week=2 :dsec=3 /');
  expect(cellKeyword({ rcnt: '1', week: 3, lan: '2', dsec: 4 })).toBe(':lan=2 :week=3 :dsec=4 :rcnt=1');
});

test('starts from the unscheduled cell and the seven weekdays', () => {
  expect(START_CELLS.map(cellKeyword)).toEqual([':week=0', ':week=1', ':week=2', ':week=3', ':week=4', ':week=5', ':week=6', ':week=7']);
});

describe('fetchTermRows', () => {
  test('collects every course once, including unscheduled and multi-day courses', async () => {
    const { fetchImpl, calls } = fakeOfficial([row('351026011', '一234'), row('351034001', '二D56四D5'), row('070395001', '未定或彈性'), row('ZM1010001', '日EF')]);
    const result = await fetchTermRows({ term: '1151', fetchImpl, ...fast });
    expect(codes(result.rows)).toEqual(['070395001', '351026011', '351034001', 'ZM1010001']);
    expect(result.queries).toBe(8);
    expect(calls).toHaveLength(8);
  });

  test('splits a full cell by time segment, then language, and never trusts the full cell', async () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) => row(`10000${index}001`, '一2')),
      ...Array.from({ length: 2 }, (_, index) => row(`20000${index}001`, '一6')),
      ...Array.from({ length: 2 }, (_, index) => row(`30000${index}001`, '一3', { langTpe: '英文' })),
    ];
    const { fetchImpl, calls } = fakeOfficial(rows, { cap: 5 });
    const result = await fetchTermRows({ term: '1151', fetchImpl, cap: 5, ...fast });
    expect(codes(result.rows)).toEqual(codes(rows));
    expect(calls).toEqual(expect.arrayContaining([':week=1', ':week=1 :dsec=1', ':week=1 :dsec=3', ':lan=1 :week=1 :dsec=1', ':lan=2 :week=1 :dsec=1']));
    expect(result.truncated).toEqual([]);
  });

  test('reports a cell that is still full after every split', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => row(`10000${index}001`, '一2'));
    const { fetchImpl } = fakeOfficial(rows, { cap: 2 });
    const result = await fetchTermRows({ term: '1151', fetchImpl, cap: 2, ...fast });
    expect(result.truncated).toEqual([':lan=1 :week=1 :dsec=1 :rcnt=1']);
  });

  test('ignores rows from another semester', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011', '一2'), row('351026012', '一2', { s: '2' })]);
    expect(codes((await fetchTermRows({ term: '1151', fetchImpl, ...fast })).rows)).toEqual(['351026011']);
  });

  test('retries a failing query and then succeeds', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011', '一2')], { failures: new Map([[':week=1', 2]]) });
    expect((await fetchTermRows({ term: '1151', fetchImpl, ...fast })).rows).toHaveLength(1);
  });

  test('fails the whole run after three failed attempts', async () => {
    const { fetchImpl } = fakeOfficial([row('351026011', '一2')], { failures: new Map([[':week=1', 3]]) });
    await expect(fetchTermRows({ term: '1151', fetchImpl, ...fast })).rejects.toThrow('查詢「:week=1」失敗 3 次');
  });

  test('stops when the total query limit is exceeded', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(`10000${index}001`, '一2'));
    const { fetchImpl } = fakeOfficial(rows, { cap: 1 });
    await expect(fetchTermRows({ term: '1151', fetchImpl, cap: 1, maxQueries: 10, ...fast })).rejects.toThrow('查詢次數超過上限 10');
  });

  test('sends one request at a time and waits between them', async () => {
    const waits: number[] = [];
    let active = 0;
    let peak = 0;
    const { fetchImpl: inner } = fakeOfficial([]);
    const fetchImpl = async (url: URL) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return inner(url);
    };
    let clock = 0;
    await fetchTermRows({ term: '1151', fetchImpl, minIntervalMs: 800, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
    expect(peak).toBe(1);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(800);
  });
});

describe('cross-check by teaching unit', () => {
  test('merges and reports courses that only the unit queries found', async () => {
    // 時段格式看不懂的課，時段查詢找不到，只有單位查詢找得到：要併入並回報異常。
    const rows = [row('351026011', '一2', { unit: '01' }), row('999999001', '奇怪的時間', { unit: '02' })];
    const { fetchImpl } = fakeOfficial(rows);
    const result = await fetchTermRows({ term: '1151', fetchImpl, units: ['01', '02'], ...fast });
    expect(codes(result.rows)).toEqual(['351026011', '999999001']);
    expect(result.crossCheck).toEqual({ unitQueries: 2, onlyInUnits: ['999999001'], onlyInTimes: 0 });
  });

  test('counts courses that only the time queries found as expected', async () => {
    const rows = [row('351026011', '一2', { unit: '01' }), row('070395001', '未定或彈性', { unit: 'none' })];
    const { fetchImpl } = fakeOfficial(rows);
    const result = await fetchTermRows({ term: '1151', fetchImpl, units: ['01'], ...fast });
    expect(result.crossCheck).toEqual({ unitQueries: 1, onlyInUnits: [], onlyInTimes: 1 });
  });

  test('splits a full unit query by language', async () => {
    const rows = [row('500000001', '一2'), row('500001001', '二2'), row('500002001', '三2', { langTpe: '英文' })];
    const { fetchImpl, calls } = fakeOfficial(rows, { cap: 3 });
    const result = await fetchTermRows({ term: '1151', fetchImpl, cap: 3, units: ['01'], ...fast });
    expect(calls).toEqual(expect.arrayContaining([':dp1=01', ':lan=1 :dp1=01', ':lan=2 :dp1=01']));
    expect(result.crossCheck.onlyInUnits).toEqual([]);
  });
});

test('reads first-level unit codes from the official unit list', () => {
  expect(unitCodes([{ utCodL1: '0', utL1Text: '請選擇' }, { utCodL1: '01' }, { utCodL1: 'Z23' }, { utCodL1: '<b>' }])).toEqual(['01', 'Z23']);
  expect(() => unitCodes({})).toThrow('開課單位清單格式不對');
});

test('flags schedule text outside the weekday-and-period format', () => {
  expect(scheduleTextAnomalies([row('1', '一234'), row('2', '二D56四D5'), row('3', '未定或彈性'), row('4', '隔週一234'), row('5', '')])).toEqual(['4', '5']);
});
