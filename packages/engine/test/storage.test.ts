import { describe, expect, test } from 'vitest';
import { createPlannerState } from '../src/plans.ts';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  applyImport,
  createEmptyData,
  exportTransfer,
  loadStoredData,
  previewImport,
  readExternalChange,
  saveStoredData,
  type StorageLike,
  type StoredData,
} from '../src/storage.ts';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = value; },
  };
}

function sampleData(): StoredData {
  const data = createEmptyData();
  const planner = createPlannerState();
  planner.candidates = ['1151:900123001', 'manual-1'];
  planner.plans[0]!.items = [{ key: '1151:900123001', attendance: 'sync', status: 'registered', locked: true }];
  data.profile = { level: 'undergrad', year: 3, additionalMajor: 'double', conditionIds: ['program:innovation'] };
  data.terms['1151'] = {
    planner,
    manualCourses: [{
      key: 'manual-1', title: '攝影社', itemType: 'club', credits: 0, source: 'manual',
      meetings: [{ day: 7, start: 840, end: 960, label: '週日 14:00–16:00' }], events: [],
      delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' }, eligibility: {}, note: '自訂每週行程',
    }],
    deletedKeys: [],
  };
  return data;
}

describe('stored data', () => {
  test('round-trips the stored data', () => {
    const storage = memoryStorage();
    saveStoredData(storage, sampleData());
    expect(loadStoredData(storage)).toEqual({ data: sampleData(), source: 'main' });
  });

  test('starts new visitors empty', () => {
    expect(loadStoredData(memoryStorage())).toEqual({ data: createEmptyData(), source: 'empty' });
  });

  test('falls back to the backup when stored data is corrupt or tampered with', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{bad json' });
    saveStoredData(storage, sampleData(), BACKUP_KEY);
    expect(loadStoredData(storage)).toMatchObject({ data: sampleData(), source: 'backup', error: 'INVALID_JSON' });

    const tampered = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ format: 'campusward', version: 1, data: { ...sampleData(), extra: '<script>' } }) });
    expect(loadStoredData(tampered)).toMatchObject({ data: createEmptyData(), source: 'empty', error: 'INVALID_STATE' });
  });

  test('keeps data from a newer version untouched and reports it', () => {
    const raw = JSON.stringify({ format: 'campusward', version: 99, data: {} });
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    expect(loadStoredData(storage)).toMatchObject({ source: 'empty', error: 'UNSUPPORTED_VERSION' });
    expect(storage.values[STORAGE_KEY]).toBe(raw);
  });

  test.each([
    ['__proto__ keys', '{"format":"campusward","version":1,"data":{"profile":{},"customConditions":[],"terms":{"__proto__":{}}}}'],
    ['constructor keys', '{"format":"campusward","version":1,"data":{"profile":{"constructor":{}},"customConditions":[],"terms":{}}}'],
    ['unsafe keys', JSON.stringify({ format: 'campusward', version: 1, data: { ...createEmptyData(), profile: { conditionIds: ['<img src=x>'] } } })],
    ['oversized strings', JSON.stringify({ format: 'campusward', version: 1, data: { ...createEmptyData(), customConditions: [{ id: 'custom:a', label: '長'.repeat(500), category: 'other', description: '', source: 'custom' }] } })],
  ])('rejects %s', (_, raw) => {
    expect(loadStoredData(memoryStorage({ [STORAGE_KEY]: raw })).error).toBe('INVALID_STATE');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('rejects data over the size limit before parsing', () => {
    expect(loadStoredData(memoryStorage({ [STORAGE_KEY]: ' '.repeat(2_000_001) })).error).toBe('TOO_LARGE');
  });
});

describe('export', () => {
  test('exports a versioned document that previews back to the same data', () => {
    const raw = exportTransfer(sampleData(), '2026-10-28T00:00:00.000Z');
    expect(JSON.parse(raw)).toMatchObject({ format: 'campusward-export', version: 1, exportedAt: '2026-10-28T00:00:00.000Z' });
    const preview = previewImport(raw, createEmptyData());
    expect(preview.valid && preview.data).toEqual(sampleData());
  });

  test('never exports a key or other unknown fields smuggled into the data', () => {
    const data = sampleData() as StoredData & Record<string, unknown>;
    data.apiKey = 'AIzaFAKEKEYFORTESTONLY';
    (data.profile as Record<string, unknown>).profileText = '私人自我介紹';
    const raw = exportTransfer(data, '2026-10-28T00:00:00.000Z');
    expect(raw).not.toMatch(/AIzaFAKE|私人自我介紹/);
  });
});

