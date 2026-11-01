import {
  BACKUP_KEY,
  CORRUPT_KEY,
  PRE_IMPORT_KEY,
  clearPreImportCopy,
  readPreImportCopy,
  savePreImportCopy,
  applyAiChangeSet,
  applyChanges,
  createEmptyData,
  createPlannerState,
  findConflicts,
  loadStoredData,
  readExternalChange,
  refreshItems,
  saveStoredData,
  toScheduleCourse,
  totalCredits,
  type AiApplyContext,
  type AiApplyResult,
  type ApplyOptions,
  type ApplyResult,
  type Change,
  type Course,
  type IdentityProfile,
  type PlannerState,
  type ScheduleCourse,
  type ScheduleEntry,
  type StorageLike,
  type StoredData,
  type TermWorkspace,
} from '@campusward/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const emptyWorkspace = (): TermWorkspace => ({ planner: createPlannerState(), manualCourses: [], deletedKeys: [] });

function withRefreshedItems(planner: PlannerState, catalog: ReadonlyMap<string, ScheduleCourse>): PlannerState {
  return { ...planner, plans: planner.plans.map((plan) => ({ ...plan, items: refreshItems(plan.items, catalog) })) };
}

export interface PlannerApi {
  data: StoredData;
  planner: PlannerState;
  activePlan: PlannerState['plans'][number];
  catalog: ReadonlyMap<string, ScheduleCourse>;
  entries: ScheduleEntry[];
  conflicts: ReturnType<typeof findConflicts>;
  credits: number;
  profile: IdentityProfile;
  notice: string | null;
  undoLabel: string | null;
  /** 最近一次修改加入的課（課表標示「新」）。 */
  newKeys: ReadonlySet<string>;
  apply: (changes: Change[], label: string, options?: ApplyOptions) => ApplyResult;
  /** AI 變更方案：先過引擎的確定性檢查（衝堂、鎖定、學分、實習、空堂日），合格才存檔。身分條件用本機的設定，不送 AI。 */
  applyAi: (changes: Change[], label: string, context?: Omit<AiApplyContext, 'profile'>) => AiApplyResult;
  undo: () => void;
  clearUndo: () => void;
  dismissNotice: () => void;
  setProfile: (profile: IdentityProfile) => void;
  /** 匯入：先把目前資料存成備份，再取代。 */
  replaceData: (next: StoredData) => void;
  /** 清除本機資料（主資料、備份、匯入前資料、讀不了時另存的資料）。 */
  clearAll: () => void;
  /** 有第一次匯入前的資料可以還原。 */
  canRestoreImport: boolean;
  restoreBeforeImport: () => void;
}

