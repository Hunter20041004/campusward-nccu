import { describe, expect, test } from 'vitest';
import { MAX_PASSAGE_LENGTH, parseSyllabusLine, syllabusPassages, tokenizeForSearch, toSearchTerm } from '../src/syllabus.ts';

// 計畫 4.5：課綱語料（docs/plans/2026-11-01-syllabus-qa.md 第 2 節）→ 段落 → 搜尋詞。
const entry = {
  code: '900123001', title: '合成資料科學 Synthetic Data Science', description: '介紹機器學習與統計方法。', objectives: '能獨立完成資料分析專題。',
  grading: '期中考 30%，期末報告 40%。', prerequisite: '統計學', weekly: [{ week: 1, topic: '課程介紹' }, { week: 2, topic: '線性迴歸' }], weeklyText: '', hash: 'a'.repeat(64),
};

describe('parseSyllabusLine', () => {
  test('accepts a corpus line in the shared format', () => {
    expect(parseSyllabusLine(JSON.stringify(entry))).toEqual(entry);
  });

  test.each([
    ['an unknown field', { ...entry, officeHours: '週一' }],
    ['a bad course code', { ...entry, code: '../etc' }],
    ['a prototype key', JSON.parse('{"__proto__":{"x":1}}')],
  ])('rejects %s', (_, value) => {
    expect(parseSyllabusLine(JSON.stringify(value))).toBeNull();
  });
});

describe('syllabusPassages', () => {
  test('splits a course into labelled passages, one per section', () => {
    expect(syllabusPassages(entry).map(({ section, text }) => [section, text])).toEqual([
      ['課名', '合成資料科學 Synthetic Data Science'],
      ['簡介', '介紹機器學習與統計方法。'],
      ['目標', '能獨立完成資料分析專題。'],
      ['評分', '期中考 30%，期末報告 40%。'],
      ['先修', '統計學'],
      ['每週主題', '第 1 週 課程介紹\n第 2 週 線性迴歸'],
    ]);
  });

  test('cuts long sections into passages of at most the maximum length', () => {
    const passages = syllabusPassages({ ...entry, description: '機'.repeat(MAX_PASSAGE_LENGTH * 2 + 10) }).filter(({ section }) => section === '簡介');
    expect(passages.map(({ text }) => text.length)).toEqual([MAX_PASSAGE_LENGTH, MAX_PASSAGE_LENGTH, 10]);
  });

  test('skips empty sections and falls back to the weekly text', () => {
    const passages = syllabusPassages({ ...entry, prerequisite: '', weekly: [], weeklyText: '每週討論一篇論文' });
    expect(passages.map(({ section }) => section)).toEqual(['課名', '簡介', '目標', '評分', '每週進度']);
  });
});

describe('tokenizeForSearch', () => {
  test('makes Chinese bigrams and lower-case words, normalized', () => {
    expect(tokenizeForSearch('機器學習 ＡＩ Python')).toEqual(['機器', '器學', '學習', 'ai', 'python']);
  });

  test('keeps a single Chinese character that stands alone', () => {
    expect(tokenizeForSearch('法 與 經濟')).toEqual(['法', '與', '經濟']);
  });

  test('encodes search terms as hex so the index stays fast to load', () => {
    expect(toSearchTerm('機器')).toBe('6a5f5668');
    expect(toSearchTerm('ai')).toBe('00610069');
  });
});

test('accepts a long weekly topic (a real syllabus had 2,144 characters in one week)', () => {
  expect(parseSyllabusLine(JSON.stringify({ ...entry, weekly: [{ week: 15, topic: '讀'.repeat(2144) }] }))).not.toBeNull();
});
