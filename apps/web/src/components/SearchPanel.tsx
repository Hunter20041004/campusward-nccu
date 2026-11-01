import {
  candidateScheduleSummary,
  formatTargetGroup,
  NCCU_PERIODS,
  offeringDepartments,
  parseTargetGroup,
  searchCourses,
  toScheduleCourse,
  type Course,
} from '@campusward/engine';
import { ChevronLeft, ChevronRight, Heart, Info, Minus, Plus, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { CourseDetails } from './CourseDetails.tsx';
import { CourseTags } from './CourseTags.tsx';
import { DAY_LABELS, DAYPARTS, formatCredits } from './labels.ts';

const PAGE_SIZES = [25, 50, 100];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// 桌機表格欄位：課程名稱／教師／課號／類型／時間地點／收藏與加入。課名欄放寬，課名可以換行。
const COLUMNS = 'lg:grid-cols-[minmax(0,2.4fr)_minmax(4rem,0.8fr)_5.5rem_minmax(0,1fr)_minmax(0,1.5fr)_auto]';
// 早八：清晨 A、B 與第 1 節（08:10）。
const EARLY_PERIODS = ['A', 'B', '1'];
const ALL_GENERAL_EDUCATION = '*';
const DEGREES = [
  { value: '', label: '全部' },
  { value: 'undergrad', label: '學士班' },
  { value: 'graduate', label: '碩博士班' },
] as const;
type Degree = '' | 'undergrad' | 'graduate';

const gradeLabel = (grade: string) => (/^[一二三四五六七1-7]$/.test(grade) ? `${grade}年級` : grade);
/** 修課限制的第一句（例「經濟系、地政系學生優先」）。 */
const firstSentence = (text: string) => text.split(/[。；;\n]/).map((part) => part.trim()).find(Boolean) ?? '';
const quoteTitles = (titles: readonly string[]) => titles.map((title) => `「${title}」`).join('、');

/** 課表空格帶過來的時段；nonce 每點一次就換，同一格再點也會重新帶入。 */
export interface SearchSlot {
  day: number;
  period: string;
  nonce: number;
}

export interface SearchPanelProps {
  courses: readonly Course[];
  query: string;
  onQuery?: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  scheduledKeys: ReadonlySet<string>;
  candidateKeys: ReadonlySet<string>;
  onAdd: (course: Course) => void;
  onRemove: (course: Course) => void;
  onCandidate: (course: Course) => void;
  /** 依全人系統資料：已通過同名或課號前六碼相同的課，回傳已通過的課名。 */
  passedAs?: (course: Course) => string | null;
  /** 這門課加進目前方案會和哪些已排的課衝堂（課名）；由 App 用引擎的衝堂判斷算。 */
  clashesOf?: (course: Course) => readonly string[];
  /** 學制預設值（條件裡填了學制就帶入）。 */
  defaultDegree?: 'undergrad' | 'graduate';
  /** 點課表空格帶入的星期與節次。 */
  slot?: SearchSlot | null;
}

function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`btn btn-sm min-h-11 min-w-11 px-3 ${pressed ? 'tab-selected text-mist-ink' : ''}`}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(values: T[], value: T) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

