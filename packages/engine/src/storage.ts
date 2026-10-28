// 本機儲存與匯出入：格式有版本、讀寫都經嚴格結構驗證（多餘欄位、長度、筆數、危險鍵一律拒絕），
// 匯入前自動備份、可復原，並能讀入舊站（nccu-course-planner）的存檔與匯出檔。
// 儲存經 StorageLike 注入，引擎不直接碰瀏覽器。資料型別中沒有金鑰欄位；寫出前只挑已知欄位，夾帶的欄位不會落地。

import { z } from 'zod';
import { profileConditionIds, type ConditionDefinition, type IdentityProfile } from './eligibility.ts';
import { DEFAULT_INTERNSHIP_SETTINGS, validateInternshipSettings, type InternshipSettings } from './internship.ts';
import { createPlannerState, type Plan, type PlannerState } from './plans.ts';
import type { PlanItem, ScheduleCourse } from './schedule/selection.ts';

export const STORAGE_KEY = 'campusward:v1';
export const BACKUP_KEY = 'campusward:v1:backup';
const FORMAT = 'campusward';
const EXPORT_FORMAT = 'campusward-export';
const CURRENT_VERSION = 1;
const MAX_RAW_LENGTH = 2_000_000;

export interface TermWorkspace {
  planner: PlannerState;
  manualCourses: ScheduleCourse[];
  /** 學生從候選清單刪掉、重建時不再顯示的官方課程。 */
  deletedKeys: string[];
}

