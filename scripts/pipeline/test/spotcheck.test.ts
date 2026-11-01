import { expect, test } from 'vitest';
import { compareWithOfficial, sampleCodes } from '../spotcheck.ts';
import { officialRow } from '../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { rowToCourse } from '../../../packages/engine/src/index.ts';

test('samples evenly across the sorted course list, always the same way', () => {
  const codes = Array.from({ length: 100 }, (_, index) => `9${String(index).padStart(8, '0')}`);
  const sample = sampleCodes(codes, 20);
  expect(sample).toHaveLength(20);
  expect(new Set(sample).size).toBe(20);
  expect(sample[0]).toBe(codes[0]);
  expect(sampleCodes(codes, 20)).toEqual(sample);
});

test('reports fields that differ from the official row', () => {
  const { course } = rowToCourse(officialRow(), { year: 115, semester: 1 });
  expect(compareWithOfficial(course!, officialRow())).toEqual([]);
  expect(compareWithOfficial(course!, officialRow({ teaNam: '李合成', subTime: '五D56' }))).toEqual(['teacher', 'scheduleText', 'meetings']);
  expect(compareWithOfficial(course!, null)).toEqual(['missing']);
});
