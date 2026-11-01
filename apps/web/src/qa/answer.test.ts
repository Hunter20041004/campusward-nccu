import { describe, expect, test, vi } from 'vitest';
import { askSyllabi, parseQaReply, type QaContext } from './answer.ts';

const context: QaContext[] = [
  { code: '900001001', title: '統計學', passages: [{ section: '評分', text: '期中考 30%，期末考 40%。' }] },
  { code: '900003001', title: '英文（一）', passages: [{ section: '評分', text: '小組期末報告 60%。' }] },
];

describe('parseQaReply', () => {
  test('keeps only citations of courses that were provided', () => {
    expect(parseQaReply(JSON.stringify({ answer: '英文（一）期末是報告。', citations: ['900003001', '999999999'] }), context))
      .toEqual({ answer: '英文（一）期末是報告。', citations: ['900003001'] });
  });

  test.each([
    ['change actions', { answer: 'x', citations: [], actions: [{ type: 'addToSchedule', course: '900001001' }] }],
    ['a missing answer', { citations: [] }],
  ])('rejects a reply with %s', (_, reply) => {
    expect(() => parseQaReply(JSON.stringify(reply), context)).toThrow('AI 回覆格式不正確。');
  });
});

describe('askSyllabi', () => {
  test('sends only the question and the syllabus passages', async () => {
    const generate = vi.fn(async () => JSON.stringify({ answer: '統計學有期末考。', citations: ['900001001'] }));
    const result = await askSyllabi({ client: { generate }, question: '哪門課期末是考試？', context });
    expect(result).toEqual({ status: 'ok', answer: '統計學有期末考。', citations: ['900001001'] });
    const request = (generate.mock.calls[0] as unknown as [{ system: string; user: string }])[0];
    expect(JSON.parse(request.user)).toEqual({
      question: '哪門課期末是考試？',
      syllabi: [
        { code: '900001001', title: '統計學', passages: [{ section: '評分', text: '期中考 30%，期末考 40%。' }] },
        { code: '900003001', title: '英文（一）', passages: [{ section: '評分', text: '小組期末報告 60%。' }] },
      ],
    });
    expect(request.system).toContain('只能根據');
  });

  test('reports a failure without throwing', async () => {
    expect(await askSyllabi({ client: { generate: async () => 'x' }, question: 'q', context })).toEqual({ status: 'failed', message: 'AI 回覆格式不正確。' });
  });
});
