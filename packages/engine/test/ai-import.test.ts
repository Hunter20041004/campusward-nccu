import { describe, expect, test } from 'vitest';
import {
  importChanges,
  matchRecognizedCourses,
  parseRecognizedCourses,
  validateImportImage,
  validateScreenshotFile,
} from '../src/ai/import.ts';
import { rowToCourse, type Course } from '../src/official/course.ts';
import { createPlannerState } from '../src/plans.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

// 移植自舊專案 tests/ai-service.test.mjs（截圖匯入的確定性部分）、ai-contracts、ai-planner。
// 舊版逐筆向政大即時查詢；新版比對本機的全校課程快照，其餘判斷相同。
function course(code: string, title: string, teacher: string, extra: Record<string, unknown> = {}): Course {
  const { course: built } = rowToCourse(officialRow({ subNum: code, subNam: title, teaNam: teacher, ...extra }), TERM);
  if (!built) throw new Error('row rejected');
  return built;
}
const recognized = (courseCode: string, title: string, teacher = '') => ({ courseCode, title, teacher, credits: null, scheduleText: '', confidence: 0.99 });
const codes = (courses: Course[]) => courses.map(({ code }) => code);

describe('matchRecognizedCourses', () => {
  test('matches recognized course codes against the snapshot', () => {
    const result = matchRecognizedCourses([recognized('900055001', '人機互動')], [course('900055001', '人機互動', '王合成')]);
    expect(codes(result.matched)).toEqual(['900055001']);
  });

  test('returns ambiguous official matches as pending instead of importing them', () => {
    const snapshot = [course('900456001', '未知課程', '老師'), course('900456002', '未知課程', '老師')];
    const result = matchRecognizedCourses([recognized('', '未知課程', '老師')], snapshot);
    expect(result.matched).toHaveLength(0);
    expect(result.pending[0]?.reason).toBe('找到多筆官方課程，請確認班別。');
    expect(codes(result.pending[0]?.candidates ?? [])).toEqual(['900456001', '900456002']);
  });

  test('uses a recognized course code to disambiguate same-title official courses', () => {
    const snapshot = [course('900889001', '遊戲引擎應用開發', '周合成'), course('900063001', '遊戲引擎應用開發', '周合成')];
    const result = matchRecognizedCourses([recognized('900063001', '遊戲引擎應用開發', '周合成')], snapshot);
    expect(result.pending).toHaveLength(0);
    expect(codes(result.matched)).toEqual(['900063001']);
  });

  test('recovers an exact course code when OCR inserts a character into the title', () => {
    const snapshot = [course('900171001', '日文法學名著選讀（二）', '張合成')];
    const result = matchRecognizedCourses([recognized('900171001', '日文法律學名著選讀', '張合成')], snapshot);
    expect(result.matched.map(({ code, title }) => [code, title])).toEqual([['900171001', '日文法學名著選讀（二）']]);
  });

  test('falls back to a unique title prefix match by the same teacher when the code is unreadable', () => {
    const snapshot = [course('900171001', '日文法學名著選讀（二）', '張合成'), course('900172001', '日文法學專題', '李合成')];
    expect(codes(matchRecognizedCourses([recognized('', '日文法律學名著選讀', '張合成')], snapshot).matched)).toEqual(['900171001']);
  });

  test('marks an unknown course pending', () => {
    const result = matchRecognizedCourses([recognized('', '不存在的課', '老師')], [course('900001001', '統計學', '王合成')], { termLabel: '115-1' });
    expect(result.pending[0]?.reason).toBe('找不到唯一的 115-1 官方開課資料。');
  });

  test('reports a course recognized twice as a duplicate', () => {
    const snapshot = [course('900055001', '人機互動', '王合成')];
    const result = matchRecognizedCourses([recognized('900055001', '人機互動'), recognized('900055001', '人機互動')], snapshot);
    expect(codes(result.matched)).toEqual(['900055001']);
    expect(codes(result.duplicates)).toEqual(['900055001']);
  });

  test('turns an official enrollment restriction into a required selectable condition', () => {
    const snapshot = [course('900041001', '德國文學概論', '蔡合成', { note: '＠備註:僅限歐文系及雙主修學生修讀。' })];
    const [matched] = matchRecognizedCourses([recognized('900041001', '德國文學概論')], snapshot).matched;
    expect(matched?.notes.eligibilityRules).toEqual([{
      conditionId: 'official-restriction:900041001',
      conditionLabel: '我是歐文系或雙主修學生',
      conditionDescription: '政大官方限制：僅限歐文系及雙主修學生修讀',
      enforcement: 'required',
      rationale: '僅限歐文系及雙主修學生修讀',
      source: 'nccu-official',
      confidence: 'high',
    }]);
  });

  test('creates a selectable condition from a department limit without 修讀 wording', () => {
    const [matched] = matchRecognizedCourses([recognized('900456001', '系所限制課程')], [course('900456001', '系所限制課程', '老師', { note: '＠備註:限本系學生' })]).matched;
    expect(matched?.notes.eligibilityRules[0]?.conditionLabel).toBe('我符合：限本系學生');
    expect(matched?.notes.eligibilityRules[0]?.enforcement).toBe('required');
  });

  test('summarizes alternative language prerequisites as one selectable condition', () => {
    const restrictionText = '須先修習學士班日文（一）、（二）其中一門，或曾在大學修習日文語文 4 學分以上，或通過日本語能力試驗 N3 以上，或 FLPT 日語能力測驗筆試 150 分以上，始得修習本課程。';
    const [matched] = matchRecognizedCourses([recognized('900171001', '日文法學名著選讀（二）')], [course('900171001', '日文法學名著選讀（二）', '張合成', { note: `＠備註:${restrictionText}` })]).matched;
    expect(matched?.notes.eligibilityRules[0]).toMatchObject({
      conditionLabel: '我符合本課程任一項日文先修資格',
      rationale: restrictionText.replace(/。$/, ''),
    });
  });
});

