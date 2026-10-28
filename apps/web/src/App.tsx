import { checkEnrollmentRules, parseEnrollmentRules, toScheduleCourse, type Change, type Course, type StorageLike } from '@campusward/engine';
import enrollmentRules from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MobileNav, type MobileView } from './components/MobileNav.tsx';
import { ConditionsPanel } from './components/ConditionsPanel.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { PlanBar } from './components/PlanBar.tsx';
import { RulesPanel } from './components/RulesPanel.tsx';
import { SearchPanel } from './components/SearchPanel.tsx';
import { SidePanel, type SideTab } from './components/SidePanel.tsx';
import { Timetable } from './components/Timetable.tsx';
import { UndoToast } from './components/UndoToast.tsx';
import { browserStorage } from './data/browserStorage.ts';
import { httpCatalogSource, type CatalogSource } from './data/catalog.ts';
import { useCatalog } from './data/useCatalog.ts';
import { usePlanner } from './data/usePlanner.ts';

interface ViewState {
  query: string;
  sideTab: SideTab;
  mobileView: MobileView;
}

// 手機一次只顯示一個區塊；桌機兩欄同時顯示。
const mobileOnly = (visible: boolean) => (visible ? '' : 'hidden md:block');

const NO_COURSES: readonly Course[] = [];
const RULES = parseEnrollmentRules(enrollmentRules);