export interface StoredData {
  profile: IdentityProfile;
  customConditions: ConditionDefinition[];
  /** 學期代碼（學年＋學期，四碼）→ 該學期的排課資料。 */
  terms: Record<string, TermWorkspace>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StorageErrorCode =
  | 'TOO_LARGE' | 'INVALID_JSON' | 'INVALID_FORMAT' | 'UNSUPPORTED_VERSION' | 'INVALID_STATE' | 'LEGACY_TERM_REQUIRED';

const ERROR_MESSAGES: Record<StorageErrorCode, string> = {
  TOO_LARGE: '檔案太大，無法匯入。',
  INVALID_JSON: '匯入檔不是有效的 JSON。',
  INVALID_FORMAT: '這不是 Campusward 排課資料檔。',
  UNSUPPORTED_VERSION: '這個排課資料版本目前不支援。',
  INVALID_STATE: '排課資料欄位不完整或格式不安全。',
  LEGACY_TERM_REQUIRED: '請先選擇舊資料所屬的學期。',
};

export function createEmptyData(): StoredData {
  return { profile: {}, customConditions: [], terms: {} };
}

// ---------- 結構 ----------

const SafeId = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
const CourseKey = z.string().regex(/^(\d{4}:[0-9A-Z]{9}|manual-\d{1,6})$/);
const Minutes = z.number().int().min(0).max(1440);
const Clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const MeetingSchema = z.object({ day: z.number().int().min(1).max(7), start: Minutes, end: Minutes, label: z.string().max(100) }).strict();
const EventSchema = z.object({
  label: z.string().min(1).max(200),
  date: z.string().max(20).optional(),
  week: z.number().int().min(1).max(20).optional(),
  day: z.number().int().min(1).max(7).optional(),
  start: Minutes.optional(),
  end: Minutes.optional(),
}).strict();
const DeliverySchema = z.object({
  mode: z.enum(['in-person', 'asynchronous', 'asynchronous-optional']),
  asyncAllowed: z.boolean(),
  defaultAttendance: z.enum(['sync', 'async']),
}).strict();

const ManualCourseSchema = z.object({
  key: z.string().regex(/^manual-\d{1,6}$/),
  title: z.string().trim().min(1).max(100),
  itemType: z.enum(['course', 'club', 'activity']),
  credits: z.number().min(0).max(12),
  source: z.literal('manual'),
  meetings: z.array(MeetingSchema).max(7),
  events: z.array(EventSchema).max(20),
  delivery: DeliverySchema,
  eligibility: z.object({}).strict(),
  note: z.string().max(100).optional(),
}).strict();

const PlanItemSchema = z.object({
  key: CourseKey,
  attendance: z.enum(['sync', 'async']),
  status: z.enum(['planned', 'registered', 'enrolled']),
  locked: z.boolean(),
  correctionId: z.string().max(100).optional(),
}).strict();

const PlanSchema = z.object({
  id: z.string().regex(/^plan-\d{1,4}$/),
  name: z.string().trim().min(1).max(40),
  auto: z.boolean(),
  items: z.array(PlanItemSchema).max(100),
}).strict();

const InternshipSchema = z.object({
  targetDays: z.number(),
  start: Clock,
  end: Clock,
  mode: z.enum(['auto', 'fixed']),
  fixedDays: z.record(z.string().regex(/^[1-5]$/), z.enum(['none', 'full', 'morning', 'afternoon'])),
}).strict().refine((settings) => validateInternshipSettings(settings) === null);

const PlannerSchema = z.object({
  candidates: z.array(CourseKey).max(600),
  plans: z.array(PlanSchema).min(1).max(30),
  activePlanId: z.string().regex(/^plan-\d{1,4}$/),
  preferences: z.object({
    freeDays: z.array(z.number().int().min(1).max(7)).max(7),
    internship: InternshipSchema,
  }).strict(),
}).strict().refine((planner) => planner.plans.some(({ id }) => id === planner.activePlanId));

const TermSchema = z.object({
  planner: PlannerSchema,
  manualCourses: z.array(ManualCourseSchema).max(100),
  deletedKeys: z.array(CourseKey).max(600),
}).strict();

const IdList = z.array(SafeId).max(100);
const ProfileSchema = z.object({
  level: z.enum(['undergrad', 'graduate']).optional(),
  year: z.number().int().min(1).max(7).optional(),
  additionalMajor: z.enum(['none', 'minor', 'double']).optional(),
  programs: IdList.optional(),
  prerequisites: IdList.optional(),
  conditionIds: IdList.optional(),
  rejectedConditionIds: IdList.optional(),
}).strict();

const ConditionSchema = z.object({
  id: SafeId,
  label: z.string().trim().min(1).max(100),
  category: z.string().max(40),
  description: z.string().max(300),
  source: z.enum(['course', 'custom']),
}).strict();

const DataSchema = z.object({
  profile: ProfileSchema,
  customConditions: z.array(ConditionSchema).max(100),
  terms: z.record(z.string().regex(/^\d{4}$/), TermSchema),
}).strict();

// ---------- 只挑已知欄位（防止夾帶欄位寫出） ----------

const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

function pickInternship(settings: InternshipSettings): InternshipSettings {
  return { targetDays: settings.targetDays, start: settings.start, end: settings.end, mode: settings.mode, fixedDays: { ...settings.fixedDays } };
}

function pickItem(item: PlanItem): PlanItem {
  return defined({ key: item.key, attendance: item.attendance, status: item.status, locked: item.locked, correctionId: item.correctionId });
}

function pickPlan(plan: Plan): Plan {
  return { id: plan.id, name: plan.name, auto: plan.auto, items: plan.items.map(pickItem) };
}

function pickManual(course: ScheduleCourse): ScheduleCourse {
  return defined({
    key: course.key,
    title: course.title,
    itemType: course.itemType,
    credits: course.credits,
    source: course.source,
    meetings: course.meetings.map(({ day, start, end, label }) => ({ day, start, end, label })),
    events: course.events.map((event) => defined({ ...event })),
    delivery: { mode: course.delivery.mode, asyncAllowed: course.delivery.asyncAllowed, defaultAttendance: course.delivery.defaultAttendance },
    eligibility: {},
    note: course.note,
  });
}

function pickData(data: StoredData): StoredData {
  const profile = data.profile;
  return {
    profile: defined({
      level: profile.level,
      year: profile.year,
      additionalMajor: profile.additionalMajor,
      programs: profile.programs ? [...profile.programs] : undefined,
      prerequisites: profile.prerequisites ? [...profile.prerequisites] : undefined,
      conditionIds: profile.conditionIds ? [...profile.conditionIds] : undefined,
      rejectedConditionIds: profile.rejectedConditionIds ? [...profile.rejectedConditionIds] : undefined,
    }),
    customConditions: data.customConditions.map(({ id, label, category, description, source }) => ({ id, label, category, description, source })),
    terms: Object.fromEntries(Object.entries(data.terms).map(([term, workspace]) => [term, {
      planner: {
        candidates: [...workspace.planner.candidates],
        plans: workspace.planner.plans.map(pickPlan),
        activePlanId: workspace.planner.activePlanId,
        preferences: {
          freeDays: [...workspace.planner.preferences.freeDays],
          internship: pickInternship(workspace.planner.preferences.internship),
        },
      },
      manualCourses: workspace.manualCourses.map(pickManual),
      deletedKeys: [...workspace.deletedKeys],
    }])),
  };
}

// ---------- 讀寫 ----------

type Parsed<T> = { ok: true; value: T } | { ok: false; code: StorageErrorCode };

class PrototypeKeyError extends Error {}

function parseJson(raw: string): Parsed<unknown> {
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, code: 'TOO_LARGE' };
  try {
    // 原型污染防護：出現 __proto__ 鍵就整份拒絕（驗證程式庫會默默略過它，這裡明確擋下）。
    return { ok: true, value: JSON.parse(raw, (key, value: unknown) => {
      if (key === '__proto__') throw new PrototypeKeyError();
      return value;
    }) as unknown };
  } catch (error) {
    return { ok: false, code: error instanceof PrototypeKeyError ? 'INVALID_STATE' : 'INVALID_JSON' };
  }
}

