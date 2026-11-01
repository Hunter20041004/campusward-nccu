import {
  candidateScheduleSummary,
  checkEnrollmentRules,
  clearStudentRecord,
  creditLimits,
  findClashes,
  findOtherSections,
  findRetakes,
  formatClassName,
  freeStretch,
  gapGeneralEducation,
  loadStudentRecord,
  parseClassName,
  suggestSectionSwap,
  passedAs as passedCourseTitle,
  RECORD_KEY,
  STORAGE_KEY,
  parseEnrollmentRules,
  saveStudentRecord,
  toScheduleCourse,
  type ApplyOptions,
  type Change,
  type Course,
  type FillContext,
  type FillPlan,
  type IdentityProfile,
  type ScheduleCourse,
  type StorageLike,
  type StudentRecord,
} from '@campusward/engine';
import enrollmentRules from '../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { CalendarDays } from 'lucide-react';
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
import { loadOrbPosition, ORB_POSITION_KEY, saveOrbPosition, type OrbPosition } from './buddy/orbPosition.ts';
import { buildBriefing } from './ai/briefing.ts';
import { Timetable } from './components/Timetable.tsx';
import { ClassBar } from './components/ClassBar.tsx';
import { FillPlanner } from './components/FillPlanner.tsx';
import type { ClashFix } from './components/ClashFix.ts';
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

