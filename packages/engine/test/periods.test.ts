import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  NCCU_PERIODS,
  formatMeetings,
  formatNccuSchedule,
  gridPlacement,
  parseMeetings,
  periodsForRange,
} from '../src/periods.ts';

// 移植自舊專案 tests/nccu-periods.test.mjs
test('defines the 16 official NCCU periods in display order', () => {
  expect(NCCU_PERIODS.map(({ code }) => code)).toEqual(
    ['A', 'B', '1', '2', '3', '4', 'C', 'D', '5', '6', '7', '8', 'E', 'F', 'G', 'H'],
  );
  expect(NCCU_PERIODS.find(({ code }) => code === 'D')).toEqual({
    code: 'D', start: 790, end: 840, time: '13:10–14:00', special: false,
  });
});

test('converts exact and offset minute ranges to NCCU period codes', () => {
  expect(periodsForRange(790, 960).map(({ code }) => code).join('')).toBe('D56');
  expect(periodsForRange(1110, 1280).map(({ code }) => code).join('')).toBe('EFGH');
});

test('formats a course time with weekday and NCCU codes', () => {
  expect(formatNccuSchedule({ day: 4, start: 790, end: 960 }, ['', '週一', '週二', '週三', '週四'])).toBe('週四 D56');
});

test('places a spanning course on the matching grid rows', () => {
  expect(gridPlacement({ day: 4, start: 790, end: 960 })).toEqual({ rowStart: 9, rowSpan: 3, codes: 'D56' });
});

// 新增（計畫 1.1）
describe('parseMeetings', () => {
  test('parses one meeting', () => {
    expect(parseMeetings('四D56')).toEqual([{ day: 4, start: 790, end: 960, label: '四D56' }]);
  });

  test('parses several meetings and Sunday', () => {
    expect(parseMeetings('一34日EF').map(({ day, label }) => ({ day, label }))).toEqual([
      { day: 1, label: '一34' },
      { day: 7, label: '日EF' },
    ]);
  });

  test('returns no meetings for an empty or unscheduled time', () => {
    expect(parseMeetings('')).toEqual([]);
    expect(parseMeetings('未定')).toEqual([]);
  });
});

describe('formatMeetings', () => {
  test('formats meetings back to the official text', () => {
    expect(formatMeetings([{ day: 2, start: 610, end: 780, label: '' }])).toBe('二34C');
  });

  test('round-trips any contiguous official period run', () => {
    const run = fc
      .tuple(fc.integer({ min: 1, max: 7 }), fc.integer({ min: 0, max: 15 }), fc.integer({ min: 1, max: 16 }))
      .map(([day, from, length]) => {
        const codes = NCCU_PERIODS.slice(from, Math.min(16, from + length)).map(({ code }) => code).join('');
        return `${'一二三四五六日'[day - 1]}${codes}`;
      });
    fc.assert(fc.property(fc.array(run, { minLength: 1, maxLength: 3 }), (parts) => {
      const text = parts.join('');
      expect(formatMeetings(parseMeetings(text))).toBe(text);
    }));
  });
});
