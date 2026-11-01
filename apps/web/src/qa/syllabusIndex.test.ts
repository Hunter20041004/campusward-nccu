import { describe, expect, test } from 'vitest';
import { buildSyllabusArtifacts, loadSyllabusIndex, searchSyllabi } from './syllabusIndex.ts';

const line = (code: string, title: string, description: string, grading = '期末報告 50%') => JSON.stringify({
  code, title, description, objectives: '', grading, prerequisite: '', weekly: [], weeklyText: '', hash: 'b'.repeat(64),
});
const corpus = [
  line('900001001', '機器學習導論', '介紹監督式學習、神經網路與模型評估。'),
  line('900002001', '財務報表分析', '學習閱讀資產負債表與現金流量表。', '期中考 40%，期末考 60%'),
  line('900003001', '統計學', '機率、抽樣與假設檢定。'),
  '{"broken":true}',
].join('\n');

describe('buildSyllabusArtifacts', () => {
  test('builds an index, one text file per course, and counts skipped lines', () => {
    const built = buildSyllabusArtifacts(corpus);
    expect(built.stats).toMatchObject({ courses: 3, skipped: 1 });
    expect([...built.courses.keys()]).toEqual(['900001001', '900002001', '900003001']);
    expect(JSON.parse(built.courses.get('900002001')!)).toEqual({
      code: '900002001',
      passages: [
        { section: '課名', text: '財務報表分析' },
        { section: '簡介', text: '學習閱讀資產負債表與現金流量表。' },
        { section: '評分', text: '期中考 40%，期末考 60%' },
      ],
    });
  });

  test('is byte-stable for the same corpus', () => {
    expect(buildSyllabusArtifacts(corpus).index).toBe(buildSyllabusArtifacts(corpus).index);
  });
});

describe('searchSyllabi', () => {
  const index = loadSyllabusIndex(buildSyllabusArtifacts(corpus).index);

  test('finds courses by Chinese words inside the syllabus', () => {
    expect(searchSyllabi(index, '神經網路').map(({ code }) => code)).toEqual(['900001001']);
    expect(searchSyllabi(index, '現金流量')[0]).toMatchObject({ code: '900002001', section: '簡介', passage: 1 });
  });

  test('ranks the better match first and returns nothing for an empty query', () => {
    expect(searchSyllabi(index, '期末考')[0]?.code).toBe('900002001');
    expect(searchSyllabi(index, '   ')).toEqual([]);
  });
});

// 2026-11-01 真實語料實測：全部索引 gzip 3.72 MB，超過 3 MB；不索引「每週進度」原文（沒有週次表的課）後 2.95 MB。
test('keeps weekly prose in the course file but out of the index', () => {
  const prose = JSON.stringify({ code: '900009001', title: '合成討論課', description: '', objectives: '', grading: '', prerequisite: '', weekly: [], weeklyText: '每週閱讀獨特關鍵詞量子貓', hash: 'd'.repeat(64) });
  const built = buildSyllabusArtifacts([corpus, prose].join('\n'));
  expect(JSON.parse(built.courses.get('900009001')!).passages.map(({ section }: { section: string }) => section)).toEqual(['課名', '每週進度']);
  expect(searchSyllabi(loadSyllabusIndex(built.index), '量子貓')).toEqual([]);
  expect(searchSyllabi(loadSyllabusIndex(built.index), '合成討論課')[0]?.code).toBe('900009001');
});
