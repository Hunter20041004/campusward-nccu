import { act, renderHook } from '@testing-library/react';
import { CORRUPT_KEY, PRE_IMPORT_KEY, STORAGE_KEY, rowToCourse, type Course, type StorageLike } from '@campusward/engine';
import { describe, expect, test } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { usePlanner } from './usePlanner.ts';

const course = (code: string, subTime: string): Course => rowToCourse(officialRow({ subNum: code, subTime }), { year: 115, semester: 1 }).course!;
const courses = [course('900001001', '一234'), course('900002001', '一34'), course('900003001', '二234')];

function memory(initial: Record<string, string> = {}): StorageLike & { values: Record<string, string> } {
  const values = { ...initial };
  return { values, getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; } };
}

const setup = (storage = memory()) => renderHook(() => usePlanner({ term: '1151', courses, storage }));

describe('usePlanner', () => {
  test('starts with an empty main plan', () => {
    const { result } = setup();
    expect(result.current.activePlan.items).toEqual([]);
    expect(result.current.entries).toEqual([]);
  });

  test('adds a course, saves it, and restores it on the next visit', () => {
    const storage = memory();
    const { result } = setup(storage);
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入課程'); });
    expect(result.current.entries.map(({ course: c }) => c.code)).toEqual(['900001001']);
    expect(storage.values[STORAGE_KEY]).toContain('1151:900001001');
    const next = setup(storage);
    expect(next.result.current.entries.map(({ course: c }) => c.code)).toEqual(['900001001']);
  });

  test('reports conflicts and total credits', () => {
    const { result } = setup();
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }, { type: 'addToSchedule', key: '1151:900002001' }], '加入'); });
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.credits).toBe(6);
  });

  test('a profile change with a label can be undone (identity from an imported record)', () => {
    const { result } = setup();
    act(() => { result.current.setProfile({ level: 'undergrad', year: 1 }); });
    expect(result.current.undoLabel).toBeNull();
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    act(() => { result.current.setProfile({ level: 'undergrad', year: 2, className: '資訊二' }, '已依全人系統資料設定為資訊二'); });
    expect(result.current.undoLabel).toBe('已依全人系統資料設定為資訊二');
    act(() => { result.current.undo(); });
    expect(result.current.profile).toEqual({ level: 'undergrad', year: 1 });
    // 只復原身分，課表不動。
    expect(result.current.entries.map(({ course: c }) => c.code)).toEqual(['900001001']);
    expect(result.current.undoLabel).toBeNull();
  });

  test('a later identity edit drops the import undo, so undo cannot wipe that edit', () => {
    const { result } = setup();
    act(() => { result.current.setProfile({ level: 'undergrad', year: 2, className: '資訊二' }, '已依全人系統資料設定為資訊二'); });
    act(() => { result.current.setProfile({ level: 'undergrad', year: 2, className: '資訊二', additionalMajor: 'double' }); });
    expect(result.current.undoLabel).toBeNull();
    act(() => { result.current.undo(); });
    expect(result.current.profile).toEqual({ level: 'undergrad', year: 2, className: '資訊二', additionalMajor: 'double' });
  });

  test('an identity edit keeps a course-change undo (it only restores the timetable)', () => {
    const { result } = setup();
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    act(() => { result.current.setProfile({ level: 'undergrad', year: 1 }); });
    expect(result.current.undoLabel).toBe('加入');
  });

  test('undoes the last change', () => {
    const { result } = setup();
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '已加入 合成課程概論'); });
    expect(result.current.undoLabel).toBe('已加入 合成課程概論');
    act(() => { result.current.undo(); });
    expect(result.current.entries).toEqual([]);
    expect(result.current.undoLabel).toBeNull();
  });

  test('says when stored data was broken and the backup was used', () => {
    const storage = memory({ [STORAGE_KEY]: '{broken' });
    const { result } = setup(storage);
    expect(result.current.notice).toBe('這台裝置上的課表資料讀取失敗，已改用備份或從空白開始。');
  });
});

