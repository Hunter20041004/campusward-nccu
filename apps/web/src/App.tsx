import {
  checkEnrollmentRules,
  clearStudentRecord,
  findRetakes,
  loadStudentRecord,
  passedAs as passedCourseTitle,
  RECORD_KEY,
  STORAGE_KEY,
  parseEnrollmentRules,
  saveStudentRecord,
  toScheduleCourse,
  type Change,
  type Course,
  type StorageLike,
  type StudentRecord,
} from '@campusward/engine';
import enrollmentRules from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MobileNav, type MobileView } from './components/MobileNav.tsx';
import { AiPanel } from './components/AiPanel.tsx';
import { ConditionsPanel } from './components/ConditionsPanel.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { DataPanel } from './components/DataPanel.tsx';
import { GraduationPanel } from './components/GraduationPanel.tsx';
import { PlanBar } from './components/PlanBar.tsx';
import { RulesPanel } from './components/RulesPanel.tsx';
import { SearchPanel } from './components/SearchPanel.tsx';
import { ToolRail, TOOLS, type Tool } from './components/ToolRail.tsx';
import { Guide } from './components/Guide.tsx';
import { FloatingOrb } from './components/FloatingOrb.tsx';
import { BuddyProvider } from './buddy/BuddyContext.tsx';
import { createBuddyHub, type BuddyHub, type CourseChange } from './buddy/hub.ts';
import { buildBriefing } from './ai/briefing.ts';
import { Timetable } from './components/Timetable.tsx';
import { UndoToast } from './components/UndoToast.tsx';
import { gemini } from './ai/session.ts';
import { FEATURES } from './features.ts';
import type { GeminiClient } from './ai/gemini.ts';
import { browserStorage, clearBrowserCaches } from './data/browserStorage.ts';
import { httpCatalogSource, type CatalogSource } from './data/catalog.ts';
import { useCatalog } from './data/useCatalog.ts';
import { usePlanner } from './data/usePlanner.ts';
import { renderWallpaper, wallpaperLayout } from './data/wallpaper.ts';

const GUIDE_KEY = 'campusward:guide';

// 手機一次只顯示一個區塊（搜課或右側工具）；桌機三欄同時顯示。
const mobileOnly = (visible: boolean) => (visible ? 'flex' : 'hidden md:flex');

const NO_COURSES: readonly Course[] = [];
const RULES = parseEnrollmentRules(enrollmentRules);