export function SearchPanel({ courses, query, onQuery, searchRef, scheduledKeys, candidateKeys, onAdd, onRemove, onCandidate, passedAs, clashesOf, defaultDegree, slot }: SearchPanelProps) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayparts, setDayparts] = useState<string[]>([]);
  const [slotPeriods, setSlotPeriods] = useState<string[]>([]);
  const [generalEducation, setGeneralEducation] = useState('');
  const [department, setDepartment] = useState('');
  const [grade, setGrade] = useState('');
  const [degree, setDegree] = useState<Degree>(defaultDegree ?? '');
  const [emi, setEmi] = useState(false);
  const [noEarly, setNoEarly] = useState(false);
  const [hideClashes, setHideClashes] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  // 條件裡改了學制就跟著換預設。
  useEffect(() => setDegree(defaultDegree ?? ''), [defaultDegree]);
  // 點課表空格：帶入那一天與那一節，打開多條件搜尋讓學生看得到條件。
  useEffect(() => {
    if (!slot) return;
    setWeekdays([slot.day]);
    setSlotPeriods([slot.period]);
    setDayparts([]);
    setFiltersOpen(true);
    setPage(0);
  }, [slot]);

  const categories = useMemo(
    () => [...new Set(courses.map(({ official }) => official.generalEducation).filter(Boolean))].sort(),
    [courses],
  );
  const departments = useMemo(
    () => offeringDepartments(courses).sort((first, second) => first.label.localeCompare(second.label, 'zh-Hant-TW')),
    [courses],
  );
  const departmentLabels = useMemo(() => new Map(departments.map(({ department: key, label }) => [key, label])), [departments]);
  const grades = departments.find(({ department: key }) => key === department)?.grades ?? [];
  const filterCount = weekdays.length + dayparts.length + slotPeriods.length
    + [generalEducation, department, degree, emi, noEarly, hideClashes].filter(Boolean).length;
  // 學制、排除早八、隱藏衝堂只是縮小範圍，單獨開著不列出全校的課。
  const filtering = Boolean(query.trim() || weekdays.length || dayparts.length || slotPeriods.length || generalEducation || department || emi);
  const results = useMemo(() => {
    if (!filtering) return [];
    const found = searchCourses(courses, {
      text: query,
      matchDetails: true,
      weekdays,
      periods: [...DAYPARTS.filter(({ id }) => dayparts.includes(id)).flatMap(({ periods }) => periods), ...slotPeriods],
      ...(generalEducation === ALL_GENERAL_EDUCATION ? { anyGeneralEducation: true } : generalEducation ? { generalEducation: [generalEducation] } : {}),
      ...(department ? { department, grade } : {}),
      ...(degree ? { degree } : {}),
      ...(emi ? { emi } : {}),
      ...(noEarly ? { excludePeriods: EARLY_PERIODS } : {}),
    });
    return hideClashes && clashesOf ? found.filter((course) => !clashesOf(course).length) : found;
  }, [clashesOf, courses, dayparts, degree, department, emi, filtering, generalEducation, grade, hideClashes, noEarly, query, slotPeriods, weekdays]);
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = results.slice(current * pageSize, (current + 1) * pageSize);

  /** 類型欄：「必修」寫出是哪個系的必修；開課班級不明就不寫。 */
  const requirementLabel = (course: Course) => {
    const kind = course.official.requirementKind;
    if (kind !== '必修') return kind;
    const owners = [...new Set(parseTargetGroup(course.official.targetGroup).map(({ department: key }) => departmentLabels.get(key) ?? key))];
    if (!owners.length) return '';
    return `${owners.slice(0, 2).join('・')}${owners.length > 2 ? '等' : ''} 必修`;
  };
  const offeringLine = (course: Course) => [formatTargetGroup(course.official.targetGroup), firstSentence(course.restrictionText)].filter(Boolean).join('・');

  const resetPaging = () => setPage(0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3 py-2 lg:py-6">
        {onQuery && (
          <label className="input flex h-12 min-w-0 flex-1 items-center gap-2 px-4 sm:max-w-md">
            <Search className="size-4 shrink-0 text-mist-ink" aria-hidden="true" />
            <span className="sr-only">搜課</span>
            <input
              ref={searchRef}
              type="search"
              className="min-w-0 grow"
              placeholder="課名、教師或課號"
              value={query}
              onChange={(event) => { onQuery(event.target.value); resetPaging(); }}
            />
          </label>
        )}
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="search-filters"
          className={`btn min-h-12 gap-1.5 px-5 ${filtersOpen ? 'tab-selected text-mist-ink' : ''}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          多條件搜尋{filterCount > 0 && <span className="chip ml-1">{filterCount}</span>}
        </button>
      </div>

      <fieldset id="search-filters" hidden={!filtersOpen} className="well space-y-2 rounded-2xl p-3">
        <legend className="sr-only">篩選</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="星期">
          {WEEKDAYS.map((day) => (
            <Chip key={day} label={DAY_LABELS[day]} pressed={weekdays.includes(day)} onClick={() => { setWeekdays(toggle(weekdays, day)); resetPaging(); }}>
              {DAY_LABELS[day]!.slice(1)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="時段">
          {DAYPARTS.map(({ id, label }) => (
            <Chip key={id} pressed={dayparts.includes(id)} onClick={() => { setDayparts(toggle(dayparts, id)); setSlotPeriods([]); resetPaging(); }}>{label}</Chip>
          ))}
          {slotPeriods.map((code) => (
            <button
              key={code}
              type="button"
              aria-label={`清除節次：${code} 節`}
              className="btn btn-sm tab-selected min-h-11 gap-1 px-3 text-mist-ink"
              onClick={() => { setSlotPeriods(slotPeriods.filter((item) => item !== code)); resetPaging(); }}
            >
              {code} 節<span className="tabular text-xs font-normal">（{NCCU_PERIODS.find((period) => period.code === code)?.time}）</span>
              <X className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm font-bold">
            <span>通識類別</span>
            <select
              className="select select-sm min-h-11 w-auto"
              value={generalEducation}
              onChange={(event) => { setGeneralEducation(event.target.value); resetPaging(); }}
            >
              <option value="">全部</option>
              <option value={ALL_GENERAL_EDUCATION}>所有通識</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <span>學制</span>
            <select
              className="select select-sm min-h-11 w-auto"
              value={degree}
              onChange={(event) => { setDegree(event.target.value as Degree); resetPaging(); }}
            >
              {DEGREES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="開課系級">
            <span className="text-sm font-bold">開課系級</span>
            <label className="min-w-0">
              <span className="sr-only">開課系所</span>
              <select
                className="select select-sm min-h-11 w-auto max-w-[13rem]"
                value={department}
                onChange={(event) => { setDepartment(event.target.value); setGrade(''); resetPaging(); }}
              >
                <option value="">全部系所</option>
                {departments.map(({ department: key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            {department && grades.length > 0 && (
              <label>
                <span className="sr-only">年級</span>
                <select
                  className="select select-sm min-h-11 w-auto"
                  value={grade}
                  onChange={(event) => { setGrade(event.target.value); resetPaging(); }}
                >
                  <option value="">全部年級</option>
                  {grades.map((value) => <option key={value} value={value}>{gradeLabel(value)}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="其他條件">
          <Chip pressed={emi} onClick={() => { setEmi(!emi); resetPaging(); }}>英語授課</Chip>
          <Chip pressed={noEarly} onClick={() => { setNoEarly(!noEarly); resetPaging(); }}>排除早八（A、B、1 節）</Chip>
          {clashesOf && <Chip pressed={hideClashes} onClick={() => { setHideClashes(!hideClashes); resetPaging(); }}>隱藏會衝堂的課</Chip>}
        </div>
      </fieldset>

      <div className="well flex min-h-48 flex-1 flex-col overflow-hidden rounded-2xl">
        {!filtering ? (
          <p className="p-4 text-sm text-base-content/80">輸入課名、教師或課號開始搜課，也可以打系所（例「經濟系」）；或只用星期、時段、通識類別、開課系級篩選。</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-base-content/80">沒有符合的課。試試別的關鍵字，或放寬星期與時段。</p>
        ) : (
          <>
            <p className="sr-only" aria-live="polite">找到 {results.length} 門</p>
            <div aria-hidden="true" className={`hidden gap-3 border-b border-base-300 px-4 py-2 text-xs font-bold text-base-content/70 lg:grid ${COLUMNS}`}>
              <span className="pl-2">課程名稱</span><span>教師</span><span>課程編號</span><span>類型</span><span>時間／地點</span><span className="w-32 text-right">收藏・加入</span>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-base-300 overflow-y-auto px-2">
              {shown.map((course) => {
                const key = toScheduleCourse(course).key;
                const scheduled = scheduledKeys.has(key);
                const candidate = candidateKeys.has(key);
                const open = expanded === key;
                const detailsId = `details-${key.replace(':', '-')}`;
                const clashes = scheduled ? [] : clashesOf?.(course) ?? [];
                const clashing = clashes.length > 0;
                const offering = offeringLine(course);
                const requirement = requirementLabel(course);
                return (
                  <li key={key}>
                    {/* 左側色條：必修霧藍、其他米杏（與課表方塊同色）；會衝堂的課改成珊瑚虛線並淡化。 */}
                    <article
                      data-clash={clashing ? 'true' : undefined}
                      className={`my-2 border-l-4 pl-3 ${clashing ? 'border-dashed border-coral-ink/50' : course.official.requirementKind === '必修' ? 'border-primary' : 'border-secondary'}`}
                    >
                      <div className={`grid gap-x-3 gap-y-1 lg:items-center ${COLUMNS}`}>
                        <div className="min-w-0">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={detailsId}
                            onClick={() => setExpanded(open ? null : key)}
                            className="flex min-h-11 w-full min-w-0 items-center text-left"
                          >
                            <h3 title={course.title} className={`break-words text-lg font-bold leading-snug ${clashing ? 'text-base-content/75' : ''}`}>{course.title}</h3>
                            <span className="sr-only">{open ? '，收起詳細資料' : '，看詳細資料'}</span>
                          </button>
                          {offering && <p title={offering} className="line-clamp-2 text-xs leading-snug text-base-content/75">{offering}</p>}
                          {clashing && (
                            <p className="mt-0.5 flex items-start gap-1 text-xs font-bold text-coral-ink">
                              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                              與{quoteTitles(clashes)}衝堂
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-bold">{course.teacher || '教師未定'}</span>
                        <span className="tabular text-sm">{course.code}</span>
                        <span className="flex flex-wrap items-center gap-1 text-sm">
                          {requirement && <span className="whitespace-nowrap">{requirement}</span>}
                          {passedAs?.(course) && <span className="chip" title={`你已通過「${passedAs(course)}」`}>已修過</span>}
                          <CourseTags course={course} />
                        </span>
                        <span className="text-sm">
                          {/* 每段時間一行；時刻不和節次拆開，窄欄位時整段括號換到下一行。 */}
                          {candidateScheduleSummary(toScheduleCourse(course), DAY_LABELS, undefined, { clock: true }).split('・').map((part) => {
                            const [codes, clock] = part.split('（');
                            return <span key={part} className="block">{codes}{clock && <span className="whitespace-nowrap">（{clock}</span>}</span>;
                          })}
                          <span className="block text-xs text-base-content/75">{[course.classroom, formatCredits(course.credits)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="flex items-center justify-end gap-1.5 lg:w-32">
                          {!scheduled && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2"
                              aria-label={`加入候選：${course.title}`}
                              aria-pressed={candidate}
                              title={candidate ? '已在候選，再按一次移出' : '收藏到候選'}
                              onClick={() => onCandidate(course)}
                            >
                              <Heart className={`size-5 ${candidate ? 'fill-coral-ink text-coral-ink' : 'text-base-content/60'}`} aria-hidden="true" />
                            </button>
                          )}
                          {scheduled ? (
                            <button type="button" className="btn btn-sm min-h-11 gap-1" aria-label={`移出課表：${course.title}`} onClick={() => onRemove(course)}>
                              <Minus className="size-4" aria-hidden="true" />
                              移出
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`btn btn-sm min-h-11 gap-1 ${clashing ? '' : 'btn-primary'}`}
                              aria-label={`加入課表：${course.title}`}
                              title={clashing ? `會與${quoteTitles(clashes)}衝堂` : undefined}
                              onClick={() => onAdd(course)}
                            >
                              <Plus className="size-4" aria-hidden="true" />
                              加入
                            </button>
                          )}
                        </span>
                      </div>
                      {open && <CourseDetails course={course} id={detailsId} />}
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-base-300 px-4 py-2 text-sm">
          <Info className="size-4 shrink-0 text-base-content/70" aria-hidden="true" />
          <span className="flex-1 text-xs text-base-content/80">本工具僅供排課使用，課程疑義請洽教務處或開課單位，選課結果以學校系統為準。</span>
          {results.length > 0 && (
            <nav aria-label="搜尋結果分頁" className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <select aria-label="每頁筆數" className="select select-sm min-h-11 w-24" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPaging(); }}>
                  {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                每頁
              </label>
              <span className="tabular text-xs">{current * pageSize + 1}–{Math.min(results.length, (current + 1) * pageSize)} / {results.length}</span>
              <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="上一頁" disabled={current === 0} onClick={() => setPage(current - 1)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="下一頁" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