/** 某學期的排課狀態：透過引擎套用變更、存到本機、提供復原。 */
export function usePlanner({ term, courses, storage }: { term: string; courses: readonly Course[]; storage: StorageLike }): PlannerApi {
  const initial = useRef<ReturnType<typeof loadStoredData> | null>(null);
  if (!initial.current) initial.current = loadStoredData(storage);
  const [data, setData] = useState<StoredData>(initial.current.data);
  const [notice, setNotice] = useState<string | null>(
    initial.current.error ? '這台裝置上的課表資料讀取失敗，已改用備份或從空白開始。' : null,
  );
  const [undoEntry, setUndoEntry] = useState<{ label: string; planner: PlannerState } | null>(null);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set());
  const [canRestoreImport, setCanRestoreImport] = useState(() => readPreImportCopy(storage) !== null);

  const workspace = data.terms[term] ?? emptyWorkspace();
  const catalog = useMemo(() => {
    const map = new Map<string, ScheduleCourse>();
    courses.forEach((course) => { const scheduled = toScheduleCourse(course); map.set(scheduled.key, scheduled); });
    workspace.manualCourses.forEach((course) => map.set(course.key, course));
    return map;
  }, [courses, workspace.manualCourses]);
  const planner = useMemo(() => withRefreshedItems(workspace.planner, catalog), [workspace.planner, catalog]);

  /** 先寫入、成功才更新畫面；失敗時畫面維持原樣並說明，不假裝已存。 */
  const save = useCallback((next: StoredData): boolean => {
    try {
      saveStoredData(storage, next);
    } catch {
      setNotice('這次修改沒有存檔：資料可能超出可保存的範圍，或瀏覽器不允許存檔（無痕模式、空間不足）。');
      return false;
    }
    setData(next);
    return true;
  }, [storage]);

  const savePlanner = useCallback((next: PlannerState): boolean => (
    save({ ...data, terms: { ...data.terms, [term]: { ...workspace, planner: next } } })
  ), [data, save, term, workspace]);

  const apply = useCallback((changes: Change[], label: string, options?: ApplyOptions): ApplyResult => {
    // 學期尚未載入時不寫入，避免以空學期覆蓋資料。
    if (!term) return { status: 'rejected', errors: ['課程資料還沒載入，沒有存檔。'] };
    const result = applyChanges(planner, changes, catalog, options);
    if (result.status !== 'applied') return result;
    if (!savePlanner(result.state)) return { status: 'rejected', errors: ['沒有存檔。'] };
    setUndoEntry({ label, planner: result.undo });
    setNewKeys(new Set(result.diff.added));
    return result;
  }, [catalog, planner, savePlanner, term]);

  const applyAi = useCallback((changes: Change[], label: string, context: Omit<AiApplyContext, 'profile'> = {}): AiApplyResult => {
    if (!term) return { status: 'rejected', violations: [{ code: 'unknown-course', message: '課程資料還沒載入，沒有存檔。', courseKeys: [] }] };
    const result = applyAiChangeSet(planner, changes, catalog, { ...context, profile: data.profile });
    if (result.status !== 'applied') return result;
    if (!savePlanner(result.state)) return { status: 'rejected', violations: [{ code: 'unknown-course', message: '沒有存檔。', courseKeys: [] }] };
    setUndoEntry({ label, planner: result.undo });
    setNewKeys(new Set(result.diff.added));
    return result;
  }, [catalog, data.profile, planner, savePlanner, term]);

  const clearUndo = useCallback(() => setUndoEntry(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const undo = useCallback(() => {
    if (!undoEntry) return;
    savePlanner(undoEntry.planner);
    setUndoEntry(null);
    setNewKeys(new Set());
  }, [savePlanner, undoEntry]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const change = readExternalChange({ key: event.key, newValue: event.newValue });
      if (!change) return;
      setData(change.data);
      setNotice(change.notice);
      setUndoEntry(null);
      setNewKeys(new Set());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const activePlan = planner.plans.find(({ id }) => id === planner.activePlanId) ?? planner.plans[0]!;
  const entries = useMemo(() => activePlan.items.flatMap((item) => {
    const course = catalog.get(item.key);
    return course ? [{ course, item }] : [];
  }), [activePlan.items, catalog]);

  return {
    data,
    planner,
    activePlan,
    catalog,
    entries,
    conflicts: useMemo(() => findConflicts(entries), [entries]),
    credits: totalCredits(entries),
    profile: data.profile,
    notice,
    undoLabel: undoEntry?.label ?? null,
    newKeys,
    apply,
    applyAi,
    undo,
    clearUndo,
    dismissNotice,
    setProfile: (profile) => {
      if (term) save({ ...data, profile });
    },
    replaceData: (next) => {
      try {
        saveStoredData(storage, data, BACKUP_KEY);
        savePreImportCopy(storage, data);
      } catch {
        setNotice('沒有匯入：無法先備份目前的資料（可能是瀏覽器空間不足），目前的資料保持不變。');
        return;
      }
      if (!save(next)) return;
      setUndoEntry(null);
      setNewKeys(new Set());
      setCanRestoreImport(true);
    },
    canRestoreImport,
    restoreBeforeImport: () => {
      const previous = readPreImportCopy(storage);
      if (!previous || !save(previous)) return;
      clearPreImportCopy(storage);
      setCanRestoreImport(false);
      setUndoEntry(null);
      setNewKeys(new Set());
      setNotice('已還原到匯入前的資料。');
    },
    clearAll: () => {
      const empty = createEmptyData();
      try {
        saveStoredData(storage, empty, BACKUP_KEY);
        storage.setItem(PRE_IMPORT_KEY, '');
        storage.setItem(CORRUPT_KEY, '');
      } catch {
        // 備份位置寫不進去不影響清除主資料。
      }
      save(empty);
      setCanRestoreImport(false);
      setUndoEntry(null);
      setNewKeys(new Set());
    },
  };
}
