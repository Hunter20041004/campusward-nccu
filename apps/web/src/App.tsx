import {
  candidateScheduleSummary,
  checkEnrollmentRules,
  clearStudentRecord,
  creditLimits,
  findClashes,
  findOtherSections,
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
  type ScheduleCourse,
  type StorageLike,
  type StudentRecord,
} from '@campusward/engine';
import enrollmentRules from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MobileNav, type MobileView } from './components/MobileNav.tsx';
import { AiPanel } from './components/AiPanel.tsx';
import { CandidatesPanel } from './components/CandidatesPanel.tsx';
import { ConditionsPanel } from './components/ConditionsPanel.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { DataPanel } from './components/DataPanel.tsx';
import { GraduationPanel } from './components/GraduationPanel.tsx';
import { PlanBar } from './components/PlanBar.tsx';
import { RulesPanel } from './components/RulesPanel.tsx';
import { SearchPanel, type SearchSlot } from './components/SearchPanel.tsx';
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
import { DAY_LABELS } from './components/labels.ts';
import { usePlanner } from './data/usePlanner.ts';
import { renderWallpaper, wallpaperLayout } from './data/wallpaper.ts';

const GUIDE_KEY = 'campusward:guide';
/** 小山的衝堂提醒按掉後記住是哪一組衝堂（設計：同一組衝堂只提醒一次）；清除本機資料時一併清掉。 */
const NUDGE_KEY = 'campusward:v1:nudge-dismissed';

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
  // 小山（AI 小助手）跟著常發生的事反應：加課、移出、候選、復原、打字、等 AI（docs/design 小助手一節）。
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
  // 搜課結果與候選清單標示「與某課衝堂」：用引擎同一套衝堂判斷，對目前方案算；同一份課表只算一次。
  const clashesOfCourse = useMemo(() => {
    const cache = new Map<string, string[]>();
    return (course: ScheduleCourse) => {
      let titles = cache.get(course.key);
      if (!titles) {
        titles = findClashes(planner.entries, course).map((clash) => planner.catalog.get(clash)?.title ?? '課程');
        cache.set(course.key, titles);
      }
      return titles;
    };
  }, [planner.catalog, planner.entries]);
  const clashesOf = useMemo(() => (course: Course) => {
    const key = toScheduleCourse(course).key;
    return clashesOfCourse(planner.catalog.get(key) ?? toScheduleCourse(course));
  }, [clashesOfCourse, planner.catalog]);
  // 課表面板：完整課程資料（老師、教室、課綱）與「換一班」。
  const courseByKey = useMemo(() => new Map(courses.map((course) => [toScheduleCourse(course).key, course])), [courses]);
  const otherSections = (key: string) => findOtherSections(planner.entries, key, planner.catalog.values());
  const swapSection = (fromKey: string, toKey: string) => {
    const to = planner.catalog.get(toKey);
    if (!to) return;
    const when = to.meetings.length ? candidateScheduleSummary(to, DAY_LABELS) : '時間未定';
    courseChange('add', [{ type: 'removeFromSchedule', key: fromKey }, { type: 'addToSchedule', key: toKey }], `已把「${titleOf(fromKey)}」換成${to.teacher ?? ''} ${when} 那一班`);
  };
  const quoted = (titles: readonly string[]) => titles.map((title) => `「${title}」`).join('、');
  const addLabelFor = (course: ScheduleCourse) => {
    const clashes = clashesOfCourse(course);
    return `已加入「${course.title}」${clashes.length ? `，與${quoted(clashes)}衝堂` : ''}`;
  };
  const addLabel = (course: Course) => addLabelFor(planner.catalog.get(keyOf(course)) ?? toScheduleCourse(course));
  // 移出候選也會從自己的其他方案移出（與引擎 removeCandidate 一致）；鎖定的課不移。
  const removeCandidate = (key: string, title: string) => {
    const ownPlans = planner.planner.plans.filter(({ auto }) => !auto);
    const locked = ownPlans.find(({ items }) => items.some((item) => item.key === key && item.locked));
    const elsewhere = ownPlans.filter(({ id, items }) => id !== planner.planner.activePlanId && items.some((item) => item.key === key));
    const label = locked
      ? `「${title}」在「${locked.name}」已鎖定，先解鎖才能移出候選`
      : `已移出候選「${title}」${elsewhere.length ? `，也從${quoted(elsewhere.map(({ name }) => name))}移出` : ''}`;
    courseChange('candidate', [{ type: 'removeCandidate', key }], label);
  };
  // 愛心可以切換：已在候選就移出。
  const toggleCandidate = (course: Course) => {
    const key = keyOf(course);
    if (!candidateKeys.has(key)) {
      courseChange('candidate', [{ type: 'addCandidate', key }], `已放進候選「${course.title}」`);
      return;
    }
    removeCandidate(key, course.title);
  };
  const [slot, setSlot] = useState<SearchSlot | null>(null);
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

  // 依身分的學分上下限：課表旁顯示、複製課號前檢查；AI 變更也檢查上限（同一份選課須知）。身分條件只在本機使用。
  const limits = creditLimits(planner.profile, RULES);
  const maximumCredits = limits?.maximum;

  const tools: Tool[] = ['timetable', 'candidates', 'conditions', 'data', ...(FEATURES.graduation ? ['graduation' as const] : [])];
  const aiEnabled = FEATURES.orb || FEATURES.qa || FEATURES.demo;
  const [aiOpen, setAiOpen] = useState(false);
  const conflictPairs = planner.conflicts.map(({ courseKeys }) => [titleOf(courseKeys[0] ?? ''), titleOf(courseKeys[1] ?? '')] as const);
  const conflictSignature = planner.conflicts.map(({ courseKeys }) => courseKeys.join('+')).join('|');
  const [dismissedNudge, setDismissedNudgeState] = useState(() => {
    try {
      return storageRef.current?.getItem(NUDGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const setDismissedNudge = (signature: string) => {
    setDismissedNudgeState(signature);
    try {
      storageRef.current?.setItem(NUDGE_KEY, signature);
    } catch {
      // 存不了就只在這次有效。
    }
  };
  // 課卡面板、手機「更多」、複製課號預覽打開時，提醒泡泡先讓開（不擋住操作）。
  const [cardOpen, setCardOpen] = useState(false);
  const setCardOpenFor = useCallback((key: string | null) => setCardOpen(key !== null), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyPreviewOpen, setCopyPreviewOpen] = useState(false);
  const [cardFocus, setCardFocus] = useState<{ key: string; nonce: number } | null>(null);
  // 沒有金鑰時，按衝堂提醒直接打開衝堂那門課的面板（可以「換一班」），不先跳 AI 設定。
  const openClashingCourse = () => {
    const keys = planner.conflicts.flatMap(({ courseKeys }) => courseKeys);
    const key = keys.find((candidate) => findOtherSections(planner.entries, candidate, planner.catalog.values()).length > 0) ?? keys[0];
    setDismissedNudge(conflictSignature);
    if (!key) return;
    showTool('timetable');
    setCardFocus((previous) => ({ key, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  const nudgeHidden = (cardOpen && tool === 'timetable') || menuOpen || copyPreviewOpen || guideOpen || pendingBackup !== null;
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
  // 「設定年級後可檢查學分上下限」：打開條件並把焦點放到年級。
  const openIdentity = () => {
    showTool('conditions');
    setTimeout(() => {
      const year = document.getElementById('identity-year');
      year?.scrollIntoView?.({ block: 'center' });
      year?.focus();
    }, 0);
  };
  const current = TOOLS.find(({ id }) => id === tool)!;

  return (
    <BuddyProvider hub={buddyHub}>
    {/* 手機底部有分頁列和小山按鈕（離底 80–144px）：留足空白，列表最後的「加入」不會被蓋住。 */}
    <div className="min-h-dvh pb-44 md:pb-6">
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_3.5rem]">
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
                onAdd={(course) => courseChange('add', [{ type: 'addToSchedule', key: keyOf(course) }], addLabel(course))}
                onRemove={(course) => courseChange('remove', [{ type: 'removeFromSchedule', key: keyOf(course) }], `已移出「${course.title}」`)}
                onCandidate={toggleCandidate}
                clashesOf={clashesOf}
                slot={slot}
                {...(planner.profile.level ? { defaultDegree: planner.profile.level } : {})}
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
                  limits={limits}
                  {...(!limits && planner.profile.level !== 'graduate' ? { onSetIdentity: openIdentity } : {})}
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
                  onFindSlot={(day, period) => {
                    setSlot((previous) => ({ day, period, nonce: (previous?.nonce ?? 0) + 1 }));
                    setMobileView('search');
                  }}
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
                  courseOf={(key) => courseByKey.get(key)}
                  otherSections={otherSections}
                  onSwap={swapSection}
                  onSelect={setCardOpenFor}
                  focus={cardFocus}
                />
                {planner.entries.length > 0 && <RulesPanel conflicts={planner.conflicts} reminders={reminders} retakes={retakes} />}
              </div>
              <div hidden={tool !== 'candidates'}>
                <CandidatesPanel
                  candidates={planner.planner.candidates}
                  catalog={planner.catalog}
                  scheduledKeys={scheduledKeys}
                  clashesOf={clashesOfCourse}
                  onAdd={(key) => {
                    const course = planner.catalog.get(key);
                    if (course) courseChange('add', [{ type: 'addToSchedule', key }], addLabelFor(course));
                  }}
                  onRemove={(key) => removeCandidate(key, titleOf(key))}
                  onStartSearch={startSearch}
                />
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
                      setDismissedNudge('');
                      void clearBrowserCaches();
                      setGeneration((value) => value + 1);
                    }}
                    canRestoreImport={planner.canRestoreImport}
                    onRestoreImport={planner.restoreBeforeImport}
                    planName={planner.activePlan.name}
                    limits={limits}
                    onBackToTimetable={() => showTool('timetable')}
                    onCopyPreview={setCopyPreviewOpen}
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
      <MobileNav view={mobileView} tools={tools} onMenu={setMenuOpen} onView={(next) => (next === 'search' ? setMobileView('search') : showTool(next))} />
      {aiEnabled && (
        <FloatingOrb
          open={aiOpen}
          onOpen={() => { setAiOpen(true); setDismissedNudge(conflictSignature); }}
          onClose={() => setAiOpen(false)}
          nudge={nudge}
          onDismissNudge={() => setDismissedNudge(conflictSignature)}
          {...(ai.hasKey() ? {} : { onNudge: openClashingCourse })}
          nudgeHidden={nudgeHidden}
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
