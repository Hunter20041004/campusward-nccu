import { describe, expect, test } from 'vitest';
import { formatTerm, isRowInTerm, parseTerm, pickDefaultTerm, termLabel } from '../src/term.ts';

describe('parseTerm', () => {
  test.each([
    ['1152', { year: 115, semester: 2 }],
    ['115-1', { year: 115, semester: 1 }],
    ['1001', { year: 100, semester: 1 }],
  ])('parses %s', (text, expected) => {
    expect(parseTerm(text)).toEqual(expected);
  });

  test.each(['', '115', '1153', '115-0', 'abcd', '11512'])('rejects %s', (text) => {
    expect(parseTerm(text)).toBeNull();
  });
});

test('formats the compact code used by the official query', () => {
  expect(formatTerm({ year: 115, semester: 2 })).toBe('1152');
});

test('formats the label shown to students', () => {
  expect(termLabel({ year: 115, semester: 1 })).toBe('115-1');
});

test('matches official rows by year and semester fields', () => {
  const term = { year: 115, semester: 1 } as const;
  expect(isRowInTerm({ y: '115', s: '1' }, term)).toBe(true);
  expect(isRowInTerm({ y: '115', s: '2' }, term)).toBe(false);
  expect(isRowInTerm({ y: '114', s: '1' }, term)).toBe(false);
});

describe('pickDefaultTerm', () => {
  test('uses the latest semester that already has course data', () => {
    expect(pickDefaultTerm([{ year: 115, semester: 1 }])).toEqual({ year: 115, semester: 1 });
    expect(pickDefaultTerm([
      { year: 114, semester: 2 },
      { year: 115, semester: 2 },
      { year: 115, semester: 1 },
    ])).toEqual({ year: 115, semester: 2 });
  });

  test('returns null when no semester has data', () => {
    expect(pickDefaultTerm([])).toBeNull();
  });
});
