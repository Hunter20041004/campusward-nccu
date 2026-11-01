import { createPlannerState, rowToCourse, toScheduleCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { GeminiError } from './gemini.ts';
import { aiSearch, planWithAi, type OrbInput } from './orb.ts';

const courseOf = (code: string, title: string, subTime: string): Course => {
  const { course } = rowToCourse(officialRow({ subNum: code, subNam: title, subTime }), { year: 115, semester: 1 });
  if (!course) throw new Error('rejected');
  return course;
};
const courses = [courseOf('900001001', '統計學', '一234'), courseOf('900002001', '金融科技導論', '三D56'), courseOf('900003001', '金融市場', '五234')];
const catalog = new Map(courses.map((course) => [toScheduleCourse(course).key, toScheduleCourse(course)]));
const reply = (actions: unknown[]) => JSON.stringify({ actions });

function input(replies: (string | Error)[], overrides: Partial<OrbInput> = {}) {
  const generate = vi.fn(async () => {
    const next = replies.shift();
    if (next === undefined) throw new Error('called too many times');
    if (next instanceof Error) throw next;
    return next;
  });
  return { generate, value: { client: { generate }, request: '幫我加一門金融的課', termLabel: '115-1', planner: createPlannerState(), catalog, courses, ...overrides } as OrbInput };
}

describe('planWithAi', () => {
  test('makes one call when the model answers with changes directly', async () => {
    const { generate, value } = input([reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'answer', text: '加了統計學。' }])]);
    expect(await planWithAi(value)).toEqual({ status: 'planned', changes: [{ type: 'addToSchedule', key: '1151:900001001' }], answer: '加了統計學。', corrections: [], calls: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('searches locally and makes at most two calls', async () => {
    const { generate, value } = input([
      reply([{ type: 'searchCourses', query: '金融 週三' }]),
      reply([{ type: 'addToSchedule', course: '900002001' }, { type: 'searchCourses', query: '再找' }, { type: 'answer', text: '加了金融科技導論。' }]),
    ]);
    const outcome = await planWithAi(value);
    expect(outcome).toMatchObject({ status: 'planned', changes: [{ type: 'addToSchedule', key: '1151:900002001' }], calls: 2 });
    expect(generate).toHaveBeenCalledTimes(2);
    const second = JSON.parse((generate.mock.calls[1] as unknown as [{ user: string }])[0].user) as { searchResults: { courses: { code: string }[] }[] };
    expect(second.searchResults[0]!.courses.map(({ code }) => code)).toEqual(['900002001']);
  });

  test('reports a reply that is not a valid action list without changing anything', async () => {
    const { value } = input(['好的我幫你加了']);
    expect(await planWithAi(value)).toEqual({ status: 'failed', message: 'AI 回覆格式不正確。' });
  });

  test('reports an unknown course code instead of guessing', async () => {
    const { value } = input([reply([{ type: 'addToSchedule', course: '123456789' }])]);
    expect(await planWithAi(value)).toEqual({ status: 'failed', message: 'AI 回覆包含未知課程：123456789' });
  });

  test('passes the client error message through', async () => {
    const { value } = input([new GeminiError('quota')]);
    expect(await planWithAi(value)).toEqual({ status: 'failed', message: new GeminiError('quota').message });
  });

  test('reports corrected course codes', async () => {
    const { value } = input([reply([{ type: 'addToSchedule', course: '900001011' }])]);
    expect(await planWithAi(value)).toMatchObject({ corrections: [{ from: '900001011', key: '1151:900001001' }] });
  });
});

describe('aiSearch', () => {
  test('reads weekdays from the query and matches the remaining words', () => {
    expect(aiSearch(courses, '金融 週三').map(({ code }) => code)).toEqual(['900002001']);
    expect(aiSearch(courses, '星期五').map(({ code }) => code)).toEqual(['900003001']);
    expect(aiSearch(courses, '金融').map(({ code }) => code)).toEqual(['900002001', '900003001']);
  });

  test('falls back to any word when no course has all of them', () => {
    expect(aiSearch(courses, '統計 不存在').map(({ code }) => code)).toEqual(['900001001']);
  });
});