describe('import', () => {
  test('backs up current data before importing and can undo', () => {
    const storage = memoryStorage();
    const current = createEmptyData();
    current.profile = { year: 2 };
    saveStoredData(storage, current);
    const preview = previewImport(exportTransfer(sampleData(), '2026-10-28T00:00:00.000Z'), current);
    if (!preview.valid) throw new Error(preview.error.code);
    const { previous } = applyImport(storage, preview, current);
    expect(loadStoredData(storage).data).toEqual(sampleData());
    expect(loadStoredData({ getItem: (key) => storage.getItem(key === STORAGE_KEY ? BACKUP_KEY : key), setItem: () => {} }).data).toEqual(current);
    saveStoredData(storage, previous);
    expect(loadStoredData(storage).data).toEqual(current);
  });

  test('summarizes what an import replaces', () => {
    const preview = previewImport(exportTransfer(sampleData(), '2026-10-28T00:00:00.000Z'), createEmptyData());
    expect(preview.valid && preview.summary).toEqual({ terms: ['1151'], candidates: 2, scheduled: 1, manualCourses: 1, skippedCourses: 0, replacesSettings: true });
  });
});

// 移植自舊專案 tests/planner-transfer.test.mjs：舊站匯出檔（sunbreak-planner v1）的驗證規則
describe('legacy transfer files', () => {
  const legacy = (state: unknown, version: unknown = 1) => JSON.stringify({ format: 'sunbreak-planner', version, state });
  const preview = (raw: string) => previewImport(raw, createEmptyData(), { legacyTerm: '1151' });
  const code = (raw: string) => {
    const result = preview(raw);
    return result.valid ? 'VALID' : result.error.code;
  };

  test('rejects malformed transfer JSON without changing current planner data', () => {
    const storage = memoryStorage();
    saveStoredData(storage, sampleData());
    const result = preview('{bad json');
    expect(result.valid).toBe(false);
    expect(code('{bad json')).toBe('INVALID_JSON');
    expect(loadStoredData(storage).data).toEqual(sampleData());
  });

  test('rejects an unrelated JSON document', () => {
    expect(code(JSON.stringify({ format: 'other', version: 1, state: {} }))).toBe('INVALID_FORMAT');
  });

  test('rejects an unsupported transfer version', () => {
    expect(code(legacy({}, 99))).toBe('UNSUPPORTED_VERSION');
  });

  test('rejects invalid planner field types and unsafe ids', () => {
    expect(code(legacy({ selectedIds: 'course-a' }))).toBe('INVALID_STATE');
    expect(code(legacy({ selectedIds: ['<script>'] }))).toBe('INVALID_STATE');
  });

  test('rejects imported internship settings with an invalid target', () => {
    expect(code(legacy({ internshipSettings: { targetDays: -1, start: '09:00', end: '18:00', mode: 'auto' } }))).toBe('INVALID_STATE');
  });

  test('rejects imported internship settings with missing or malformed times without throwing', () => {
    for (const internshipSettings of [
      { targetDays: 2.5, end: '18:00', mode: 'auto' },
      { targetDays: 2.5, start: '09:00', mode: 'auto' },
      { targetDays: 2.5, start: true, end: '18:00', mode: 'auto' },
      { targetDays: 2.5, start: '09:00', end: [], mode: 'auto' },
    ]) {
      expect(code(legacy({ internshipSettings }))).toBe('INVALID_STATE');
    }
  });

  test('rejects non-numeric imported internship targets instead of coercing them', () => {
    for (const targetDays of [true, false, [2.5], '2.5']) {
      expect(code(legacy({ internshipSettings: { targetDays, start: '09:00', end: '18:00', mode: 'auto' } }))).toBe('INVALID_STATE');
    }
  });

  test('rejects imported internship settings with an invalid mode or fixed-day shape', () => {
    const base = { targetDays: 2.5, start: '09:00', end: '18:00' };
    for (const internshipSettings of [
      base,
      { ...base, mode: 'sometimes' },
      { ...base, mode: 'fixed', fixedDays: [] },
      { ...base, mode: 'fixed', fixedDays: { 2: 'overnight' } },
      { ...base, mode: 'fixed', fixedDays: { 8: 'full' } },
    ]) {
      expect(code(legacy({ internshipSettings }))).toBe('INVALID_STATE');
    }
  });

  test('requires the caller to name the semester of legacy data', () => {
    const result = previewImport(legacy({}), createEmptyData());
    expect(result.valid ? 'VALID' : result.error.code).toBe('LEGACY_TERM_REQUIRED');
  });

  test('converts a legacy transfer into the new format', () => {
    const result = preview(legacy({
      selectedIds: ['ai-900055001', 'manual-1', 'built-in-demo'],
      attendance: { 'ai-900055001': 'async' },
      lockedCourseIds: ['ai-900055001'],
      addedCourses: [
        { id: 'ai-900055001', title: '人機互動', sectionCode: '900055001', source: 'nccu-verified-import' },
        { id: 'manual-1', title: '社團', itemType: 'club', credits: 0, source: 'manual', schedule: { day: 7, start: 840, end: 960, label: '週日 14:00–16:00' } },
        { id: 'manual-1', title: '重複社團', source: 'manual' },
      ],
      profile: { level: 'undergrad', year: 3, programs: ['innovation'], prerequisites: ['statistics'] },
      internshipSettings: { targetDays: 3, start: '09:00', end: '18:00', mode: 'auto' },
      deletedCourseIds: ['ai-900099001'],
    }));
    if (!result.valid) throw new Error(result.error.code);
    const workspace = result.data.terms['1151']!;
    expect(workspace.planner.candidates).toEqual(['1151:900055001', 'manual-1']);
    expect(workspace.planner.plans[0]!.items).toEqual([
      { key: '1151:900055001', attendance: 'async', status: 'planned', locked: true },
      { key: 'manual-1', attendance: 'sync', status: 'planned', locked: false },
    ]);
    expect(workspace.manualCourses.map(({ key, title, itemType, meetings }) => ({ key, title, itemType, meetings }))).toEqual([
      { key: 'manual-1', title: '社團', itemType: 'club', meetings: [{ day: 7, start: 840, end: 960, label: '週日 14:00–16:00' }] },
    ]);
    expect(workspace.planner.preferences.internship.targetDays).toBe(3);
    expect(workspace.deletedKeys).toEqual(['1151:900099001']);
    // 移植自 planner-storage：舊版 programs/prerequisites 轉為通用條件 id
    expect(result.data.profile).toEqual({
      level: 'undergrad', year: 3, programs: ['innovation'], prerequisites: ['statistics'],
      conditionIds: ['program:innovation', 'prerequisite:statistics'],
    });
    expect(result.summary).toMatchObject({ scheduled: 2, skippedCourses: 2 });
  });
});

