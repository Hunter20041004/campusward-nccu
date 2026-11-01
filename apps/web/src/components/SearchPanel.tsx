import { candidateScheduleSummary, searchCourses, toScheduleCourse, type Course } from '@campusward/engine';
import { ChevronLeft, ChevronRight, Heart, Info, Minus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';
import { CourseDetails } from './CourseDetails.tsx';
import { CourseTags } from './CourseTags.tsx';
import { DAY_LABELS, DAYPARTS, formatCredits } from './labels.ts';

const PAGE_SIZES = [25, 50, 100];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// 桌機表格欄位：課程名稱／教師／課號／類型／時間地點／收藏與加入。
const COLUMNS = 'lg:grid-cols-[minmax(0,2fr)_minmax(4.5rem,0.9fr)_6.5rem_minmax(0,1fr)_minmax(0,1.5fr)_auto]';

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

export function SearchPanel({ courses, query, onQuery, searchRef, scheduledKeys, candidateKeys, onAdd, onRemove, onCandidate, passedAs }: SearchPanelProps) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayparts, setDayparts] = useState<string[]>([]);
  const [generalEducation, setGeneralEducation] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(courses.map(({ official }) => official.generalEducation).filter(Boolean))].sort(),
    [courses],
  );
  const filterCount = weekdays.length + dayparts.length + (generalEducation ? 1 : 0);
  const filtering = Boolean(query.trim() || filterCount);
  const results = useMemo(() => (filtering ? searchCourses(courses, {
    text: query,
    weekdays,
    periods: DAYPARTS.filter(({ id }) => dayparts.includes(id)).flatMap(({ periods }) => periods),
    ...(generalEducation ? { generalEducation: [generalEducation] } : {}),
  }) : []), [courses, dayparts, filtering, generalEducation, query, weekdays]);
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = results.slice(current * pageSize, (current + 1) * pageSize);

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
            <Chip key={id} pressed={dayparts.includes(id)} onClick={() => { setDayparts(toggle(dayparts, id)); resetPaging(); }}>{label}</Chip>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm font-bold">
            <span>通識類別</span>
            <select
              className="select select-sm min-h-11 w-auto"
              value={generalEducation}
              onChange={(event) => { setGeneralEducation(event.target.value); resetPaging(); }}
            >
              <option value="">全部</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="well flex min-h-48 flex-1 flex-col overflow-hidden rounded-2xl">
        {!filtering ? (
          <p className="p-4 text-sm text-base-content/80">輸入課名、教師或課號開始搜課；也可以只用星期、時段或通識類別篩選。</p>
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
                return (
                  <li key={key}>
                    {/* 左側色條：必修霧藍、其他米杏（與課表方塊同色）。 */}
                    <article className={`my-2 border-l-4 pl-3 ${course.official.requirementKind === '必修' ? 'border-primary' : 'border-secondary'}`}>
                      <div className={`grid gap-x-3 gap-y-1 lg:items-center ${COLUMNS}`}>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={detailsId}
                          onClick={() => setExpanded(open ? null : key)}
                          className="min-w-0 text-left"
                        >
                          <h3 className="truncate text-lg font-bold leading-snug">{course.title}</h3>
                          <span className="sr-only">{open ? '，收起詳細資料' : '，看詳細資料'}</span>
                        </button>
                        <span className="text-sm font-bold">{course.teacher || '教師未定'}</span>
                        <span className="tabular text-sm">{course.code}</span>
                        <span className="flex flex-wrap items-center gap-1 text-sm">
                          {course.official.requirementKind && <span>{course.official.requirementKind}</span>}
                          {passedAs?.(course) && <span className="chip" title={`你已通過「${passedAs(course)}」`}>已修過</span>}
                          <CourseTags course={course} />
                        </span>
                        <span className="text-sm">
                          {candidateScheduleSummary(toScheduleCourse(course), DAY_LABELS)}
                          <span className="block text-xs text-base-content/75">{[course.classroom, formatCredits(course.credits)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="flex items-center justify-end gap-1.5 lg:w-32">
                          {!scheduled && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2"
                              aria-label={`加入候選：${course.title}`}
                              aria-pressed={candidate}
                              title={candidate ? '已在候選' : '收藏到候選'}
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
                            <button type="button" className="btn btn-primary btn-sm min-h-11 gap-1" aria-label={`加入課表：${course.title}`} onClick={() => onAdd(course)}>
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