export function App({ catalog = httpCatalogSource, storage, ai = gemini, guide = true, buddyHub: givenHub }: { catalog?: CatalogSource; storage?: StorageLike; ai?: GeminiClient; guide?: boolean; buddyHub?: BuddyHub }) {
  const data = useCatalog(catalog);
  const storageRef = useRef<StorageLike | null>(storage ?? null);
  if (!storageRef.current) storageRef.current = browserStorage();
  const ready = data.status === 'ready';
  const courses = ready ? data.courses : NO_COURSES;
  // 載入前以空學期代碼呼叫：不讀寫任何學期，版面只有一份，載入前後不會重建。
  const planner = usePlanner({ term: ready ? data.term : '', courses, storage: storageRef.current });
  // 小山（AI 光球）跟著常發生的事反應：加課、移出、候選、復原、打字、等 AI（docs/design 小助手一節）。
  const [buddyHub] = useState(() => givenHub ?? createBuddyHub({ storage: storageRef.current! }));
  // 加課要等課表更新後才知道有沒有衝堂：記下加之前的衝堂數，課表變了再告訴小山。
  const conflictsBeforeAdd = useRef<number | null>(null);
  useEffect(() => {
    if (conflictsBeforeAdd.current === null) return;
    buddyHub.changed('add', { conflict: planner.conflicts.length > conflictsBeforeAdd.current });
    conflictsBeforeAdd.current = null;
  }, [buddyHub, planner.conflicts.length, planner.entries.length]);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState<Tool>('timetable');
  const [mobileView, setMobileView] = useState<MobileView>('timetable');
  // 第一次進站顯示使用導覽（2026-11-01 使用者決定）；看過就記在這台裝置，「?」可以再開。
  const [guideOpen, setGuideOpen] = useState(() => guide && storageRef.current?.getItem(GUIDE_KEY) !== 'seen');
  // 全人系統資料：匯入一次、各功能共用，存在這台瀏覽器（不送 AI、不進匯出檔）。
  const [record, setRecordState] = useState<StudentRecord | null>(() => (storageRef.current ? loadStudentRecord(storageRef.current) : null));
  const [recordNotice, setRecordNotice] = useState('');
  const setRecord = (next: StudentRecord | null) => {
    try {
      if (next) saveStudentRecord(storageRef.current!, next);
      else clearStudentRecord(storageRef.current!);
      setRecordNotice('');
    } catch {
      setRecordNotice('修課資料沒有存進這台裝置（可能是無痕模式或空間不足），重新整理後要重新匯入。');
    }
    setRecordState(next);
  };
  // 另一個分頁清除或重新匯入修課資料時跟著更新（共用電腦上清除後，其他分頁也不能還顯示）。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== RECORD_KEY && event.key !== STORAGE_KEY) return;
      setRecordState(storageRef.current ? loadStudentRecord(storageRef.current) : null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const closeGuide = () => {
    setGuideOpen(false);
    try {
      storageRef.current?.setItem(GUIDE_KEY, 'seen');
    } catch {
      // 存不了就下次再顯示。
    }
  };
  const searchRef = useRef<HTMLInputElement>(null);
  const scheduledKeys = useMemo(() => new Set(planner.activePlan.items.map(({ key }) => key)), [planner.activePlan.items]);
  const candidateKeys = useMemo(() => new Set(planner.planner.candidates), [planner.planner.candidates]);
  const keyOf = (course: Course) => toScheduleCourse(course).key;
  const reminders = useMemo(() => checkEnrollmentRules(planner.entries, planner.profile, RULES), [planner.entries, planner.profile]);
  const retakes = useMemo(() => (record ? findRetakes(record, planner.entries).map((retake) => ({
    key: retake.key,
    message: `「${planner.catalog.get(retake.key)?.title ?? retake.key}」與你已通過的「${retake.passedTitle}」${retake.reason === 'code' ? '課號前六碼相同' : '同名'}，可能是重複修習，學分通常不計入畢業學分。`,
  })) : []), [planner.catalog, planner.entries, record]);
  // 搜課結果標示「已修過」：和重修提醒同一套比對（全學年課的另一學期不算）。
  const passedAs = useMemo(() => (record ? (course: Course) => passedCourseTitle(record, toScheduleCourse(course)) : undefined), [record]);
  const titleOf = (key: string) => planner.catalog.get(key)?.title ?? '課程';
  const [pendingBackup, setPendingBackup] = useState<{ changes: Change[]; label: string; replace: number } | null>(null);
  // 清除本機資料後換掉這個值，讓 AI 面板與畢業缺口重新掛載（金鑰、勾選、匯入的修課資料都歸零）。
  const [generation, setGeneration] = useState(0);
  // 大改動前會自動備份；備份滿了先問，不悄悄蓋掉最舊的一份（設計 6.1）。
  const applyChange = (changes: Change[], label: string) => {
    const result = planner.apply(changes, label);
    if (result.status === 'needsConfirmation') setPendingBackup({ changes, label, replace: result.replace });
    return result;
  };
  // 復原（底部提示或 AI 回覆卡）：記下復原的是哪一次，讓對話裡那張卡跟著標成已復原。
  const [undone, setUndone] = useState<{ label: string; count: number } | null>(null);
  const undoLast = () => {
    const label = planner.undoLabel;
    planner.undo();
    buddyHub.changed('undo');
    if (label) setUndone((previous) => ({ label, count: (previous?.count ?? 0) + 1 }));
  };
  const courseChange = (kind: CourseChange, changes: Change[], label: string) => {
    const before = planner.conflicts.length;
    if (applyChange(changes, label).status !== 'applied') return;
    if (kind === 'add') conflictsBeforeAdd.current = before;
    else buddyHub.changed(kind);
  };
  const conditionCourses = useMemo(() => {
    const keys = new Set([...planner.planner.candidates, ...planner.activePlan.items.map(({ key }) => key)]);
    return [...keys].flatMap((key) => {
      const course = planner.catalog.get(key);
      return course ? [course] : [];
    });
  }, [planner.activePlan.items, planner.catalog, planner.planner.candidates]);

  // AI 變更也檢查學分上限（與規則提醒同一份選課須知）；身分條件只在本機使用。
  const maximumCredits = planner.profile.level !== 'graduate' && planner.profile.year
    ? RULES.credits.maximum[planner.profile.additionalMajor ?? 'none']
    : undefined;

  const tools: Tool[] = ['timetable', 'conditions', 'data', ...(FEATURES.graduation ? ['graduation' as const] : [])];
  const aiEnabled = FEATURES.orb || FEATURES.qa || FEATURES.demo;
  const [aiOpen, setAiOpen] = useState(false);
  const conflictPairs = planner.conflicts.map(({ courseKeys }) => [titleOf(courseKeys[0] ?? ''), titleOf(courseKeys[1] ?? '')] as const);
  const conflictSignature = planner.conflicts.map(({ courseKeys }) => courseKeys.join('+')).join('|');
  const [dismissedNudge, setDismissedNudge] = useState('');
  const nudge = conflictSignature && dismissedNudge !== conflictSignature
    ? `有 ${planner.conflicts.length} 個衝堂，要我幫忙看看嗎？`
    : null;
  const briefing = buildBriefing({
    courses: planner.entries.length,
    credits: planner.credits,
    conflicts: conflictPairs,
    warnings: reminders.filter(({ severity }) => severity === 'warn').length + retakes.length,
    freeDays: planner.planner.preferences.freeDays,
    unscheduledCandidates: planner.planner.candidates.filter((key) => !scheduledKeys.has(key)).length,
  });
  const showTool = (next: Tool) => {
    setTool(next);
    setMobileView(next);
  };
  const startSearch = () => {
    setMobileView('search');
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  const current = TOOLS.find(({ id }) => id === tool)!;

  return (
    <BuddyProvider hub={buddyHub}>
    <div className="min-h-dvh pb-28 md:pb-6">
      <Header termLabel={ready ? data.label : data.status === 'loading' ? '載入中' : '—'} onGuide={() => setGuideOpen(true)} />
      <main data-mobile-view={mobileView} className="mx-auto max-w-[1600px] px-4 pt-2 md:px-6">
        {data.status === 'error' && (
          <p role="alert" className="well mb-3 rounded-2xl px-4 py-3 text-sm text-coral-ink">
            課程資料暫時載入不了，請檢查網路後重新整理。已排的課表仍保存在這台裝置。
          </p>
        )}
        {recordNotice && <p role="alert" className="well mb-3 rounded-2xl px-4 py-3 text-sm">{recordNotice}</p>}
        {planner.notice && (
          <p role="alert" className="well mb-3 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm">
            <span className="flex-1">{planner.notice}</span>
            <button type="button" className="btn btn-sm min-h-11" onClick={planner.dismissNotice}>知道了</button>
          </p>
        )}
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_3.5rem]">
          <section aria-labelledby="search-title" className={`relief flex-col p-4 md:sticky md:top-20 md:h-[calc(100dvh-6rem)] ${mobileOnly(mobileView === 'search')}`}>
            <h2 id="search-title" className="flex items-center gap-2 px-1 text-xl font-bold text-mist-ink">
              <Search className="size-5" aria-hidden="true" />課程搜尋<span aria-hidden="true" className="h-5 w-0.5 rounded bg-mist-ink/50" />
            </h2>
            {ready ? (
              <SearchPanel
                courses={courses}
                query={query}
                onQuery={setQuery}
                searchRef={searchRef}
                scheduledKeys={scheduledKeys}
                candidateKeys={candidateKeys}
                onAdd={(course) => courseChange('add', [{ type: 'addToSchedule', key: keyOf(course) }], `已加入「${course.title}」`)}
                onRemove={(course) => courseChange('remove', [{ type: 'removeFromSchedule', key: keyOf(course) }], `已移出「${course.title}」`)}
                onCandidate={(course) => courseChange('candidate', [{ type: 'addCandidate', key: keyOf(course) }], `已放進候選「${course.title}」`)}
                {...(passedAs ? { passedAs } : {})}
              />
            ) : (
              <p className="p-4 text-sm text-base-content/80">{data.status === 'loading' ? '正在載入課程資料…' : '課程資料載入失敗。'}</p>
            )}
          </section>

          <section aria-labelledby="tool-title" className={`relief flex-col md:sticky md:top-20 md:h-[calc(100dvh-6rem)] ${mobileOnly(mobileView !== 'search')}`}>
            <h2 id="tool-title" className="flex items-center gap-2 px-5 pt-4 text-xl font-bold text-mist-ink">
              {current.icon}{current.label}<span aria-hidden="true" className="h-5 w-0.5 rounded bg-mist-ink/50" />
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* 每個工具都保持掛載、只隱藏沒選的：切換不會丟掉 AI 結果與輸入到一半的文字。 */}
              <div hidden={tool !== 'timetable'} className="space-y-3">
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
                <Timetable
                  entries={planner.entries}
                  conflicts={planner.conflicts}
                  newKeys={planner.newKeys}
                  onStartSearch={startSearch}
                  onImport={() => {
                    showTool('data');
                    setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="匯入資料"]')?.click(), 0);
                  }}
                  onToggleLock={(key) => {
                    const locked = !planner.activePlan.items.find((item) => item.key === key)?.locked;
                    applyChange([{ type: 'setLock', key, locked }], `已${locked ? '鎖定' : '解鎖'}「${titleOf(key)}」`);
                  }}
                  onStatus={(key, status) => applyChange([{ type: 'setStatus', key, status }], `已將「${titleOf(key)}」標為${{ planned: '排入', registered: '已灌檔', enrolled: '已選上' }[status]}`)}
                  onAttendance={(key, attendance) => applyChange([{ type: 'setAttendance', key, attendance }], `「${titleOf(key)}」改為${attendance === 'async' ? '非同步' : '同步'}上課`)}
                  onRemove={(key) => courseChange('remove', [{ type: 'removeFromSchedule', key }], `已移出「${titleOf(key)}」`)}
                />
                {planner.entries.length > 0 && <RulesPanel conflicts={planner.conflicts} reminders={reminders} retakes={retakes} />}
              </div>
              <div hidden={tool !== 'conditions'}>
                <ConditionsPanel
                  profile={planner.profile}
                  courses={conditionCourses}
                  entries={planner.entries}
                  preferences={planner.planner.preferences}
                  onProfile={planner.setProfile}
                  onPreferences={(change) => applyChange([{ type: 'setPreference', ...change }], '已更新偏好')}
                  record={record}
                  onRecord={setRecord}
                  allCourses={courses}
                />
              </div>
              <div hidden={tool !== 'data'}>
                {ready && (
                  <DataPanel
                    entries={planner.entries}
                    data={planner.data}
                    term={data.term}
                    onReplace={planner.replaceData}
                    onClear={() => {
                      planner.clearAll();
                      setRecord(null);
                      ai.removeKey();
                      buddyHub.setQuiet(false);
                      void clearBrowserCaches();
                      setGeneration((value) => value + 1);
                    }}
                    canRestoreImport={planner.canRestoreImport}
                    onRestoreImport={planner.restoreBeforeImport}
                    onWallpaper={() => {
                      void renderWallpaper(wallpaperLayout(planner.entries, data.label)).then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `campusward-${data.term}-課表.png`;
                        link.click();
                        URL.revokeObjectURL(url);
                      });
                    }}
                  />
                )}
              </div>
              {tools.includes('graduation') && (
                <div hidden={tool !== 'graduation'}>
                  {ready && (
                    <GraduationPanel
                      key={`graduation-${generation}`}
                      courses={courses}
                      record={record}
                      onRecord={setRecord}
                      candidateKeys={candidateKeys}
                      scheduledKeys={scheduledKeys}
                      profile={planner.profile}
                      credits={planner.credits}
                      onCandidate={(course) => courseChange('candidate', [{ type: 'addCandidate', key: keyOf(course) }], `已放進候選「${course.title}」`)}
                      onProfile={planner.setProfile}
                    />
                  )}
                </div>
              )}
            </div>
          </section>

          <ToolRail tool={tool} tools={tools} onTool={showTool} />
        </div>
      </main>
      <ConfirmDialog
        open={pendingBackup !== null}
        title="自動備案已滿"
        message={`改動前會自動備份原本的課表，但自動備案已經滿了。要刪掉最舊的 ${pendingBackup?.replace ?? 1} 份再繼續嗎？`}
        confirmLabel={`刪掉最舊的 ${pendingBackup?.replace ?? 1} 份並繼續`}
        onConfirm={() => {
          if (pendingBackup) planner.apply(pendingBackup.changes, pendingBackup.label, { replaceOldestAutoBackup: true });
          setPendingBackup(null);
        }}
        onCancel={() => setPendingBackup(null)}
      />
      <UndoToast label={planner.undoLabel} onUndo={undoLast} onExpire={planner.clearUndo} />
      <MobileNav view={mobileView} tools={tools} onView={(next) => (next === 'search' ? setMobileView('search') : showTool(next))} />
      {aiEnabled && (
        <FloatingOrb
          open={aiOpen}
          onOpen={() => { setAiOpen(true); setDismissedNudge(conflictSignature); }}
          onClose={() => setAiOpen(false)}
          nudge={nudge}
          onDismissNudge={() => setDismissedNudge(conflictSignature)}
        >
          <AiPanel
                    key={`ai-${generation}`}
                    client={ai}
                    term={ready ? data.term : ''}
                    termLabel={ready ? data.label : ''}
                    planner={planner.planner}
                    catalog={planner.catalog}
                    courses={courses}
                    ready={ready}
                    briefing={briefing}
                    onShowTimetable={() => {
                      showTool('timetable');
                      // 手機上面板蓋住整個畫面，看課表就先收起來（對話內容保留）。
                      if (typeof matchMedia === 'function' && !matchMedia('(min-width: 768px)').matches) setAiOpen(false);
                    }}
                    onUndo={undoLast}
                    undoLabel={planner.undoLabel}
                    undone={undone}
                    visible={aiOpen}
                    onApply={(changes, label, replaceOldestAutoBackup) => planner.applyAi(changes, label, {
                      ...(ready ? { termLabel: data.label } : {}),
                      ...(maximumCredits !== undefined ? { maximumCredits } : {}),
                      ...(replaceOldestAutoBackup ? { replaceOldestAutoBackup } : {}),
                    })}
                  />
        </FloatingOrb>
      )}
      <Guide open={guideOpen} onClose={closeGuide} />
    </div>
    </BuddyProvider>
  );
}