// 移植自舊專案 tests/planner-storage.test.mjs：舊站存在瀏覽器的資料（version 3–6）
describe('legacy browser storage', () => {
  test('imports a saved version-three to six state', () => {
    for (const version of [3, 4, 5, 6]) {
      const raw = JSON.stringify({ version, state: { selectedIds: ['manual-1'], addedCourses: [{ id: 'manual-1', title: '社團', source: 'manual', schedule: null }] } });
      const result = previewImport(raw, createEmptyData(), { legacyTerm: '1151' });
      expect(result.valid && result.data.terms['1151']?.planner.candidates).toEqual(['manual-1']);
    }
  });

  test('returns an error for corrupt or incompatible storage', () => {
    expect(previewImport('{"version":1,"state":{}}', createEmptyData(), { legacyTerm: '1151' }).valid).toBe(false);
  });
});

describe('two tabs', () => {
  test('loads the newest data written by another tab', () => {
    const raw = JSON.stringify({ format: 'campusward', version: 1, data: sampleData() });
    expect(readExternalChange({ key: STORAGE_KEY, newValue: raw })).toEqual({ data: sampleData(), notice: '另一個分頁更新了你的課表，已載入最新版本。' });
  });

  test('ignores unrelated keys and invalid data', () => {
    expect(readExternalChange({ key: 'other', newValue: '{}' })).toBeNull();
    expect(readExternalChange({ key: STORAGE_KEY, newValue: '{bad' })).toBeNull();
    expect(readExternalChange({ key: STORAGE_KEY, newValue: null })).toBeNull();
  });
});

// 程式碼審查修正：舊資料裡單一壞掉的手動課程只略過該課，不讓整份匯入失敗
test('skips a malformed legacy manual course instead of failing the whole import', () => {
  const raw = JSON.stringify({ format: 'sunbreak-planner', version: 1, state: {
    selectedIds: ['manual-1', 'manual-2'],
    addedCourses: [
      { id: 'manual-1', title: '壞課', source: 'manual', schedule: { day: '週二', start: 'x', end: 0 } },
      { id: 'manual-2', title: '好課', source: 'manual', schedule: { day: 2, start: 550, end: 720, label: '週二 234' } },
    ],
  } });
  const result = previewImport(raw, createEmptyData(), { legacyTerm: '1151' });
  if (!result.valid) throw new Error(result.error.code);
  expect(result.data.terms['1151']?.manualCourses.map(({ key }) => key)).toEqual(['manual-2']);
  expect(result.summary.skippedCourses).toBe(2);
});
