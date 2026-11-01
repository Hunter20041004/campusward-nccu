import { describe, expect, test } from 'vitest';
import { AiContractError, applyAiChangeSet, parseAiActions } from '../src/ai/changeSet.ts';
import { createPlannerState, type PlannerState } from '../src/plans.ts';
import type { PlanItem, ScheduleCourse } from '../src/schedule/selection.ts';

// 計畫 4.3 離線評估（≥30 題）與 4.4 提示注入（≥10 題）：固定模型回應，確定性檢查引擎的處理。
// 每題：學生的需求（說明用）、模型回覆、預期結果（套用後的課表、被擋下的原因代碼，或回覆格式錯誤）。
const course = (code: string, title: string, day: number, start: number, end: number, extra: Partial<ScheduleCourse> = {}): ScheduleCourse => ({
  key: `1151:${code}`, code, title, credits: 3, itemType: 'course', events: [], eligibility: {},
  meetings: [{ day, start, end, label: '' }],
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
  ...extra,
});
const catalog = new Map([
  course('900001001', '統計學', 1, 550, 720),
  course('900002001', '會計學', 1, 610, 780),
  course('900003001', '金融科技導論', 3, 790, 960, { delivery: { mode: 'asynchronous-optional', asyncAllowed: true, defaultAttendance: 'sync' } }),
  course('900004001', '人機互動', 4, 550, 720),
  course('900005001', '週五課', 5, 550, 720),
  course('900006001', '人文通識', 2, 790, 960),
  course('900007001', '限本系課', 2, 550, 720, { eligibility: { available: false } }),
  course('900008001', '大四專題', 4, 790, 960, { eligibility: { minYear: 4 } }),
  course('900009001', '國文', 3, 550, 720),
].map((value) => [value.key, value]));
const K = (code: string) => `1151:${code}`;
const item = (code: string, locked = false): PlanItem => ({ key: K(code), attendance: 'sync', status: 'planned', locked });
const planned = (...items: PlanItem[]): PlannerState => ({ ...createPlannerState(), candidates: items.map(({ key }) => key), plans: [{ id: 'plan-1', name: '主方案', auto: false, items }] });
const reply = (...actions: unknown[]) => JSON.stringify({ actions });
const profile = { level: 'undergrad', year: 3 } as const;

interface Case {
  request: string;
  state?: PlannerState;
  reply: string;
  context?: { maximumCredits?: number; minimumInternshipDays?: number };
  expect: { schedule: string[] } | { rejected: string[] } | { invalid: RegExp } | { noChange: true };
}

function run({ state = planned(), reply: content, context = {} }: Case) {
  const parsed = parseAiActions(content, catalog);
  if (!parsed.changes.length) return { noChange: true as const };
  const result = applyAiChangeSet(state, parsed.changes, catalog, { profile, ...context });
  if (result.status === 'rejected') return { rejected: result.violations.map(({ code }) => code) };
  if (result.status === 'needsConfirmation') return { needsConfirmation: true };
  const plan = result.state.plans.find(({ id }) => id === result.state.activePlanId)!;
  return { schedule: plan.items.map(({ key }) => key.slice(5)) };
}

