import { describe, expect, test } from 'vitest';
import { clearStudentRecord, loadStudentRecord, RECORD_KEY, saveStudentRecord } from '../src/studentRecordStorage.ts';
import { parseStudentExport, type StudentRecord } from '../src/studentExport.ts';
import exportJson from './fixtures/synthetic/student-export.json' with { type: 'json' };

// 2026-11-01 使用者要求：全人系統資料匯入一次後各功能共用，存在這台瀏覽器（設計第 9 節）。
const memory = () => {
  const values: Record<string, string> = {};
  return { values, getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; } };
};
const record = (() => {
  const parsed = parseStudentExport(JSON.stringify(exportJson));
  if (!parsed.ok) throw new Error('fixture');
  return parsed.record;
})();

describe('student record storage', () => {
  test('saves the reduced record and reads it back', () => {
    const storage = memory();
    saveStudentRecord(storage, record);
    expect(loadStudentRecord(storage)).toEqual(record);
  });

  test('never stores names, student numbers or scores', () => {
    const storage = memory();
    saveStudentRecord(storage, record);
    expect(storage.values[RECORD_KEY]).not.toMatch(/王合成|SYNTHETIC|score|chineseName|studentNumber/);
  });

  test('drops fields that are not on the whitelist even if the caller passes them', () => {
    const storage = memory();
    saveStudentRecord(storage, { ...record, phone: '0900', courses: record.courses.map((course) => ({ ...course, score: 99 })) } as unknown as StudentRecord);
    expect(storage.values[RECORD_KEY]).not.toMatch(/phone|score|99/);
  });

  test('treats a damaged or tampered value as no record', () => {
    const storage = memory();
    storage.values[RECORD_KEY] = '{"broken"';
    expect(loadStudentRecord(storage)).toBeNull();
    storage.values[RECORD_KEY] = JSON.stringify({ version: 1, record: { ...record, enrollment: { ...record.enrollment, major: 'x'.repeat(5000) } } });
    expect(loadStudentRecord(storage)).toBeNull();
    storage.values[RECORD_KEY] = '{"__proto__":{"polluted":true}}';
    expect(loadStudentRecord(storage)).toBeNull();
  });

  test('clears the record', () => {
    const storage = memory();
    saveStudentRecord(storage, record);
    clearStudentRecord(storage);
    expect(loadStudentRecord(storage)).toBeNull();
    expect(storage.values[RECORD_KEY]).toBe('');
  });
});

// 第五輪審查：解析器沒有的上限，存檔時一律截斷，不讓存檔失敗。
test('clamps values the parser allows but storage would reject, instead of failing', () => {
  const storage = memory();
  const long = {
    ...record,
    enrollment: { ...record.enrollment, programs: Array.from({ length: 25 }, (_, index) => `學程${index}`) },
    courses: record.courses.map((course, index) => (index === 0 ? { ...course, generalEducation: ['一個超過二十個字的通識領域備註寫得很長很長很長'] } : course)),
  };
  expect(() => saveStudentRecord(storage, long)).not.toThrow();
  const loaded = loadStudentRecord(storage)!;
  expect(loaded.enrollment.programs).toHaveLength(20);
  expect(loaded.courses[0]!.generalEducation[0]!.length).toBeLessThanOrEqual(20);
});
