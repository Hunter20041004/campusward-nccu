import { describe, expect, test } from 'vitest';
import { officialRow } from '../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { buildSnapshot, serializeSnapshot } from '../snapshot.ts';

const rows = (count: number) => Array.from({ length: count }, (_, index) => officialRow({ subNum: `9${String(index).padStart(5, '0')}001` }));
const fetchedAt = '2026-10-28T00:00:00.000Z';

describe('buildSnapshot', () => {
  test('normalizes rows into courses sorted by code with metadata', () => {
    const result = buildSnapshot({ rows: [...rows(3)].reverse(), term: '1151', queries: 40, fetchedAt });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.courses.map(({ code }) => code)).toEqual(['900000001', '900001001', '900002001']);
    expect(result.meta).toEqual({ term: '1151', fetchedAt, count: 3, queries: 40, rowIssues: 0, issueSamples: [] });
  });

  test('fails when the count drops below 90% of the previous snapshot', () => {
    const result = buildSnapshot({ rows: rows(89), term: '1151', queries: 1, fetchedAt, previousCount: 100 });
    expect(result).toEqual({ ok: false, reason: '筆數 89 低於上一版 100 的 90%，保留上一版。' });
  });

  test('fails when more than 1% of rows are invalid', () => {
    const bad = [...rows(97), officialRow({ subNum: '' }), officialRow({ subNam: '' }), officialRow({ subPoint: 'x' })];
    const result = buildSnapshot({ rows: bad, term: '1151', queries: 1, fetchedAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/格式錯誤 3 列（3\.0%）/);
  });

  test('keeps going with a small number of invalid rows and records samples', () => {
    const result = buildSnapshot({ rows: [...rows(200), officialRow({ subNum: '' })], term: '1151', queries: 1, fetchedAt });
    expect(result.ok && result.meta.rowIssues).toBe(1);
    expect(result.ok && result.meta.issueSamples).toHaveLength(1);
  });

  test('fails on an empty result', () => {
    expect(buildSnapshot({ rows: [], term: '1151', queries: 36, fetchedAt })).toEqual({ ok: false, reason: '沒有抓到任何課程，保留上一版。' });
  });
});

test('serializes identically for identical input', () => {
  const first = buildSnapshot({ rows: rows(5), term: '1151', queries: 1, fetchedAt });
  const second = buildSnapshot({ rows: [...rows(5)].reverse(), term: '1151', queries: 1, fetchedAt });
  if (!first.ok || !second.ok) throw new Error('unexpected failure');
  expect(serializeSnapshot(first.courses)).toBe(serializeSnapshot(second.courses));
});