export function App({ catalog = httpCatalogSource, storage }: { catalog?: CatalogSource; storage?: StorageLike }) {
  const data = useCatalog(catalog);
  const storageRef = useRef<StorageLike | null>(storage ?? null);
  if (!storageRef.current) storageRef.current = browserStorage();
  const ready = data.status === 'ready';
  const courses = ready ? data.courses : NO_COURSES;
  // 載入前以空學期代碼呼叫：不讀寫任何學期，版面只有一份，載入前後不會重建。
  const planner = usePlanner({ term: ready ? data.term : '', courses, storage: storageRef.current });
  const [view, setViewState] = useState<ViewState>({ query: '', sideTab: 'search', mobileView: 'timetable' });
  const setView = (update: Partial<ViewState>) => setViewState((current) => ({ ...current, ...update }));
  const searchRef = useRef<HTMLInputElement>(null);
  const scheduledKeys = useMemo(() => new Set(planner.activePlan.items.map(({ key }) => key)), [planner.activePlan.items]);
  const candidateKeys = useMemo(() => new Set(planner.planner.candidates), [planner.planner.candidates]);
  const keyOf = (course: Course) => toScheduleCourse(course).key;
  const reminders = useMemo(() => checkEnrollmentRules(planner.entries, planner.profile, RULES), [planner.entries, planner.profile]);
  const titleOf = (key: string) => planner.catalog.get(key)?.title ?? '課程';
  const [pendingBackup, setPendingBackup] = useState<{ changes: Change[]; label: string } | null>(null);
  // 大改動前會自動備份；備份滿了先問，不悄悄蓋掉最舊的一份（設計 6.1）。
  const applyChange = (changes: Change[], label: string) => {
    const result = planner.apply(changes, label);
    if (result.status === 'needsConfirmation') setPendingBackup({ changes, label });
    return result;
  };
  const conditionCourses = useMemo(() => {
    const keys = new Set([...planner.planner.candidates, ...planner.activePlan.items.map(({ key }) => key)]);
    return [...keys].flatMap((key) => {
      const course = planner.catalog.get(key);
      return course ? [course] : [];
    });
  }, [planner.activePlan.items, planner.catalog, planner.planner.candidates]);

  const handleQuery = (query: string) => setView({ query, sideTab: 'search', ...(query ? { mobileView: 'search' as const } : {}) });
  const startSearch = () => {
    setView({ sideTab: 'search' });
    searchRef.current?.focus();
  };
  const handleView = (mobileView: MobileView) => setView({ mobileView, ...(mobileView !== 'timetable' ? { sideTab: mobileView } : {}) });

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <Header
        query={view.query}
        onQuery={handleQuery}
        searchRef={searchRef}
        termLabel={ready ? data.label : data.status === 'loading' ? '載入中' : '—'}
      />
      <main data-mobile-view={view.mobileView} className="mx-auto max-w-[1440px] px-4 pt-4 md:px-6">
        {data.status === 'error' && (
          <p role="alert" className="mb-3 rounded-field border border-coral-ink/40 bg-error/10 px-4 py-3 text-sm text-coral-ink">
            課程資料暫時載入不了，請檢查網路後重新整理。已排的課表仍保存在這台裝置。
          </p>
        )}
        {planner.notice && (
          <p role="alert" className="mb-3 flex items-start gap-3 rounded-field border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            <span className="flex-1">{planner.notice}</span>
            <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={planner.dismissNotice}>知道了</button>
          </p>
        )}
        <PlanBar
          plans={planner.planner.plans}
          activePlanId={planner.planner.activePlanId}
          credits={planner.credits}
          catalog={planner.catalog}
          onSwitch={(planId) => applyChange([{ type: 'switchPlan', planId }], `已切換到「${planner.planner.plans.find(({ id }) => id === planId)?.name ?? '方案'}」`)}
          onCreate={() => {
            const name = `備案 ${planner.planner.plans.filter(({ auto }) => !auto).length}`;
            applyChange([{ type: 'createPlan', name }], `已另存「${name}」`);
          }}
        />
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className={mobileOnly(view.mobileView === 'timetable')}>
            <div className="space-y-3">
              <Timetable
                entries={planner.entries}
                conflicts={planner.conflicts}
                newKeys={planner.newKeys}
                onStartSearch={startSearch}
                onImport={() => {}}
                onToggleLock={(key) => {
                  const locked = !planner.activePlan.items.find((item) => item.key === key)?.locked;
                  applyChange([{ type: 'setLock', key, locked }], `已${locked ? '鎖定' : '解鎖'}「${titleOf(key)}」`);
                }}
                onStatus={(key, status) => applyChange([{ type: 'setStatus', key, status }], `已將「${titleOf(key)}」標為${{ planned: '排入', registered: '已灌檔', enrolled: '已選上' }[status]}`)}
                onAttendance={(key, attendance) => applyChange([{ type: 'setAttendance', key, attendance }], `「${titleOf(key)}」改為${attendance === 'async' ? '非同步' : '同步'}上課`)}
                onRemove={(key) => applyChange([{ type: 'removeFromSchedule', key }], `已移出「${titleOf(key)}」`)}
              />
              {planner.entries.length > 0 && <RulesPanel conflicts={planner.conflicts} reminders={reminders} />}
            </div>
          </div>
          <div className={mobileOnly(view.mobileView !== 'timetable')}>
            <SidePanel
              tab={view.sideTab}
              onTab={(sideTab) => setView({ sideTab })}
              conditions={(
                <ConditionsPanel
                  profile={planner.profile}
                  courses={conditionCourses}
                  entries={planner.entries}
                  preferences={planner.planner.preferences}
                  onProfile={planner.setProfile}
                  onPreferences={(change) => applyChange([{ type: 'setPreference', ...change }], '已更新偏好')}
                />
              )}
            >
              {ready ? (
                <SearchPanel
                  courses={courses}
                  query={view.query}
                  scheduledKeys={scheduledKeys}
                  candidateKeys={candidateKeys}
                  onAdd={(course) => applyChange([{ type: 'addToSchedule', key: keyOf(course) }], `已加入「${course.title}」`)}
                  onRemove={(course) => applyChange([{ type: 'removeFromSchedule', key: keyOf(course) }], `已移出「${course.title}」`)}
                  onCandidate={(course) => applyChange([{ type: 'addCandidate', key: keyOf(course) }], `已放進候選「${course.title}」`)}
                />
              ) : (
                <p className="text-sm text-base-content/80">{data.status === 'loading' ? '正在載入課程資料…' : '課程資料載入失敗。'}</p>
              )}
            </SidePanel>
          </div>
        </div>
      </main>
      <ConfirmDialog
        open={pendingBackup !== null}
        title="自動備案已滿"
        message="改動前會自動備份原本的課表，但自動備案已經有 5 份。要刪掉最舊的一份再繼續嗎？"
        confirmLabel="刪掉最舊的並繼續"
        onConfirm={() => {
          if (pendingBackup) planner.apply(pendingBackup.changes, pendingBackup.label, { replaceOldestAutoBackup: true });
          setPendingBackup(null);
        }}
        onCancel={() => setPendingBackup(null)}
      />
      <UndoToast label={planner.undoLabel} onUndo={planner.undo} onExpire={planner.clearUndo} />
      <MobileNav view={view.mobileView} onView={handleView} />
    </div>
  );
}
