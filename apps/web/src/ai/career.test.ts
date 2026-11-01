import { rowToCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { parseCareerReply, recommendForCareer } from './career.ts';

const courseOf = (code: string, title: string): Course => rowToCourse(officialRow({ subNum: code, subNam: title }), { year: 115, semester: 1 }).course!;
const courses = [courseOf('900001001', '統計學'), courseOf('900002001', '資料探勘'), courseOf('900003001', '行銷管理')];

describe('parseCareerReply', () => {
  test('reads skills with search keywords and a short summary', () => {
    expect(parseCareerReply(JSON.stringify({ summary: '資料分析師需要統計與程式。', skills: [{ name: '統計', keywords: ['統計'], why: '分析資料' }] })))
      .toEqual({ summary: '資料分析師需要統計與程式。', skills: [{ name: '統計', keywords: ['統計'], why: '分析資料' }] });
  });

  test.each([
    ['change actions', { summary: 'x', skills: [], actions: [{ type: 'addToSchedule', course: '900001001' }] }],
    ['too many skills', { summary: 'x', skills: Array.from({ length: 9 }, () => ({ name: 'a', keywords: ['a'], why: '' })) }],
    ['not JSON', '好的'],
  ])('rejects a reply with %s', (_, reply) => {
    expect(() => parseCareerReply(typeof reply === 'string' ? reply : JSON.stringify(reply))).toThrow('AI 回覆格式不正確。');
  });
});

describe('recommendForCareer', () => {
  test('makes one call and finds this term’s courses for each skill locally', async () => {
    const generate = vi.fn(async () => JSON.stringify({ summary: '摘要', skills: [{ name: '資料分析', keywords: ['資料', '統計'], why: '理由' }, { name: '沒有的', keywords: ['量子'], why: '' }] }));
    const result = await recommendForCareer({ client: { generate }, direction: '資料分析師', termLabel: '115-1', courses });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.parse((generate.mock.calls[0] as unknown as [{ user: string }])[0].user)).toEqual({ direction: '資料分析師', term: '115-1' });
    expect(result).toEqual({
      status: 'ok',
      summary: '摘要',
      skills: [
        { name: '資料分析', why: '理由', courses: [courses[1], courses[0]] },
        { name: '沒有的', why: '', courses: [] },
      ],
    });
  });

  test('reports failures without throwing', async () => {
    const generate = vi.fn(async () => '不是 JSON');
    expect(await recommendForCareer({ client: { generate }, direction: 'x', termLabel: '115-1', courses })).toEqual({ status: 'failed', message: 'AI 回覆格式不正確。' });
  });
});
