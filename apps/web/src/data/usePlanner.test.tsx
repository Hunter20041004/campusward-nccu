import { act, renderHook } from '@testing-library/react';
import { STORAGE_KEY, rowToCourse, type Course, type StorageLike } from '@campusward/engine';
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
