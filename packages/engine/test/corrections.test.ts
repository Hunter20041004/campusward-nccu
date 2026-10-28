import { describe, expect, test } from 'vitest';
import corrections1151 from '../../../data/corrections/1151.json' with { type: 'json' };
import { applyCorrections, parseCorrections } from '../src/official/corrections.ts';
import { rowToCourse } from '../src/official/course.ts';
import type { Term } from '../src/term.ts';
import { officialRow } from './fixtures/synthetic/official-rows.ts';

const table = parseCorrections(corrections1151);
const TAICA = '【臺灣大專院校人工智慧學程聯盟課程】';

function corrected(code: string, overrides: Record<string, unknown> = {}, term: Term = { year: 115, semester: 1 }) {
  const { course } = rowToCourse(officialRow({ subNum: code, subTime: '未定或彈性', note: `＠備註:${TAICA}`, ...overrides }), term);
  if (!course) throw new Error('row rejected');
  return applyCorrections(course, table);
}

describe('uncorrected courses', () => {
  test('default to in-person synchronous attendance', () => {
    const course = corrected('900123001', { subTime: '四D56', note: '' });
    expect(course.delivery).toEqual({ mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' });
    expect(course.events).toEqual([]);
    expect(course.correctionId).toBeUndefined();
  });

  // 移植自舊 adapter：不從備註或彈性時間推斷非同步
  test('keeps TAICA physical AI synchronous-only despite remote and TAICA notes', () => {
    const course = corrected('070450001', { note: `＠備註:${TAICA}TAICA衛星課程，遠距上課使用NTUCOOL平台。` });
    expect(course.delivery.asyncAllowed).toBe(false);
    expect(course.delivery.defaultAttendance).toBe('sync');
  });

  test('does not infer asynchronous attendance from a flexible intensive course time', () => {
    const course = corrected('070401001', { note: '＠備註:本課為9/12、9/19兩天密集授課。' });
    expect(course.delivery.asyncAllowed).toBe(false);
  });

  test('does not infer asynchronous attendance for a flexible practical project', () => {
    const course = corrected('783006001', { note: '＠備註:上課時間地點另以教學大綱公告為準。' });
    expect(course.delivery.asyncAllowed).toBe(false);
  });
});

describe('term-keyed corrections', () => {
  test('does not apply a correction to the same course code in another semester', () => {
    const course = corrected('701889001', { y: '115', s: '2', subTime: '二78E' }, { year: 115, semester: 2 });
    expect(course.correctionId).toBeUndefined();
    expect(course.meetings).toHaveLength(1);
  });

  test('rejects a malformed correction table', () => {
    expect(() => parseCorrections({ corrections: { '1151:x': { deliveryMode: 'teleport' } } })).toThrow();
    expect(() => parseCorrections({ corrections: { nokey: { correctionId: 'a', deliveryMode: 'asynchronous', meetings: [] } } })).toThrow();
  });
});

// 移植自舊專案 tests/nccu-course-adapter.test.mjs（attendance 改由 delivery.defaultAttendance 表示）
describe('verified corrections for this data set', () => {
  test('keeps the remote generative AI course free of a weekly slot while retaining its one-time week-11 exam', () => {
    const course = corrected('701889001', { subTime: '二78E', note: '' });
    expect(course.meetings).toEqual([]);
    expect(course.delivery).toEqual({ mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' });
    expect(course.events).toEqual([{ label: '第 11 週上機考', week: 11, day: 2, start: 970, end: 1140 }]);
  });

  test('defaults verified TAICA fintech to asynchronous while retaining its synchronous meeting', () => {
    const course = corrected('070424001');
    expect(course.delivery).toEqual({ mode: 'asynchronous-optional', asyncAllowed: true, defaultAttendance: 'async' });
    expect(course.meetings).toEqual([{ day: 3, start: 550, end: 730, label: '週三 09:10–12:10' }]);
    expect(course.events).toEqual([{ label: '實體期末考，時間待確認', date: '2026-12-23' }]);
    expect(course.correctionId).toBe('nccu-1151-taica-070424001');
  });

  test('maps verified TAICA 070421001 to asynchronous attendance and its official obligations', () => {
    const course = corrected('070421001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 1, start: 540, end: 720, label: '週一 09:00–12:00' }]);
    expect(course.events).toEqual([{ label: '實體考試', date: '2026-12-14', day: 1, start: 540, end: 720 }]);
  });

  test('maps verified TAICA 070422001 obligations without fake times', () => {
    const course = corrected('070422001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 1, start: 540, end: 720, label: '週一 09:00–12:00' }]);
    expect(course.events).toEqual([
      { label: '實體期中考，時間待確認', date: '2026-11-02' },
      { label: '實體期末考，時間待確認', date: '2026-12-21' },
    ]);
    expect(course.notes.informationNotes.includes('每週課間測驗，請依最新課綱確認同步要求')).toBeTruthy();
  });

  test('maps verified TAICA 070423001 synchronous exam', () => {
    const course = corrected('070423001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 4, start: 790, end: 960, label: '週四 13:10–16:00' }]);
    expect(course.events).toEqual([{ label: '實體同步考試', date: '2026-12-10', day: 4, start: 790, end: 960 }]);
  });

  test('reports conflicting official dates for TAICA 070425001', () => {
    const course = corrected('070425001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 3, start: 550, end: 730, label: '週三 09:10–12:10' }]);
    expect(course.events).toEqual([{ label: '考試日期官方資料不一致（10/28、12/16 或 12/23），待官方確認' }]);
    expect(course.notes.informationNotes.includes('週二 13:20–15:10 optional recitation')).toBeTruthy();
  });

  test('maps verified TAICA 070426001 showcase reminder', () => {
    const course = corrected('070426001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 4, start: 790, end: 960, label: '週四 13:10–16:00' }]);
    expect(course.events).toEqual([{ label: '共同展示交流', date: '2026-12-26' }]);
  });

  test('maps verified TAICA 070427001 physical exam', () => {
    const course = corrected('070427001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 4, start: 540, end: 720, label: '週四 09:00–12:00' }]);
    expect(course.events).toEqual([{ label: '實體考試', date: '2026-12-10', day: 4, start: 540, end: 720 }]);
  });

  test('maps verified TAICA 070455001 pending-time exam', () => {
    const course = corrected('070455001');
    expect(course.delivery.defaultAttendance).toBe('async');
    expect(course.meetings).toEqual([{ day: 3, start: 550, end: 730, label: '週三 09:10–12:10' }]);
    expect(course.events).toEqual([{ label: '實體同步考試，時間待確認', date: '2026-12-09' }]);
  });

  test('adds the correction delivery note without duplicating it', () => {
    const once = corrected('070424001');
    const twice = applyCorrections(once, table);
    expect(twice.notes.deliveryNotes.filter((note) => note.startsWith('官方'))).toHaveLength(1);
    expect(twice.events).toEqual(once.events);
  });
});