/** 畢業缺口缺的通識類別（補通識時排前面）。 */
function gapCategoriesFor(record: StudentRecord | null, catalog: readonly ScheduleCourse[]): string[] {
  if (!record) return [];
  const categories = [...new Set(catalog.map(({ official }) => official?.generalEducation ?? '').filter(Boolean))];
  return gapGeneralEducation(record.audit.gaps, categories);
}
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
  // 小山拖到哪裡就記在這台裝置；清除本機資料時回到右下角。
  const [orbPosition, setOrbPosition] = useState<OrbPosition | null>(() => loadOrbPosition(storageRef.current!));
  const moveOrb = (next: OrbPosition) => {
    setOrbPosition(next);
    saveOrbPosition(storageRef.current!, next);
  };
  // 加課要等課表更新後才知道有沒有衝堂：記下加之前的衝堂數，課表變了再告訴小山。
  const conflictsBeforeAdd = useRef<number | null>(null);
  useEffect(() => {
    if (conflictsBeforeAdd.current === null) return;
    buddyHub.changed('add', { conflict: planner.conflicts.length > conflictsBeforeAdd.current });
    conflictsBeforeAdd.current = null;
  }, [buddyHub, planner.conflicts.length, planner.entries.length]);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState<Tool>('search');
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
  // 匯入全人系統資料：身分（系級、學制、年級、加修學系）直接帶入，提示列可以復原（易用性審查第 6 名，取代「套用到我的條件」）。
  const importRecord = (next: StudentRecord | null) => {
    setRecord(next);
    if (!next) return;
    const suggested = next.suggestedProfile;
    const parsedClass = parseClassName(next.enrollment.className);
    const profile: IdentityProfile = { ...planner.profile, ...suggested, ...(parsedClass ? { className: formatClassName(parsedClass) } : {}) };
    const same = (['className', 'level', 'year', 'additionalMajor'] as const).every((field) => profile[field] === planner.profile[field]);
    if (same) return;
    const parts = [
      profile.className,
      profile.level ? `${{ undergrad: '學士班', graduate: '碩博士班' }[profile.level]}${profile.year ? `${'一二三四五六七'[profile.year - 1]}年級` : ''}` : '',
      profile.additionalMajor ? { none: '沒有加修', minor: '輔系', double: '雙主修' }[profile.additionalMajor] : '',
    ].filter(Boolean);
    planner.setProfile(profile, `已依全人系統資料設定身分：${parts.join('・')}`);
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
  // 衝堂的本機解法（易用性審查第 4 名）：只有一班可換就直接換，好幾班就打開課卡讓學生挑；不用金鑰、不經 AI。
  const openCourseCard = (key: string) => {
    showTimetable();
    setCardFocus((previous) => ({ key, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  const clashFixFor = (keys: readonly string[]): ClashFix | null => {
    const swap = suggestSectionSwap(planner.entries, keys, planner.catalog.values());
    if (!swap) return null;
    const title = titleOf(swap.key);
    const [only] = swap.sections;
    if (swap.sections.length === 1 && only) {
      const when = only.meetings.length ? candidateScheduleSummary(only, DAY_LABELS) : '時間未定';
      return { label: `換到${when} 那班`, description: `把「${title}」換到${when} 那班`, onClick: () => swapSection(swap.key, only.key) };
    }
    return { label: `換一班（${swap.sections.length}）`, description: `看「${title}」可以換的 ${swap.sections.length} 班`, onClick: () => openCourseCard(swap.key) };
  };
  const otherKeys = (key: string) => [...new Set(planner.conflicts
    .filter(({ courseKeys }) => courseKeys.includes(key))
    .flatMap(({ courseKeys }) => courseKeys)
    .filter((other) => other !== key))];
  // 加入會衝堂的課：提示條旁放換班按鈕；提示換成別的修改就不再顯示。
  const [addedClash, setAddedClash] = useState<{ key: string; label: string } | null>(null);
  const toastClashKeys = addedClash && planner.undoLabel === addedClash.label ? otherKeys(addedClash.key) : [];
  const toastAction = addedClash && toastClashKeys.length ? clashFixFor([addedClash.key, ...toastClashKeys]) : null;
  const quoted = (titles: readonly string[]) => titles.map((title) => `「${title}」`).join('、');
  const addLabelFor = (course: ScheduleCourse) => {
    const clashes = clashesOfCourse(course);
    return `已加入「${course.title}」${clashes.length ? `，與${quoted(clashes)}衝堂` : ''}`;
  };
  const addOne = (key: string) => {
    const course = planner.catalog.get(key);
    if (!course) return;
    const label = addLabelFor(course);
    setAddedClash(clashesOfCourse(course).length ? { key, label } : null);
    courseChange('add', [{ type: 'addToSchedule', key }], label);
  };
  // 移出候選也會從自己的其他方案移出（與引擎 removeCandidate 一致）；鎖定的課不移。
  const removeCandidate = (key: string, title: string) => {
    const ownPlans = planner.planner.plans.filter(({ auto }) => !auto);
    const locked = ownPlans.find(({ items }) => items.some((item) => item.key === key && item.locked));
    const inPlans = ownPlans.filter(({ items }) => items.some((item) => item.key === key));
    const current = inPlans.find(({ id }) => id === planner.planner.activePlanId);
    const others = inPlans.filter(({ id }) => id !== planner.planner.activePlanId);
    // 引擎會把這門課從所有自己的方案移出，目前這份課表也包括在內：提示要講清楚。
    const where = [current ? `目前的課表「${current.name}」` : '', others.length ? quoted(others.map(({ name }) => name)) : ''].filter(Boolean).join('和');
    const label = locked
      ? `「${title}」在「${locked.name}」已鎖定，先解鎖才能移出候選`
      : `已移出候選「${title}」${where ? `，也從${where}移出` : ''}`;
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
  const applyChange = (changes: Change[], label: string, options?: ApplyOptions) => {
    const result = planner.apply(changes, label, options);
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
  const courseChange = (kind: CourseChange, changes: Change[], label: string, options?: ApplyOptions) => {
    const before = planner.conflicts.length;
    if (applyChange(changes, label, options).status !== 'applied') return;
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

  // 幫我排滿與畢業缺口「排一門進去」共用的本機規則：目前方案當固定點，偏好、學分上限、初選科目數上限、已修過都照算。
  const catalogList = useMemo(() => [...planner.catalog.values()], [planner.catalog]);
  const fillContext = useMemo<FillContext>(() => ({
    entries: planner.entries,
    catalog: catalogList,
    profile: planner.profile,
    preferences: planner.planner.preferences,
    rules: RULES,
    ...(maximumCredits !== undefined ? { maximumCredits } : {}),
    ...(record ? { passed: (course: ScheduleCourse) => passedCourseTitle(record, course) !== null } : {}),
    ...(gapCategoriesFor(record, catalogList).length ? { priorityCategories: gapCategoriesFor(record, catalogList) } : {}),
  }), [catalogList, maximumCredits, planner.entries, planner.planner.preferences, planner.profile, record]);
  // 挑一份當目前方案，其餘各自另存成備案；整批是一筆可復原的修改。原本有課才另存自動備案（全空的課表沒有東西要備份）。
  const applyFill = (chosen: FillPlan, others: FillPlan[]) => {
    const home = planner.planner.activePlanId;
    const changes: Change[] = [
      ...others.flatMap((plan): Change[] => [
        { type: 'createPlan', name: `排滿・${plan.label}` },
        ...plan.picks.map(({ key }): Change => ({ type: 'addToSchedule', key })),
        { type: 'switchPlan', planId: home },
      ]),
      ...chosen.picks.map(({ key }): Change => ({ type: 'addToSchedule', key })),
    ];
    const label = `已排到 ${chosen.credits} 學分（加 ${chosen.picks.length} 門）${others.length ? `，另存 ${others.length} 份備案` : ''}`;
    courseChange('add', changes, label, { autoBackup: planner.entries.length > 0 });
  };

  const tools: Tool[] = ['search', 'candidates', 'conditions', 'data', ...(FEATURES.graduation ? ['graduation' as const] : [])];
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
  // 衝堂的鍵：後加入的那門排前面（通常是學生想換的那門）。
  const conflictKeys = [...new Set(planner.conflicts.flatMap(({ courseKeys }) => [courseKeys[1], courseKeys[0]]))];
  const openClashingCourse = () => {
    // 優先打開「沒鎖定、而且有別班可以換」的那門；鎖定的課面板裡不會出現換一班。
    const unlocked = conflictKeys.filter((candidate) => !planner.entries.find(({ course }) => course.key === candidate)?.item.locked);
    const key = suggestSectionSwap(planner.entries, conflictKeys, planner.catalog.values())?.key ?? unlocked[0] ?? conflictKeys[0];
    setDismissedNudge(conflictSignature);
    if (!key) return;
    openCourseCard(key);
  };
  const conflictFix = conflictKeys.length ? clashFixFor(conflictKeys) : null;
  const nudgeHidden = cardOpen || menuOpen || copyPreviewOpen || guideOpen || pendingBackup !== null;
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
    localClashFix: conflictFix !== null,
  });
  const showTool = (next: Tool) => {
    setTool(next);
    setMobileView(next);
  };
  // 課表一直在左邊；手機上才需要切到「課表」分頁。
  const showTimetable = () => setMobileView('timetable');
  const startSearch = () => {
    showTool('search');
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  // 「設定年級後可檢查學分上下限」：把焦點放到課表上方的系級。
  const classRef = useRef<HTMLInputElement>(null);
  const openIdentity = () => {
    showTimetable();
    setTimeout(() => {
      classRef.current?.scrollIntoView?.({ block: 'center' });
      classRef.current?.focus();
    }, 0);
  };
  // 系級（易用性審查第 1 名）：本班必修、空堂找課的「本系」、學分上下限都依它；全人系統匯出檔讀到的系級按一次確認就帶入。
  // 同一個系級保持同一個物件：幫我排滿依它重算，換一門的結果才不會在每次重畫時被洗掉。
  const identityClass = useMemo(() => (planner.profile.className ? parseClassName(planner.profile.className) : null), [planner.profile.className]);
  const recordClass = record ? parseClassName(record.enrollment.className) : null;
  const suggestedClass = record && recordClass ? { className: formatClassName(recordClass), profile: record.suggestedProfile } : null;
  const categories = useMemo(() => [...new Set(courses.map(({ official }) => official.generalEducation).filter(Boolean))], [courses]);
  const gapCategories = useMemo(() => (record ? gapGeneralEducation(record.audit.gaps, categories) : []), [categories, record]);
  const current = TOOLS.find(({ id }) => id === tool)!;
  // 複製課號：自己的方案（自動備案不列，除非正在看它），預設主方案（易用性審查第 7 名：另存備案後不會不小心複製到備案）。
  const copyPlans = planner.planner.plans
    .filter(({ auto, id }) => !auto || id === planner.planner.activePlanId)
    .map((plan) => ({ id: plan.id, name: plan.name, entries: plan.items.flatMap((item) => {
      const course = planner.catalog.get(item.key);
      return course ? [{ course, item }] : [];
    }) }));
  const mainPlanId = planner.planner.plans.find(({ auto }) => !auto)?.id;

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
          {/* 2026-11-01 使用者決定：模擬課表在左邊當主畫面，一直看得到；右邊面板預設是搜課，圖示列切換其他工具。 */}
          <section aria-labelledby="timetable-title" className={`relief flex-col md:sticky md:top-20 md:h-[calc(100dvh-6rem)] ${mobileOnly(mobileView === 'timetable')}`}>
            <h2 id="timetable-title" className="flex items-center gap-2 px-5 pt-4 text-xl font-bold text-mist-ink">
              <CalendarDays className="size-5" aria-hidden="true" />模擬課表<span aria-hidden="true" className="h-5 w-0.5 rounded bg-mist-ink/50" />
            </h2>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {ready && (
                <ClassBar
                  courses={courses}
                  profile={planner.profile}
                  onProfile={planner.setProfile}
                  entries={planner.entries}
                  preferences={planner.planner.preferences}
                  suggested={suggestedClass}
                  inputRef={classRef}
                  onAddCourses={(keys, label) => {
                    if (keys.length === 1) addOne(keys[0]!);
                    // 只加課、不拿掉任何課：一筆可復原的修改，不另存自動備案（設計 6.1 的備份是給會替換課表的改動）。
                    else courseChange('add', keys.map((key) => ({ type: 'addToSchedule', key })), label, { autoBackup: false });
                  }}
                  onSearch={(text) => {
                    setQuery(text);
                    startSearch();
                  }}
                />
              )}
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
              {ready && (
                <FillPlanner
                  context={fillContext}
                  className={identityClass}
                  candidateKeys={planner.planner.candidates}
                  credits={planner.credits}
                  limits={limits}
                  catalog={planner.catalog}
                  onApply={applyFill}
                />
              )}
              <Timetable
                entries={planner.entries}
                conflicts={planner.conflicts}
                newKeys={planner.newKeys}
                onStartSearch={startSearch}
                onFindSlot={(day, period) => {
                  // 點到的空格延伸成整段連續空堂，只列完全排得進去的課。
                  const stretch = freeStretch(planner.entries, day, period);
                  setSlot((previous) => ({
                    day,
                    period,
                    nonce: (previous?.nonce ?? 0) + 1,
                    ...(stretch ? { start: stretch.start, end: stretch.end, codes: stretch.codes } : {}),
                  }));
                  showTool('search');
                  // 手機換到搜課頁時從頂端開始，先看到空堂和「通識／本系／全部」，不停在課表捲到的位置。
                  if (typeof matchMedia === 'function' && !matchMedia('(min-width: 768px)').matches) window.scrollTo?.({ top: 0 });
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
              {planner.entries.length > 0 && (
                <RulesPanel
                  conflicts={planner.conflicts}
                  reminders={reminders}
                  retakes={retakes}
                  fixFor={({ courseKeys }) => clashFixFor([courseKeys[1], courseKeys[0]])}
                />
              )}
            </div>
          </section>

          <section aria-labelledby="tool-title" className={`relief flex-col md:sticky md:top-20 md:h-[calc(100dvh-6rem)] ${mobileOnly(mobileView !== 'timetable')}`}>
            <h2 id="tool-title" className="flex items-center gap-2 px-5 pt-4 text-xl font-bold text-mist-ink">
              {current.icon}{current.label}<span aria-hidden="true" className="h-5 w-0.5 rounded bg-mist-ink/50" />
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* 每個工具都保持掛載、只隱藏沒選的：切換不會丟掉搜尋條件、AI 結果與輸入到一半的文字。 */}
              <div hidden={tool !== 'search'} className="flex h-full flex-col">
              {ready ? (
                <SearchPanel
                  courses={courses}
                  query={query}
                  onQuery={setQuery}
                  searchRef={searchRef}
                  scheduledKeys={scheduledKeys}
                  candidateKeys={candidateKeys}
                  onAdd={(course) => addOne(keyOf(course))}
                  onRemove={(course) => courseChange('remove', [{ type: 'removeFromSchedule', key: keyOf(course) }], `已移出「${course.title}」`)}
                  onCandidate={toggleCandidate}
                  clashesOf={clashesOf}
                  slot={slot}
                  {...(planner.profile.level ? { defaultDegree: planner.profile.level } : {})}
                  preferences={planner.planner.preferences}
                  {...(identityClass ? { identityDepartment: identityClass.department } : {})}
                  {...(gapCategories.length ? { priorityCategories: gapCategories } : {})}
                  {...(passedAs ? { passedAs } : {})}
                />
              ) : (
                <p className="p-4 text-sm text-base-content/80">{data.status === 'loading' ? '正在載入課程資料…' : '課程資料載入失敗。'}</p>
              )}
              </div>
              <div hidden={tool !== 'candidates'}>
                <CandidatesPanel
                  candidates={planner.planner.candidates}
                  catalog={planner.catalog}
                  scheduledKeys={scheduledKeys}
                  clashesOf={clashesOfCourse}
                  onAdd={addOne}
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
                  onRecord={importRecord}
                  allCourses={courses}
                />
              </div>
              <div hidden={tool !== 'data'}>
                {ready && (
                  <DataPanel
                    visible={tool === 'data'}
                    entries={planner.entries}
                    data={planner.data}
                    term={data.term}
                    onReplace={planner.replaceData}
                    onClear={() => {
                      planner.clearAll();
                      setRecord(null);
                      ai.removeKey();
                      buddyHub.setQuiet(false);
                      try { storageRef.current!.setItem(ORB_POSITION_KEY, ''); } catch { /* 擋住儲存時沒有東西要清 */ }
                      setOrbPosition(null);
                      setDismissedNudge('');
                      void clearBrowserCaches();
                      setGeneration((value) => value + 1);
                    }}
                    canRestoreImport={planner.canRestoreImport}
                    onRestoreImport={planner.restoreBeforeImport}
                    planName={planner.activePlan.name}
                    plans={copyPlans}
                    {...(mainPlanId ? { mainPlanId } : {})}
                    {...(planner.profile.className ? { className: planner.profile.className } : {})}
                    limits={limits}
                    onBackToTimetable={() => showTimetable()}
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
                      onRecord={importRecord}
                      candidateKeys={candidateKeys}
                      scheduledKeys={scheduledKeys}
                      profile={planner.profile}
                      credits={planner.credits}
                      onCandidate={(course) => courseChange('candidate', [{ type: 'addCandidate', key: keyOf(course) }], `已放進候選「${course.title}」`)}
                      onProfile={planner.setProfile}
                      fill={fillContext}
                      {...(identityClass ? { department: identityClass.department } : {})}
                      onAddGapCourses={(keys, label) => courseChange('add', keys.map((key): Change => ({ type: 'addToSchedule', key })), label, { autoBackup: false })}
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
      <UndoToast label={planner.undoLabel} onUndo={undoLast} onExpire={planner.clearUndo} action={toastAction} />
      <MobileNav view={mobileView} tools={tools} onMenu={setMenuOpen} onView={(next) => (next === 'timetable' ? showTimetable() : showTool(next))} />
      {aiEnabled && (
        <FloatingOrb
          open={aiOpen}
          onOpen={() => { setAiOpen(true); setDismissedNudge(conflictSignature); }}
          onClose={() => setAiOpen(false)}
          nudge={nudge}
          onDismissNudge={() => setDismissedNudge(conflictSignature)}
          onNudge={openClashingCourse}
          nudgeHidden={nudgeHidden}
          position={orbPosition}
          onPosition={moveOrb}
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
                    clashFix={conflictFix && {
                      ...conflictFix,
                      onClick: () => {
                        conflictFix.onClick();
                        // 手機上面板蓋住整個畫面：換完或要挑班時先收起來，看得到課表。
                        if (typeof matchMedia === 'function' && !matchMedia('(min-width: 768px)').matches) setAiOpen(false);
                      },
                    }}
                    onShowTimetable={() => {
                      showTimetable();
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
