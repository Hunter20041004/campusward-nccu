import { describe, expect, test } from 'vitest';
import { parseSyllabus, weekNumber, type SyllabusFields } from '../parse.ts';
import { big5NotUploadedPage, syllabusPage, weekTable, type PageOptions } from './fixtures/synthetic/page.ts';

const encode = (html: string) => new TextEncoder().encode(html);

function parsed(options: PageOptions = {}): SyllabusFields {
  const result = parseSyllabus(encode(syllabusPage(options)));
  if (result.status !== 'ok') throw new Error('expected a parsed page');
  return result.fields;
}

const sixteenWeeks = Array.from({ length: 16 }, (_, index) => [`第${index + 1}週`, `主題 ${index + 1}`, `閱讀 ${index + 1}`, '']);

describe('weekNumber', () => {
  test.each([
    ['第一週', 1], ['第十週', 10], ['第十六週', 16], ['第二十週', 20], ['二', 2], ['第1週', 1], ['第 12 周', 12],
    ['Week 2', 2], ['week2', 2], ['W.1', 1], ['W3', 3], ['Wk. 4', 4], ['Session 5', 5], ['3', 3], ['１２', 12], ['7.', 7], ['1* (9/9)', 1], ['Class 6', 6], ['Lecture 2', 2],
  ])('%s → %i', (cell, expected) => {
    expect(weekNumber(cell, 99)).toBe(expected);
  });

  test('date-only rows take their position', () => {
    expect(weekNumber('9/15', 1)).toBe(1);
    expect(weekNumber('10／06（一）', 4)).toBe(4);
    expect(weekNumber('Sep. 16', 2)).toBe(2);
    expect(weekNumber('Oct 7', 5)).toBe(5);
  });

  test.each(['週次', 'Week', '人文關懷課程', '', '週一', '期中考'])('not a week: %s', (cell) => {
    expect(weekNumber(cell, 1)).toBeNull();
  });
});

