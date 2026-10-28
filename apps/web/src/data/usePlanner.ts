import {
  applyChanges,
  createPlannerState,
  findConflicts,
  loadStoredData,
  readExternalChange,
  refreshItems,
  saveStoredData,
  toScheduleCourse,
  totalCredits,
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
  apply: (changes: Change[], label: string, options?: ApplyOptions) => ApplyResult;
  undo: () => void;
  clearUndo: () => void;
  dismissNotice: () => void;
  setProfile: (profile: IdentityProfile) => void;
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

  const workspace = data.terms[term] ?? emptyWorkspace();
  const catalog = useMemo(() => {
    const map = new Map<string, ScheduleCourse>();
    courses.forEach((course) => { const scheduled = toScheduleCourse(course); map.set(scheduled.key, scheduled); });
    workspace.manualCourses.forEach((course) => map.set(course.key, course));
    return map;
  }, [courses, workspace.manualCourses]);
  const planner = useMemo(() => withRefreshedItems(workspace.planner, catalog), [workspace.planner, catalog]);

  const save = useCallback((next: StoredData) => {
    // 學期尚未載入時不寫入，避免以空學期覆蓋資料。
    if (!term) return;
    setData(next);
    try {
      saveStoredData(storage, next);
    } catch {
      setNotice('課表無法存到這台裝置（可能是無痕模式或空間不足），重新整理後會遺失。');
    }
  }, [storage, term]);

  const savePlanner = useCallback((next: PlannerState) => {
    save({ ...data, terms: { ...data.terms, [term]: { ...workspace, planner: next } } });
  }, [data, save, term, workspace]);

  const apply = useCallback((changes: Change[], label: string, options?: ApplyOptions): ApplyResult => {
    const result = applyChanges(planner, changes, catalog, options);
    if (result.status === 'applied') {
      savePlanner(result.state);
      setUndoEntry({ label, planner: result.undo });
    }
    return result;
  }, [catalog, planner, savePlanner]);

  const undo = useCallback(() => {
    if (!undoEntry) return;
    savePlanner(undoEntry.planner);
    setUndoEntry(null);
  }, [savePlanner, undoEntry]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const change = readExternalChange({ key: event.key, newValue: event.newValue });
      if (!change) return;
      setData(change.data);
      setNotice(change.notice);
      setUndoEntry(null);
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
    apply,
    undo,
    clearUndo: () => setUndoEntry(null),
    dismissNotice: () => setNotice(null),
    setProfile: (profile) => save({ ...data, profile }),
  };
}
