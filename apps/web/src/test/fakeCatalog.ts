import { rowToCourse, type Course } from '@campusward/engine';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import type { CatalogSource, TermInfo } from '../data/catalog.ts';

/** 測試用課程來源：合成課程，學期 1151。 */
export function fakeCatalog(overrides: Partial<CatalogSource> = {}, rows: Record<string, unknown>[] = [officialRow()]): CatalogSource {
  const courses: Course[] = rows.map((row) => {
    const { course } = rowToCourse(row, { year: 115, semester: 1 });
    if (!course) throw new Error('synthetic row rejected');
    return course;
  });
  const terms: TermInfo[] = [{ term: '1151', count: courses.length, fetchedAt: '2026-10-28T00:00:00.000Z' }];
  return {
    listTerms: async () => terms,
    loadCourses: async () => courses,
    ...overrides,
  };
}