function validateData(value: unknown): Parsed<StoredData> {
  const result = DataSchema.safeParse(value);
  return result.success ? { ok: true, value: result.data as StoredData } : { ok: false, code: 'INVALID_STATE' };
}

/** 版本遷移：每個舊版本一個純函式，把 data 升到下一版。目前只有第 1 版。 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

function parseEnvelope(raw: string, format: string): Parsed<StoredData> {
  const json = parseJson(raw);
  if (!json.ok) return json;
  const envelope = json.value as { format?: unknown; version?: unknown; data?: unknown } | null;
  if (!envelope || typeof envelope !== 'object' || envelope.format !== format) return { ok: false, code: 'INVALID_FORMAT' };
  if (typeof envelope.version !== 'number' || !Number.isInteger(envelope.version) || envelope.version < 1 || envelope.version > CURRENT_VERSION) {
    return { ok: false, code: 'UNSUPPORTED_VERSION' };
  }
  let data = envelope.data;
  for (let version = envelope.version; version < CURRENT_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, code: 'UNSUPPORTED_VERSION' };
    data = migrate(data);
  }
  return validateData(data);
}

export function serializeData(data: StoredData): string {
  return JSON.stringify({ format: FORMAT, version: CURRENT_VERSION, data: pickData(data) });
}

export function saveStoredData(storage: StorageLike, data: StoredData, key = STORAGE_KEY): void {
  storage.setItem(key, serializeData(data));
}

export interface LoadResult {
  data: StoredData;
  source: 'main' | 'backup' | 'empty';
  /** 主資料無法讀取的原因；主資料不會被清除，可提示使用者。 */
  error?: StorageErrorCode;
}

export function loadStoredData(storage: StorageLike): LoadResult {
  const main = storage.getItem(STORAGE_KEY);
  const backup = storage.getItem(BACKUP_KEY);
  if (main === null && backup === null) return { data: createEmptyData(), source: 'empty' };
  const parsedMain = main === null ? null : parseEnvelope(main, FORMAT);
  if (parsedMain?.ok) return { data: parsedMain.value, source: 'main' };
  const error = parsedMain && !parsedMain.ok ? parsedMain.code : undefined;
  const parsedBackup = backup === null ? null : parseEnvelope(backup, FORMAT);
  if (parsedBackup?.ok) return { data: parsedBackup.value, source: 'backup', ...(error ? { error } : {}) };
  return { data: createEmptyData(), source: 'empty', ...(error ? { error } : {}) };
}

/** 另一個分頁寫入時（storage 事件）：以最後寫入為準並提示。 */
export function readExternalChange(event: { key: string | null; newValue: string | null }): { data: StoredData; notice: string } | null {
  if (event.key !== STORAGE_KEY || event.newValue === null) return null;
  const parsed = parseEnvelope(event.newValue, FORMAT);
  return parsed.ok ? { data: parsed.value, notice: '另一個分頁更新了你的課表，已載入最新版本。' } : null;
}

// ---------- 匯出入 ----------

export function exportTransfer(data: StoredData, exportedAt: string): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: CURRENT_VERSION, exportedAt, data: pickData(data) }, null, 2);
}

export interface ImportSummary {
  terms: string[];
  candidates: number;
  scheduled: number;
  manualCourses: number;
  skippedCourses: number;
  replacesSettings: boolean;
}

export type ImportPreview =
  | { valid: true; data: StoredData; summary: ImportSummary }
  | { valid: false; error: { code: StorageErrorCode; message: string } };

const invalid = (code: StorageErrorCode): ImportPreview => ({ valid: false, error: { code, message: ERROR_MESSAGES[code] } });