describe('parseSyllabus', () => {
  test('keeps the whitelisted sections and nothing else', () => {
    const fields = parsed({
      titleZh: '測試課程導論',
      titleEn: 'Introduction to Testing',
      description: '<p>第一段介紹。</p><h2>老師自己寫的小標題</h2><p>第二段介紹。</p>',
      objectives: '<p>學會寫測試。</p>',
      grading: '<p>平時表現 20%</p><table><tr><td>期中報告</td><td>30%</td></tr><tr><td>期末考</td><td>50%</td></tr></table>',
      weekly: weekTable(sixteenWeeks),
    });
    expect(fields.title).toBe('測試課程導論 Introduction to Testing');
    expect(fields.description).toBe('第一段介紹。\n老師自己寫的小標題\n第二段介紹。');
    expect(fields.objectives).toBe('學會寫測試。');
    expect(fields.grading).toBe('平時表現 20%\n期中報告 | 30%\n期末考 | 50%');
    expect(fields.prerequisite).toBe('');
    expect(fields.weekly).toHaveLength(16);
    expect(fields.weekly[0]).toEqual({ week: 1, topic: '主題 1' });
    expect(fields.weeklyText).toBe('');
    const all = JSON.stringify(fields);
    for (const leaked of ['核心能力', '人文關懷', '講述', '測試入門', 'Office', '10:00', '測試助教', 'example.com', '大綱.pdf', '不應被收錄', '2017', '測試教師', '版權所有', 'AI使用']) {
      expect(all).not.toContain(leaked);
    }
  });

  test('removes HTML comments, scripts and styles before reading sections', () => {
    const fields = parsed({ description: '<!--2018.4.12新增--><p>內容</p><script>alert("x")</script><style>p{}</style><!--/.row!-->' });
    expect(fields.description).toBe('內容');
  });

  test('reads the prerequisite and treats placeholder values as empty', () => {
    expect(parsed({ prerequisite: '統計學（一）' }).prerequisite).toBe('統計學(一)'); // NFKC：全形標點轉半形
    for (const empty of ['無', '無資料', 'N/A', 'n/a', 'none', 'None', '-', '—', '  無 ']) {
      expect(parsed({ prerequisite: empty }).prerequisite).toBe('');
    }
  });

  test('supports the common week labels and skips header rows', () => {
    const labels = ['W.1', 'W.2', 'W.3', 'W.4'];
    expect(parsed({ weekly: weekTable(labels.map((label, index) => [label, `T${index}`])) }).weekly.map(({ week }) => week)).toEqual([1, 2, 3, 4]);
    const english = ['Week 1', 'Week 2', 'Week 3'];
    expect(parsed({ weekly: weekTable(english.map((label) => [label, 'Topic'])) }).weekly).toHaveLength(3);
    const sessions = ['Session 1', 'Session 2', 'Session 3'];
    expect(parsed({ weekly: weekTable(sessions.map((label) => [label, 'Topic'])) }).weekly).toHaveLength(3);
  });

  test('numbers date-only rows by their order', () => {
    const fields = parsed({ weekly: weekTable([['9/15', '導論'], ['9/22', '方法'], ['9/29', '實作'], ['10/6', '報告']], ['日期', '主題']) });
    expect(fields.weekly).toEqual([{ week: 1, topic: '導論' }, { week: 2, topic: '方法' }, { week: 3, topic: '實作' }, { week: 4, topic: '報告' }]);
  });

  test('a date column before the week column: the week column wins', () => {
    const fields = parsed({ weekly: weekTable([['Sep. 9', '1', 'Introduction'], ['Sep. 16', '2', ''], ['Sep. 23', '3', 'Taiwan'], ['Sep. 30', '5', 'Food']], ['Date', 'WK', 'Class Topic']) });
    expect(fields.weekly).toEqual([{ week: 1, topic: 'Introduction' }, { week: 3, topic: 'Taiwan' }, { week: 5, topic: 'Food' }]);
  });

  test('an empty topic cell falls back to the next column', () => {
    const fields = parsed({ weekly: weekTable([['1', '', '閱讀一'], ['2', '主題二', ''], ['3', '主題三', '']]) });
    expect(fields.weekly.map(({ topic }) => topic)).toEqual(['閱讀一', '主題二', '主題三']);
  });

  test('finds a week table nested inside a layout table, without repeating its text', () => {
    const nested = `<table><tr><td>週次 Week 課程主題 Topic</td></tr><tr><td>${weekTable(sixteenWeeks)}</td></tr></table>`;
    expect(parsed({ weekly: nested }).weekly).toHaveLength(16);
    const notWeeks = `<table><tr><td>說明</td></tr><tr><td>${weekTable([['1', '甲'], ['2', '乙']], [])}</td></tr></table>`;
    expect(parsed({ weekly: notWeeks }).weeklyText).toBe('說明\n1 甲 2 乙');
  });

  test('uses the next column when the topic column is a date', () => {
    const fields = parsed({ weekly: weekTable([['1', '9/15', '導論'], ['2', '9/22', '方法'], ['3', '9/29', '實作']], ['週次', '日期', '主題']) });
    expect(fields.weekly.map(({ topic }) => topic)).toEqual(['導論', '方法', '實作']);
  });

  test('picks the largest week table and needs at least three rows', () => {
    const small = weekTable([['1', '小表一'], ['2', '小表二'], ['3', '小表三']]);
    const big = weekTable(sixteenWeeks);
    expect(parsed({ weekly: small + big }).weekly).toHaveLength(16);
    const fields = parsed({ weekly: `<p>依進度調整</p>${weekTable([['1', '只有'], ['2', '兩列']], [])}` });
    expect(fields.weekly).toEqual([]);
    expect(fields.weeklyText).toBe('依進度調整\n1 | 只有\n2 | 兩列');
  });

  test('keeps the weekly prose when there is no week table', () => {
    const fields = parsed({ weekly: '<p>第一週：課程介紹<br />第二週：分組<br>\n第三週：實作</p>' });
    expect(fields.weekly).toEqual([]);
    expect(fields.weeklyText).toBe('第一週:課程介紹\n第二週:分組\n第三週:實作');
  });

  test('looks for a week table in another section, but never the bibliography', () => {
    const elsewhere = parsed({ weekly: '<p>詳見下方</p>', teaching: weekTable(sixteenWeeks) });
    expect(elsewhere.weekly).toHaveLength(16);
    expect(elsewhere.weeklyText).toBe('');
    const bibliography = parsed({ weekly: '<p>詳見書目</p>', bibliography: weekTable(sixteenWeeks) });
    expect(bibliography.weekly).toEqual([]);
    expect(bibliography.weeklyText).toBe('詳見書目');
    const officeHours = parsed({ weekly: '<p>無</p>', officeHours: weekTable(sixteenWeeks) });
    expect(officeHours.weekly).toEqual([]);
  });

  test('normalises full-width characters and whitespace', () => {
    const fields = parsed({ description: '<p>ＡＢＣ　１２３&nbsp;&nbsp;課程</p>\n\n\n<p>  下一段 </p>' });
    expect(fields.description).toBe('ABC 123 課程\n下一段');
  });

  test('Big5 pages (not uploaded yet) and pages without the template are not uploaded', () => {
    expect(parseSyllabus(big5NotUploadedPage())).toEqual({ status: 'notUploaded' });
    expect(parseSyllabus(encode('<html><body><p>系統維護中</p></body></html>'))).toEqual({ status: 'notUploaded' });
  });
});