// 獨立審查修正（2026-11-01）：存檔失敗或課程資料未載入時不假裝成功。
describe('honest saving', () => {
  test('keeps the timetable unchanged and explains when storage refuses the write', () => {
    const storage = memory();
    storage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    const { result } = setup(storage);
    let outcome: ReturnType<typeof result.current.apply> | undefined;
    act(() => { outcome = result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    expect(outcome?.status).toBe('rejected');
    expect(result.current.entries).toEqual([]);
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.notice).toMatch(/沒有存檔/);
  });

  test('does not pretend to save before the course data has loaded', () => {
    const { result } = renderHook(() => usePlanner({ term: '', courses: [], storage: memory() }));
    let outcome: ReturnType<typeof result.current.apply> | undefined;
    act(() => { outcome = result.current.apply([{ type: 'createPlan', name: '備案 1' }], '已另存'); });
    expect(outcome).toEqual({ status: 'rejected', errors: ['課程資料還沒載入，沒有存檔。'] });
    expect(result.current.undoLabel).toBeNull();
  });

  test('explains when an import cannot be saved and keeps the current data', () => {
    const storage = memory();
    const { result } = setup(storage);
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    storage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    act(() => { result.current.replaceData({ profile: { year: 2 }, customConditions: [], terms: {} }); });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.notice).toMatch(/沒有匯入/);
  });

  test('clears the new-course labels after an import', () => {
    const { result } = setup();
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    expect(result.current.newKeys.size).toBe(1);
    act(() => { result.current.replaceData({ profile: {}, customConditions: [], terms: {} }); });
    expect(result.current.newKeys.size).toBe(0);
  });

  test('keeps the same undo-expiry callback between renders', () => {
    const { result, rerender } = setup();
    const first = result.current.clearUndo;
    rerender();
    expect(result.current.clearUndo).toBe(first);
  });
});

// 獨立審查修正（2026-11-01，G2）
describe('restoring an import', () => {
  test('returns to the data from before the first of several imports', () => {
    const storage = memory();
    const { result } = setup(storage);
    act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900001001' }], '加入'); });
    expect(result.current.canRestoreImport).toBe(false);
    act(() => { result.current.replaceData({ profile: { year: 2 }, customConditions: [], terms: {} }); });
    act(() => { result.current.replaceData({ profile: { year: 3 }, customConditions: [], terms: {} }); });
    expect(result.current.canRestoreImport).toBe(true);
    act(() => { result.current.restoreBeforeImport(); });
    expect(result.current.entries.map(({ course }) => course.code)).toEqual(['900001001']);
    expect(result.current.canRestoreImport).toBe(false);
  });

  test('clearing local data also removes the pre-import and unreadable copies', () => {
    const storage = memory({ [CORRUPT_KEY]: '{old' });
    const { result } = setup(storage);
    act(() => { result.current.replaceData({ profile: { year: 2 }, customConditions: [], terms: {} }); });
    act(() => { result.current.clearAll(); });
    expect(storage.values[PRE_IMPORT_KEY]).toBe('');
    expect(storage.values[CORRUPT_KEY]).toBe('');
    expect(result.current.canRestoreImport).toBe(false);
  });
});

// 獨立審查修正（2026-11-01 第二輪）：AI 回覆前學生自己改的課不能被舊狀態蓋掉。
test('applies a late AI change set on top of changes made while waiting', () => {
  const { result } = setup();
  const staleApplyAi = result.current.applyAi;
  act(() => { result.current.apply([{ type: 'addToSchedule', key: '1151:900003001' }], '自己加的'); });
  act(() => { staleApplyAi([{ type: 'addToSchedule', key: '1151:900001001' }], 'AI 已修改課表'); });
  expect(result.current.entries.map(({ course: c }) => c.code)).toEqual(['900003001', '900001001']);
  act(() => { result.current.undo(); });
  expect(result.current.entries.map(({ course: c }) => c.code)).toEqual(['900003001']);
});