function summarize(data: StoredData, skippedCourses: number, replacesSettings: boolean): ImportSummary {
  const workspaces = Object.values(data.terms);
  return {
    terms: Object.keys(data.terms),
    candidates: workspaces.reduce((total, { planner }) => total + planner.candidates.length, 0),
    scheduled: workspaces.reduce((total, { planner }) => total + (planner.plans.find(({ id }) => id === planner.activePlanId)?.items.length ?? 0), 0),
    manualCourses: workspaces.reduce((total, { manualCourses }) => total + manualCourses.length, 0),
    skippedCourses,
    replacesSettings,
  };
}

export function previewImport(raw: string, _current: StoredData, { legacyTerm }: { legacyTerm?: string } = {}): ImportPreview {
  const json = parseJson(raw);
  if (!json.ok) return invalid(json.code);
  const document = json.value as { format?: unknown; version?: unknown; state?: unknown } | null;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return invalid('INVALID_FORMAT');

  if (document.format === EXPORT_FORMAT || document.format === FORMAT) {
    const parsed = parseEnvelope(raw, String(document.format));
    if (!parsed.ok) return invalid(parsed.code);
    return { valid: true, data: parsed.value, summary: summarize(parsed.value, 0, Object.keys(parsed.value.profile).length > 0) };
  }

  const isLegacyTransfer = document.format === 'sunbreak-planner';
  const isLegacyStorage = document.format === undefined && [3, 4, 5, 6].includes(document.version as number) && Boolean(document.state);
  if (!isLegacyTransfer && !isLegacyStorage) return invalid('INVALID_FORMAT');
  if (isLegacyTransfer && document.version !== 1) return invalid('UNSUPPORTED_VERSION');
  if (!legacyTerm || !/^\d{4}$/.test(legacyTerm)) return invalid('LEGACY_TERM_REQUIRED');
  return convertLegacy(document.state, legacyTerm);
}

/** 匯入前把目前資料備份到 BACKUP_KEY；回傳目前資料，存回去即可復原。 */
export function applyImport(storage: StorageLike, preview: Extract<ImportPreview, { valid: true }>, current: StoredData): { previous: StoredData } {
  saveStoredData(storage, current, BACKUP_KEY);
  saveStoredData(storage, preview.data);
  return { previous: current };
}

// ---------- 舊站資料 ----------

const SAFE_LEGACY_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isIdList = (value: unknown) => Array.isArray(value) && value.every((id) => typeof id === 'string' && SAFE_LEGACY_ID.test(id));

// 移植自舊 planner-transfer 的 invalidImportedInternship / invalidTransferState。
function invalidLegacyInternship(settings: Record<string, unknown>): boolean {
  if (typeof settings.targetDays !== 'number' || !['auto', 'fixed'].includes(settings.mode as string) || validateInternshipSettings(settings)) return true;
  if (settings.fixedDays === undefined) return false;
  if (!isObject(settings.fixedDays)) return true;
  return Object.entries(settings.fixedDays).some(([day, mode]) => !/^[1-5]$/.test(day) || !['none', 'full', 'morning', 'afternoon'].includes(mode as string));
}

function invalidLegacyState(state: unknown): boolean {
  if (!isObject(state)) return true;
  for (const field of ['selectedIds', 'lockedCourseIds', 'deletedCourseIds']) {
    if (state[field] !== undefined && !isIdList(state[field])) return true;
  }
  if (state.addedCourses !== undefined && !Array.isArray(state.addedCourses)) return true;
  if ((state.addedCourses as unknown[] | undefined)?.some((course) => (
    !isObject(course) || typeof course.id !== 'string' || !SAFE_LEGACY_ID.test(course.id) || typeof course.title !== 'string' || !course.title.trim()
  ))) return true;
  for (const field of ['attendance', 'courseOptions', 'internshipSettings', 'profile']) {
    if (state[field] !== undefined && !isObject(state[field])) return true;
  }
  if (isObject(state.internshipSettings) && invalidLegacyInternship(state.internshipSettings)) return true;
  if (state.customConditions !== undefined && !Array.isArray(state.customConditions)) return true;
  return false;
}

function legacyKey(id: string, sectionCode: unknown, term: string): string | null {
  if (/^manual-\d{1,6}$/.test(id)) return id;
  const code = typeof sectionCode === 'string' && /^[0-9A-Z]{9}$/.test(sectionCode) ? sectionCode : /^ai-([0-9A-Z]{9})$/.exec(id)?.[1];
  return code ? `${term}:${code}` : null;
}

