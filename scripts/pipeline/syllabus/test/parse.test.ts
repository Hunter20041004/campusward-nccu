import { describe, expect, test } from 'vitest';
import { parseSyllabus, weekNumber, type SyllabusFields } from '../parse.ts';
import { big5MaintenancePage, big5NotUploadedPage, syllabusPage, weekTable, type PageOptions } from './fixtures/synthetic/page.ts';

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

  // 獨立審查（2026-11-01）找到的寫法：MM.DD 日期不是週次、週次區間取起始週、「1. 9/11」是第 1 週、
  // 被空白拆開的「1 1」是 11、中文週次後面直接接日期。
  test.each([
    ['1-7', 1], ['9-15', 9], ['13 - 15', 13], ['1~2', 1], ['5–6', 5], ['1. 9/11', 1], ['1 1', 11], ['1 4', 14],
    ['三9/23', 3], ['十一11/18', 11], ['一五 12/16', 15],
  ])('%s → %i', (cell, expected) => {
    expect(weekNumber(cell, 99)).toBe(expected);
  });

  test('MM.DD dates take their position instead of being read as a week', () => {
    expect(weekNumber('09.07', 1)).toBe(1);
    expect(weekNumber('09.14', 2)).toBe(2);
    expect(weekNumber('10.05(一)', 5)).toBe(5);
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
    expect(elsewhere.weeklyText).toBe('詳見下方'); // 每週區塊自己的文字一律保留（獨立審查 2026-11-01）
    const bibliography = parsed({ weekly: '<p>詳見書目</p>', bibliography: weekTable(sixteenWeeks) });
    expect(bibliography.weekly).toEqual([]);
    expect(bibliography.weeklyText).toBe('詳見書目');
    const officeHours = parsed({ weekly: '<p>無</p>', officeHours: weekTable(sixteenWeeks) });
    expect(officeHours.weekly).toEqual([]);
  });

  test('keeps a description or objectives written inside a table', () => {
    const fields = parsed({
      description: '<p>前言。</p><table><tr><td>一、本課程介紹測試的觀念</td></tr><tr><td>二、以實作練習</td></tr></table>',
      objectives: '<table><tr><td>目標</td><td>能寫出可重現的測試</td></tr></table>',
    });
    expect(fields.description).toBe('前言。\n一、本課程介紹測試的觀念\n二、以實作練習');
    expect(fields.objectives).toBe('目標 | 能寫出可重現的測試');
  });

  test('skips a topic cell that is a date with a year, a date range or a month range', () => {
    const rows = [
      ['1', '2030/9/8', '導論'], ['2', '9/15/2030', '方法'], ['3', '119/9/22', '實作'], ['4', '9/29~10/2', '討論'],
      ['5', 'Oct 06-09', '報告'], ['6', '10/13-10/16', '期中考'], ['7', '(W7) 10/20', '回饋'], ['8', 'Oct. 27 - Oct. 30', '總結'],
    ];
    expect(parsed({ weekly: weekTable(rows, ['週次', '日期', '主題']) }).weekly.map(({ topic }) => topic))
      .toEqual(['導論', '方法', '實作', '討論', '報告', '期中考', '回饋', '總結']);
  });

  test('skips a date and then a unit-number column to reach the topic', () => {
    const rows = [['1', '119/9/10', '一', '導論'], ['2', '119/9/17', '一', '方法'], ['3', '119/9/24', '二', '實作']];
    expect(parsed({ weekly: weekTable(rows, ['週次', '日期', '單元', '主題']) }).weekly.map(({ topic }) => topic)).toEqual(['導論', '方法', '實作']);
  });

  test('joins a schedule split over several tables, without repeating weeks', () => {
    const part = (from: number, to: number) => weekTable(Array.from({ length: to - from + 1 }, (_, index) => [`${from + index}`, `單元 ${from + index}`]));
    const split = parsed({ weekly: `<p>單元一</p>${part(1, 4)}<p>單元二</p>${part(5, 9)}${part(10, 14)}${part(15, 18)}` });
    expect(split.weekly.map(({ week }) => week)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    const withSingle = parsed({ weekly: `${part(1, 5)}${part(6, 8)}${part(9, 9)}${part(11, 13)}` });
    expect(withSingle.weekly.map(({ week }) => week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]);
    const modules = parsed({ weekly: `${part(1, 5)}${part(6, 8)}${part(9, 13)}${part(14, 17)}` });
    expect(modules.weekly).toHaveLength(17);
    expect(modules.weekly[16]).toEqual({ week: 17, topic: '單元 17' });
  });

  test('reads Chinese week numbers written right before the date', () => {
    const rows = ['一 9/9', '二 9/16', '三9/23', '四9/30', '十一11/18', '一五 12/16'].map((cell, index) => [cell, `主題${index}`]);
    expect(parsed({ weekly: weekTable(rows) }).weekly.map(({ week }) => week)).toEqual([1, 2, 3, 4, 11, 15]);
  });

  test('a week cell like "1. 9/11" keeps its topic', () => {
    const rows = [['1. 9/11', 'Lecture 0: 基本介紹'], ['2. 9/18', 'Lecture 1: 資料'], ['3. 9/25', 'Lecture 2: 圖表']];
    expect(parsed({ weekly: weekTable(rows, ['週次', '主題']) }).weekly).toEqual([
      { week: 1, topic: 'Lecture 0: 基本介紹' }, { week: 2, topic: 'Lecture 1: 資料' }, { week: 3, topic: 'Lecture 2: 圖表' },
    ]);
  });

  test('weeks written as ranges or as MM.DD dates are numbered correctly', () => {
    const ranges = parsed({ weekly: weekTable([['1-7', '第一部分'], ['8', '期中考'], ['9-15', '第二部分'], ['16', '期末考']]) });
    expect(ranges.weekly.map(({ week }) => week)).toEqual([1, 8, 9, 16]);
    const dots = parsed({ weekly: weekTable([['09.07', '導論'], ['09.14', '方法'], ['09.21', '實作'], ['09.28', '放假']], ['日期', '主題']) });
    expect(dots.weekly.map(({ week }) => week)).toEqual([1, 2, 3, 4]);
  });

  test('never takes a grading table from another section as the schedule, and keeps the weekly prose', () => {
    const grading = `<table><tr><td>項目</td><td>配分</td></tr><tr><td>1</td><td>作業一 10%</td></tr><tr><td>2</td><td>作業二 15%</td></tr>
      <tr><td>3</td><td>期中報告 30%</td></tr><tr><td>4</td><td>期末報告 45%</td></tr></table>`;
    const fields = parsed({ weekly: '<p>9/8 第一章 導論<br>9/15 第二章 方法<br>9/22 第三章 實作</p>', grading });
    expect(fields.weekly).toEqual([]);
    expect(fields.weeklyText).toBe('9/8 第一章 導論\n9/15 第二章 方法\n9/22 第三章 實作');
    const objectivesSchedule = parsed({ weekly: '<p>第8週為期中考。</p>', objectives: `<p>以下為進度：</p>${weekTable(sixteenWeeks)}` });
    expect(objectivesSchedule.weekly).toHaveLength(16);
    expect(objectivesSchedule.weeklyText).toBe('第8週為期中考。');
  });

  test('keeps the weekly prose next to the week table', () => {
    const fields = parsed({ weekly: `<p>進度依實際情況調整。</p>${weekTable(sixteenWeeks)}` });
    expect(fields.weekly).toHaveLength(16);
    expect(fields.weeklyText).toBe('進度依實際情況調整。');
  });

  test('normalises full-width characters and whitespace', () => {
    const fields = parsed({ description: '<p>ＡＢＣ　１２３&nbsp;&nbsp;課程</p>\n\n\n<p>  下一段 </p>' });
    expect(fields.description).toBe('ABC 123 課程\n下一段');
  });

  test('only the official notice counts as not uploaded', () => {
    expect(parseSyllabus(big5NotUploadedPage())).toEqual({ status: 'notUploaded' });
    expect(parseSyllabus(encode('<html><body><p>目前本系統沒有說明文件 ‧本科目尚無教學大綱上傳</p></body></html>'))).toEqual({ status: 'notUploaded' });
  });

  test('a maintenance or error page is unrecognized, not "not uploaded"', () => {
    expect(parseSyllabus(encode('<html><body><p>系統維護中</p></body></html>'))).toEqual({ status: 'unrecognized' });
    expect(parseSyllabus(big5MaintenancePage())).toEqual({ status: 'unrecognized' });
    expect(parseSyllabus(encode(''))).toEqual({ status: 'unrecognized' });
  });
});