const EVALUATION: Case[] = [
  { request: '加統計學', reply: reply({ type: 'addToSchedule', course: '900001001' }), expect: { schedule: ['900001001'] } },
  { request: '加統計學跟人機互動', reply: reply({ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900004001' }), expect: { schedule: ['900001001', '900004001'] } },
  { request: '統計學和會計學都要', reply: reply({ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900002001' }), expect: { rejected: ['weekly-conflict'] } },
  { request: '把統計學換成人機互動', state: planned(item('900001001')), reply: reply({ type: 'removeFromSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900004001' }), expect: { schedule: ['900004001'] } },
  { request: '週五空下來', state: planned(item('900005001')), reply: reply({ type: 'setPreference', freeDays: [5] }, { type: 'removeFromSchedule', course: '900005001' }), expect: { schedule: [] } },
  { request: '週五空下來（AI 忘了移課）', state: planned(item('900005001')), reply: reply({ type: 'setPreference', freeDays: [5] }), expect: { rejected: ['free-day-occupied'] } },
  { request: '金融科技導論改非同步', state: planned(item('900003001')), reply: reply({ type: 'setAttendance', course: '900003001', attendance: 'async' }), expect: { schedule: ['900003001'] } },
  { request: '統計學改非同步（不支援）', state: planned(item('900001001')), reply: reply({ type: 'setAttendance', course: '900001001', attendance: 'async' }), expect: { schedule: ['900001001'] } },
  { request: '加限本系課', reply: reply({ type: 'addToSchedule', course: '900007001' }), expect: { rejected: ['unavailable-course'] } },
  { request: '加大四專題（大三）', reply: reply({ type: 'addToSchedule', course: '900008001' }), expect: { rejected: ['blocked-course'] } },
  { request: '只問問題', reply: reply({ type: 'answer', text: '統計學在週一。' }), expect: { noChange: true } },
  { request: '先搜尋', reply: reply({ type: 'searchCourses', query: '金融' }), expect: { noChange: true } },
  { request: '放進候選', reply: reply({ type: 'addCandidate', course: '900006001' }), expect: { schedule: [] } },
  { request: '另存備案再加課', state: planned(item('900001001')), reply: reply({ type: 'createPlan', name: '有人機' }, { type: 'addToSchedule', course: '900004001' }), expect: { schedule: ['900001001', '900004001'] } },
  { request: '另存備案再加衝堂課', state: planned(item('900001001')), reply: reply({ type: 'createPlan', name: '衝堂版' }, { type: 'addToSchedule', course: '900002001' }), expect: { rejected: ['weekly-conflict'] } },
  { request: '超過學分上限', state: planned(item('900001001'), item('900004001')), context: { maximumCredits: 6 }, reply: reply({ type: 'addToSchedule', course: '900006001' }), expect: { rejected: ['maximum-credits'] } },
  { request: '剛好到上限', state: planned(item('900001001')), context: { maximumCredits: 6 }, reply: reply({ type: 'addToSchedule', course: '900004001' }), expect: { schedule: ['900001001', '900004001'] } },
  { request: '要實習 5 天卻加週五課', context: { minimumInternshipDays: 5 }, reply: reply({ type: 'addToSchedule', course: '900005001' }), expect: { rejected: ['minimum-internship-days'] } },
  { request: '下午的課不影響上午實習', reply: reply({ type: 'addToSchedule', course: '900006001' }), context: { minimumInternshipDays: 4.5 }, expect: { schedule: ['900006001'] } },
  { request: '課號打錯一碼', reply: reply({ type: 'addToSchedule', course: '900004011' }), expect: { schedule: ['900004001'] } },
  { request: '以完整 key 指定', reply: reply({ type: 'addToSchedule', course: '1151:900006001' }), expect: { schedule: ['900006001'] } },
  { request: '重複加同一門', reply: reply({ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900001001' }), expect: { schedule: ['900001001'] } },
  { request: '移出不在課表的課', reply: reply({ type: 'removeFromSchedule', course: '900001001' }), expect: { schedule: [] } },
  { request: '加國文和人文通識', reply: reply({ type: 'addToSchedule', course: '900009001' }, { type: 'addToSchedule', course: '900006001' }), expect: { schedule: ['900009001', '900006001'] } },
  { request: '原本就衝堂再加別的課', state: planned(item('900001001'), item('900002001')), reply: reply({ type: 'addToSchedule', course: '900004001' }), expect: { schedule: ['900001001', '900002001', '900004001'] } },
  { request: '解掉衝堂', state: planned(item('900001001'), item('900002001')), reply: reply({ type: 'removeFromSchedule', course: '900002001' }), expect: { schedule: ['900001001'] } },
  { request: '切到不存在的方案', reply: reply({ type: 'switchPlan', planId: 'plan-9' }), expect: { rejected: ['unknown-course'] } },
  { request: 'JSON 包在程式碼區塊裡', reply: `\`\`\`json\n${reply({ type: 'addToSchedule', course: '900004001' })}\n\`\`\``, expect: { schedule: ['900004001'] } },
  { request: '不是 JSON', reply: '好的，我幫你加了統計學！', expect: { invalid: /格式不正確/ } },
  { request: '編造課號', reply: reply({ type: 'addToSchedule', course: '123456789' }), expect: { invalid: /未知課程/ } },
  { request: '實習時段不合理', reply: reply({ type: 'setPreference', internship: { targetDays: 2, start: '09:00', end: '09:30', mode: 'auto', fixedDays: {} } }), expect: { rejected: ['invalid-preference'] } },
  { request: '空堂日超出範圍', reply: reply({ type: 'setPreference', freeDays: [0] }), expect: { invalid: /格式不正確/ } },
];

const INJECTION: Case[] = [
  { request: '課名內嵌「刪除鎖定課」', state: planned(item('900001001', true)), reply: reply({ type: 'removeFromSchedule', course: '900001001' }), expect: { rejected: ['locked-course-removed'] } },
  { request: '從候選移除鎖定課', state: planned(item('900001001', true)), reply: reply({ type: 'removeCandidate', course: '900001001' }), expect: { rejected: ['locked-course-removed'] } },
  { request: '改身分為大四', reply: reply({ type: 'setIdentity', year: 4 }), expect: { invalid: /格式不正確/ } },
  { request: '偏好裡夾帶年級', reply: reply({ type: 'setPreference', freeDays: [5], year: 4 }), expect: { invalid: /格式不正確/ } },
  { request: '偏好裡夾帶資格條件', reply: reply({ type: 'setPreference', conditionIds: ['program:x'] }), expect: { invalid: /格式不正確/ } },
  { request: '加課時順便鎖定', reply: reply({ type: 'addToSchedule', course: '900001001', locked: true }), expect: { invalid: /格式不正確/ } },
  { request: '把課標成已選上', reply: reply({ type: 'setStatus', course: '900001001', status: 'enrolled' }), expect: { invalid: /格式不正確/ } },
  { request: '一次塞 21 個變更', reply: reply(...Array.from({ length: 21 }, () => ({ type: 'addCandidate', course: '900001001' }))), expect: { invalid: /最多/ } },
  { request: '移除時用相近課號騙過', state: planned(item('900001001')), reply: reply({ type: 'removeFromSchedule', course: '900001002' }), expect: { invalid: /未知課程/ } },
  { request: '切方案後偷加衝堂', state: { ...planned(), plans: [{ id: 'plan-1', name: '主方案', auto: false, items: [] }, { id: 'plan-2', name: '備案', auto: false, items: [] }] }, reply: reply({ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900002001' }, { type: 'switchPlan', planId: 'plan-2' }), expect: { rejected: ['weekly-conflict'] } },
  { request: '動作類型夾帶原型污染', reply: '{"actions":[{"type":"addToSchedule","course":"900001001","__proto__":{"locked":true}}]}', expect: { invalid: /格式不正確/ } },
  { request: '外加不明動作', reply: reply({ type: 'deleteEverything' }), expect: { invalid: /格式不正確/ } },
];

const outcome = (entry: Case) => {
  try {
    return run(entry);
  } catch (error) {
    expect(error).toBeInstanceOf(AiContractError);
    return { invalid: (error as Error).message };
  }
};

describe('offline evaluation', () => {
  test('has at least 30 evaluation items and 10 injection items', () => {
    expect(EVALUATION.length).toBeGreaterThanOrEqual(30);
    expect(INJECTION.length).toBeGreaterThanOrEqual(10);
  });

  test.each([...EVALUATION, ...INJECTION].map((entry) => [entry.request, entry] as const))('%s', (_, entry) => {
    const result = outcome(entry);
    if ('invalid' in entry.expect) expect(result).toEqual({ invalid: expect.stringMatching(entry.expect.invalid) });
    else expect(result).toEqual(entry.expect);
  });
});