function legacyManualCourse(course: Record<string, unknown>, key: string): ScheduleCourse | null {
  const schedule = isObject(course.schedule) ? course.schedule : null;
  const isAsync = course.attendance === 'async' || course.asyncAllowed === true;
  const itemType = course.itemType === 'course' || course.itemType === undefined ? 'course' : course.itemType === 'club' ? 'club' : 'activity';
  const credits = itemType === 'course' ? Number(course.credits ?? 0) : 0;
  if (!Number.isFinite(credits) || credits < 0 || credits > 12) return null;
  const meetings = schedule && !isAsync
    ? [{ day: Number(schedule.day), start: Number(schedule.start), end: Number(schedule.end), label: String(schedule.label ?? '').slice(0, 100) }]
    : [];
  return {
    key,
    title: String(course.title).trim().slice(0, 100),
    itemType,
    credits,
    source: 'manual',
    meetings,
    events: [],
    delivery: isAsync
      ? { mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' }
      : { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
    eligibility: {},
    note: itemType === 'course' ? '手動新增，尚未查證官方資料' : '自訂每週行程',
  };
}

function legacyProfile(profile: unknown): IdentityProfile {
  if (!isObject(profile)) return {};
  const list = (value: unknown) => (isIdList(value) ? [...(value as string[])] : undefined);
  const result: IdentityProfile = defined({
    level: profile.level === 'undergrad' || profile.level === 'graduate' ? profile.level : undefined,
    year: typeof profile.year === 'number' && Number.isInteger(profile.year) && profile.year >= 1 && profile.year <= 7 ? profile.year : undefined,
    programs: list(profile.programs),
    prerequisites: list(profile.prerequisites),
    conditionIds: list(profile.conditionIds),
    rejectedConditionIds: list(profile.rejectedConditionIds),
  });
  const conditionIds = profileConditionIds(result);
  return conditionIds.length ? { ...result, conditionIds } : result;
}

function convertLegacy(state: unknown, term: string): ImportPreview {
  if (invalidLegacyState(state)) return invalid('INVALID_STATE');
  const legacy = state as Record<string, unknown>;
  let skipped = 0;
  const idToKey = new Map<string, string>();
  const manualCourses: ScheduleCourse[] = [];
  const candidates: string[] = [];
  ((legacy.addedCourses as Record<string, unknown>[] | undefined) ?? []).forEach((course) => {
    const id = String(course.id);
    const key = legacyKey(id, course.sectionCode, term);
    if (!key || idToKey.has(id)) {
      skipped += 1;
      return;
    }
    if (key.startsWith('manual-')) {
      const manual = legacyManualCourse(course, key);
      if (!manual) {
        skipped += 1;
        return;
      }
      manualCourses.push(manual);
    }
    idToKey.set(id, key);
    candidates.push(key);
  });
  const resolve = (id: string) => idToKey.get(id) ?? legacyKey(id, undefined, term);
  const attendance = isObject(legacy.attendance) ? legacy.attendance : {};
  const locked = new Set((legacy.lockedCourseIds as string[] | undefined) ?? []);
  const items: PlanItem[] = [];
  ((legacy.selectedIds as string[] | undefined) ?? []).forEach((id) => {
    const key = resolve(id);
    if (!key || (key.startsWith('manual-') && !idToKey.has(id))) {
      skipped += 1;
      return;
    }
    if (items.some((item) => item.key === key)) return;
    if (!candidates.includes(key)) candidates.push(key);
    items.push({ key, attendance: attendance[id] === 'async' ? 'async' : 'sync', status: 'planned', locked: locked.has(id) });
  });
  const planner = createPlannerState();
  planner.candidates = candidates;
  planner.plans[0]!.items = items;
  if (isObject(legacy.internshipSettings)) {
    const settings = legacy.internshipSettings as unknown as InternshipSettings;
    planner.preferences.internship = { ...DEFAULT_INTERNSHIP_SETTINGS, ...pickInternship({ ...settings, fixedDays: settings.fixedDays ?? {} }) };
  }
  const deletedKeys = ((legacy.deletedCourseIds as string[] | undefined) ?? [])
    .map((id) => legacyKey(id, undefined, term))
    .filter((key): key is string => Boolean(key) && !key!.startsWith('manual-'));
  const customConditions = ((legacy.customConditions as unknown[] | undefined) ?? [])
    .filter((condition) => ConditionSchema.safeParse(condition).success) as ConditionDefinition[];
  const data: StoredData = {
    profile: legacyProfile(legacy.profile),
    customConditions,
    terms: { [term]: { planner, manualCourses, deletedKeys } },
  };
  const validated = validateData(pickData(data));
  if (!validated.ok) return invalid('INVALID_STATE');
  return {
    valid: true,
    data: validated.value,
    summary: summarize(validated.value, skipped, Boolean(legacy.profile || legacy.internshipSettings)),
  };
}
