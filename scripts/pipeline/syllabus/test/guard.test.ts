import { describe, expect, test } from 'vitest';
import type { CorpusMeta } from '../corpus.ts';
import { writeBlocker } from '../guard.ts';

const meta = (overrides: Partial<CorpusMeta> = {}): CorpusMeta => ({
  term: '1151', fetchedAt: '2026-11-01T00:00:00.000Z', pages: 1000, parsed: 990, notUploaded: 10, missing: 0, failed: 0, scrubHits: {}, ...overrides,
});

describe('writeBlocker (keep the previous corpus when a run looks broken)', () => {
  test('a healthy run may be written, with or without a previous corpus', () => {
    expect(writeBlocker(meta(), 1000)).toBeNull();
    expect(writeBlocker(meta(), 1000, meta({ parsed: 1000 }))).toBeNull();
    expect(writeBlocker(meta({ parsed: 951 }), 1000, meta({ parsed: 1000 }))).toBeNull();
  });

  test('more than 2% failed pages blocks the write', () => {
    expect(writeBlocker(meta({ failed: 20 }), 1000)).toBeNull();
    expect(writeBlocker(meta({ failed: 21 }), 1000)).toMatch(/失敗 21 頁/);
  });

  test('a site-wide 404 or "not uploaded" wave blocks the write even with zero failures', () => {
    expect(writeBlocker(meta({ pages: 0, parsed: 0, notUploaded: 0, missing: 1000 }), 1000, meta())).toMatch(/上一版 990 門/);
    expect(writeBlocker(meta({ parsed: 0, notUploaded: 1000 }), 1000, meta())).toMatch(/上一版 990 門/);
    expect(writeBlocker(meta({ parsed: 940 }), 1000, meta({ parsed: 1000 }))).toMatch(/940/);
  });

  test('an empty corpus is never written', () => {
    expect(writeBlocker(meta({ pages: 0, parsed: 0, notUploaded: 0, missing: 1000 }), 1000)).toMatch(/0 門/);
  });
});