describe('importChanges', () => {
  test('merges verified imports without duplicating existing candidates', () => {
    const state = { ...createPlannerState(), candidates: ['1151:900055001'] };
    const result = importChanges(state, [course('900055001', '人機互動', '王合成'), course('900123001', '新課', '王合成')]);
    expect(result).toEqual({ changes: [{ type: 'addCandidate', key: '1151:900123001' }], alreadyCandidates: ['1151:900055001'] });
  });
});

// 移植自舊 ai-contracts / ai-planner
describe('recognized course parsing and file checks', () => {
  test('parses recognized courses into a bounded normalized shape', () => {
    const result = parseRecognizedCourses(JSON.stringify({ recognizedCourses: [{
      courseCode: ' 900055001 ', title: ' 人機互動 ', teacher: '王合成', credits: 3, scheduleText: '四234', confidence: 0.97,
    }] }));
    expect(result.recognizedCourses[0]).toEqual({ courseCode: '900055001', title: '人機互動', teacher: '王合成', credits: 3, scheduleText: '四234', confidence: 0.97 });
  });

  test('clamps confidence and drops unusable credits', () => {
    const [first] = parseRecognizedCourses(JSON.stringify({ recognizedCourses: [{ title: '課', credits: 'x', confidence: 7 }] })).recognizedCourses;
    expect(first).toMatchObject({ credits: null, confidence: 1 });
  });

  test('rejects an entry without code or title, and more than 50 entries', () => {
    expect(() => parseRecognizedCourses(JSON.stringify({ recognizedCourses: [{ teacher: '老師' }] }))).toThrow('AI 回覆格式不正確。');
    expect(() => parseRecognizedCourses(JSON.stringify({ recognizedCourses: Array.from({ length: 51 }, () => ({ title: '課' })) }))).toThrow('AI 回覆格式不正確。');
  });

  test('rejects non-image import data URLs', () => {
    expect(() => validateImportImage('data:text/plain;base64,QQ==')).toThrow('只接受 PNG、JPEG 或 WebP 截圖。');
    expect(validateImportImage('data:image/png;base64,QQ==')).toBe('data:image/png;base64,QQ==');
  });

  test('rejects an oversized image data URL', () => {
    expect(() => validateImportImage(`data:image/png;base64,${'A'.repeat(4_000_000)}`)).toThrow('截圖超過 4 MB，請裁切或壓縮後重試。');
  });

  test('accepts only small PNG, JPEG, or WebP screenshot files', () => {
    expect(validateScreenshotFile({ type: 'image/gif', size: 10 })).toEqual({ message: '請選擇 PNG、JPEG 或 WebP 截圖。' });
    expect(validateScreenshotFile({ type: 'image/png', size: 3_000_001 })).toEqual({ message: '截圖超過 3 MB，請裁切或壓縮後重試。' });
    expect(validateScreenshotFile({ type: 'image/webp', size: 1000 })).toBe(null);
  });
});
