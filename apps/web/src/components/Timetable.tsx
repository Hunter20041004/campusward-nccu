import {
  NCCU_PERIODS,
  buildScheduleAgenda,
  candidateScheduleSummary,
  formatClock,
  occupiedMeetings,
  periodsForRange,
  type Attendance,
  type Conflict,
  type Course,
  type PlanItemStatus,
  type ScheduleCourse,
  type ScheduleEntry,
} from '@campusward/engine';
import { ArrowLeftRight, CalendarDays, FileUp, LayoutGrid, Lock, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CourseDetails } from './CourseDetails.tsx';
import { DAY_LABELS } from './labels.ts';

export interface TimetableProps {
  entries: readonly ScheduleEntry[];
  conflicts: readonly Conflict[];
  /** 最近一次修改加入的課，標示「新」。 */
  newKeys: ReadonlySet<string>;
  onStartSearch: () => void;
  /** 點空格：找那一天、那一節的課。 */
  onFindSlot?: (day: number, period: string) => void;
  onImport: () => void;
  onToggleLock: (key: string) => void;
  onStatus: (key: string, status: PlanItemStatus) => void;
  onAttendance: (key: string, attendance: Attendance) => void;
  onRemove: (key: string) => void;
  /** 課表上的課在本學期快照裡的完整資料（老師、教室、課綱連結）；給了就在面板顯示。 */
  courseOf?: (key: string) => Course | undefined;
  /** 「換一班」：同課名、換了不會衝堂的其他班（App 用引擎 findOtherSections 算）。 */
  otherSections?: (key: string) => readonly ScheduleCourse[];
  onSwap?: (fromKey: string, toKey: string) => void;
  /** 打開或關掉某門課的面板：讓小山的提醒泡泡先讓開。 */
  onSelect?: (key: string | null) => void;
  /** 從外面打開某門課的面板（例如沒有金鑰時按小山的衝堂提醒）；nonce 變了就再打開一次。 */
  focus?: { key: string; nonce: number } | null;
}

const DAY_CHARS = ['', '一', '二', '三', '四', '五', '六', '日'];
const STATUS_LABELS: Record<PlanItemStatus, string> = { planned: '排入', registered: '已灌檔', enrolled: '已選上' };
const indexOf = (code: string) => NCCU_PERIODS.findIndex((period) => period.code === code);

/** 固定顯示 1–8 與 C、D；清晨 A、B 或晚上 E–H 有課才連續補上。 */
function visiblePeriods(entries: readonly ScheduleEntry[]): string[] {
  const used = entries.flatMap((entry) => occupiedMeetings(entry).flatMap((meeting) => periodsForRange(meeting.start, meeting.end))).map(({ code }) => indexOf(code));
  const first = Math.min(indexOf('1'), ...used);
  const last = Math.max(indexOf('8'), ...used);
  return NCCU_PERIODS.slice(first, last + 1).map(({ code }) => code);
}

interface Block {
  entry: ScheduleEntry;
  day: number;
  codes: string;
  rowStart: number;
  span: number;
  lane: number;
  lanes: number;
}

function layoutBlocks(entries: readonly ScheduleEntry[], periods: readonly string[]): Block[] {
  const blocks: Omit<Block, 'lane' | 'lanes'>[] = entries.flatMap((entry) => occupiedMeetings(entry).flatMap((meeting) => {
    const slots = periodsForRange(meeting.start, meeting.end).filter(({ code }) => periods.includes(code));
    if (!slots.length) return [];
    return [{ entry, day: meeting.day, codes: slots.map(({ code }) => code).join(''), rowStart: periods.indexOf(slots[0]!.code) + 2, span: slots.length }];
  }));
  // 同一天時間重疊的課並排顯示：貪婪分配欄位。
  return blocks.map((block) => {
    const overlapping = blocks.filter((other) => other.day === block.day && other.rowStart < block.rowStart + block.span && block.rowStart < other.rowStart + other.span);
    return { ...block, lane: overlapping.indexOf(block), lanes: overlapping.length };
  });
}

const sectionSchedule = (course: ScheduleCourse) => candidateScheduleSummary(course, DAY_LABELS);

function SwapSections({ entry, sections, onSwap, classroomOf }: { entry: ScheduleEntry; sections: readonly ScheduleCourse[]; onSwap: (fromKey: string, toKey: string) => void; classroomOf: (key: string) => string | undefined }) {
  return (
    <section aria-labelledby={`swap-${entry.course.key}`} className="space-y-1.5">
      <h4 id={`swap-${entry.course.key}`} className="flex items-center gap-1.5 text-sm font-bold">
        <ArrowLeftRight className="size-4 text-mist-ink" aria-hidden="true" />換一班
      </h4>
      {sections.length === 0 ? (
        <p className="text-sm text-base-content/80">沒有其他不衝堂的同名班。</p>
      ) : (
        <ul className="well divide-y divide-base-300 rounded-2xl px-3">
          {sections.map((section) => {
            const label = `${section.teacher ?? ''} ${sectionSchedule(section)}`.trim();
            return (
              <li key={section.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1 basis-40 text-sm">
                  <p className="font-bold">{section.teacher || '教師未定'}</p>
                  <p>
                    {candidateScheduleSummary(section, DAY_LABELS, undefined, { clock: true }).split('・').map((part) => {
                      const [codes, clock] = part.split('（');
                      return <span key={part} className="mr-2 inline-block">{codes}{clock && <span className="whitespace-nowrap">（{clock}</span>}</span>;
                    })}
                    <span className="inline-block text-xs text-base-content/75">{[classroomOf(section.key), section.code].filter(Boolean).join(' · ')}</span>
                  </p>
                </div>
                <button type="button" className="btn btn-sm min-h-11 gap-1" aria-label={`換這班：${label}`} onClick={() => onSwap(entry.course.key, section.key)}>
                  <ArrowLeftRight className="size-4" aria-hidden="true" />換這班
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CourseActions({ entry, details, sections, onSwap, courseOf, onToggleLock, onStatus, onAttendance, onRemove, onClose }: {
  entry: ScheduleEntry;
  details: Course | undefined;
  sections: readonly ScheduleCourse[] | undefined;
  onSwap: TimetableProps['onSwap'];
  courseOf: TimetableProps['courseOf'];
  onClose: () => void;
} & Pick<TimetableProps, 'onToggleLock' | 'onStatus' | 'onAttendance' | 'onRemove'>) {
  const { course, item } = entry;
  const ref = useRef<HTMLDivElement>(null);
  // 點課卡後把面板捲進畫面（手機底部有分頁列和小山，scroll-margin 留出它們的高度）。
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [course.key]);
  return (
    <div ref={ref} role="group" aria-label={`${course.title} 的操作`} className="raised mt-3 scroll-mt-24 scroll-mb-44 space-y-3 rounded-2xl px-4 py-3 md:scroll-mb-6">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 break-words pt-2 text-base font-bold leading-snug">{course.title}</h3>
        <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11" aria-label="關閉操作" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm min-h-11 gap-1" aria-pressed={item.locked} onClick={() => onToggleLock(course.key)}>
          <Lock className="size-4" aria-hidden="true" />
          {item.locked ? '解鎖' : '鎖定'}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <span>狀態</span>
          <select className="select select-sm min-h-11 w-auto" value={item.status} onChange={(event) => onStatus(course.key, event.target.value as PlanItemStatus)}>
            {(Object.keys(STATUS_LABELS) as PlanItemStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        {course.delivery.asyncAllowed && (
          <button type="button" className="btn btn-sm min-h-11" onClick={() => onAttendance(course.key, item.attendance === 'async' ? 'sync' : 'async')}>
            {item.attendance === 'async' ? '改為同步上課' : '改為非同步上課'}
          </button>
        )}
        {item.locked ? (
          <span className="text-sm text-base-content/80">已鎖定，解鎖後才能移出或換班</span>
        ) : (
          <button type="button" className="btn btn-danger btn-sm min-h-11" onClick={() => onRemove(course.key)}>移出課表</button>
        )}
      </div>
      {!item.locked && sections && onSwap && <SwapSections entry={entry} sections={sections} onSwap={onSwap} classroomOf={(key) => courseOf?.(key)?.classroom} />}
      {details && <CourseDetails course={details} id={`timetable-details-${course.key}`} withBasics />}
    </div>
  );
}

function EmptyState({ onStartSearch, onImport }: Pick<TimetableProps, 'onStartSearch' | 'onImport'>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div>
        <p className="text-lg font-semibold">還沒有排任何課</p>
        <p className="mt-1 max-w-[34ch] text-sm text-base-content/80">搜到想修的課就能加進課表，衝堂與選課規則會自動提醒。</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary min-h-11 gap-2" onClick={onStartSearch}>
          <Search className="size-4" aria-hidden="true" />
          從搜課開始
        </button>
        <button type="button" className="btn btn-ghost min-h-11 gap-2" onClick={onImport}>
          <FileUp className="size-4" aria-hidden="true" />
          匯入舊站資料
        </button>
      </div>
    </div>
  );
}

export function Timetable(props: TimetableProps) {
  const { entries, conflicts, newKeys } = props;
  const [selected, setSelectedState] = useState<string | null>(null);
  const { onSelect } = props;
  const setSelected = (key: string | null) => {
    setSelectedState(key);
    onSelect?.(key);
  };
  const focus = props.focus;
  useEffect(() => {
    if (!focus) return;
    setSelectedState(focus.key);
    onSelect?.(focus.key);
  }, [focus, onSelect]);
  // 面板關掉（例如課被移出、換班）時也告訴外層。
  const selectedEntry = entries.find(({ course }) => course.key === selected);
  useEffect(() => {
    if (selected && !selectedEntry) onSelect?.(null);
  }, [onSelect, selected, selectedEntry]);
  const [mobileMode, setMobileMode] = useState<'agenda' | 'grid'>('agenda');
  const periods = useMemo(() => visiblePeriods(entries), [entries]);
  const blocks = useMemo(() => layoutBlocks(entries, periods), [entries, periods]);
  const days = useMemo(() => {
    const used = new Set(blocks.map(({ day }) => day));
    return [1, 2, 3, 4, 5, ...[6, 7].filter((day) => used.has(day))];
  }, [blocks]);
  const conflicted = useMemo(() => new Set(conflicts.flatMap(({ courseKeys }) => courseKeys)), [conflicts]);
  const agenda = useMemo(() => buildScheduleAgenda(entries), [entries]);
  const unscheduled = entries.filter((entry) => occupiedMeetings(entry).length === 0);

  // 名稱由看得到的文字組成（WCAG 2.5.3），星期與衝堂、鎖定等狀態以只給螢幕閱讀器的文字接在後面。
  const blockExtra = (block: Block) => [
    DAY_LABELS[block.day],
    conflicted.has(block.entry.course.key) ? '衝堂' : '',
    block.entry.item.locked ? '已鎖定' : '',
  ].filter(Boolean).join('，');

  return (
    <section aria-labelledby="timetable-heading" className="flex flex-col">
      <div className="flex items-center gap-2">
        <h2 id="timetable-heading" className="sr-only">課表</h2>
        <span className="flex-1" />
        {entries.length > 0 && (
          <div className="well flex rounded-full p-1 md:hidden" role="group" aria-label="課表檢視">
            <button type="button" aria-pressed={mobileMode === 'agenda'} className={`flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold ${mobileMode === 'agenda' ? 'tab-selected text-mist-ink' : 'text-base-content/80'}`} onClick={() => setMobileMode('agenda')}>
              <CalendarDays className="size-4" aria-hidden="true" />行程
            </button>
            <button type="button" aria-pressed={mobileMode === 'grid'} className={`flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold ${mobileMode === 'grid' ? 'tab-selected text-mist-ink' : 'text-base-content/80'}`} onClick={() => setMobileMode('grid')}>
              <LayoutGrid className="size-4" aria-hidden="true" />方格
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? <EmptyState onStartSearch={props.onStartSearch} onImport={props.onImport} /> : (
        <>
          <div className={`${mobileMode === 'grid' ? '' : 'hidden md:block'} well mt-2 overflow-x-auto rounded-2xl p-2`}>
            <div
              role="group"
              aria-label="每週課表"
              className="grid min-w-[22rem] gap-px"
              style={{ gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${periods.length}, minmax(2.75rem, auto))` }}
            >
              {days.map((day, index) => (
                <div key={day} data-day-header className="py-1 text-center text-sm font-medium" style={{ gridColumnStart: index + 2, gridRowStart: 1 }}>{DAY_CHARS[day]}</div>
              ))}
              {periods.map((code, index) => {
                const period = NCCU_PERIODS[indexOf(code)]!;
                return (
                  <div key={code} data-period={code} className="flex flex-col items-center justify-center border-t border-base-300 text-xs" style={{ gridColumnStart: 1, gridRowStart: index + 2 }}>
                    <span className="font-semibold">{code}</span>
                    <span className="tabular text-[0.6875rem] text-base-content/70">{formatClock(period.start)}</span>
                  </div>
                );
              })}
              {/* 空格可以點：把那一天、那一節帶進搜課。不放進 Tab 順序（50 格太多），鍵盤改用多條件搜尋的星期與時段。 */}
              {periods.map((code, row) => days.map((day, column) => (
                props.onFindSlot ? (
                  <button
                    key={`${code}-${day}`}
                    type="button"
                    tabIndex={-1}
                    aria-label={`找${DAY_LABELS[day]} ${code} 節的課`}
                    title={`找${DAY_LABELS[day]} ${code} 節的課`}
                    className="cursor-pointer border-t border-base-300 bg-base-200/40 transition-colors duration-150 hover:bg-mint-wash"
                    style={{ gridColumnStart: column + 2, gridRowStart: row + 2 }}
                    onClick={() => props.onFindSlot?.(day, code)}
                  />
                ) : (
                  <div key={`${code}-${day}`} aria-hidden="true" className="border-t border-base-300 bg-base-200/40" style={{ gridColumnStart: column + 2, gridRowStart: row + 2 }} />
                )
              )))}
              {blocks.map((block) => {
                const { course, item } = block.entry;
                const isConflict = conflicted.has(course.key);
                const isSelected = selected === course.key;
                return (
                  <button
                    key={`${course.key}-${block.day}-${block.rowStart}`}
                    type="button"
                    aria-pressed={isSelected}
                    data-conflict={isConflict ? 'true' : undefined}
                    title={course.title}
                    onClick={() => setSelected(isSelected ? null : course.key)}
                    className={`relative z-10 m-0.5 flex flex-col items-start overflow-hidden rounded-lg px-1.5 py-1 text-left text-xs leading-tight transition-shadow duration-150 ${
                      isConflict ? 'course-conflict' : course.official?.requirementKind === '必修' ? 'course-mist' : 'course-apricot'
                    } ${isSelected ? 'ring-2 ring-mist-ink ring-offset-1' : ''}`}
                    style={{
                      gridColumnStart: days.indexOf(block.day) + 2,
                      gridRowStart: block.rowStart,
                      gridRowEnd: `span ${block.span}`,
                      width: `calc(${100 / block.lanes}% - 0.25rem)`,
                      marginLeft: `calc(${(100 / block.lanes) * block.lane}% + 0.125rem)`,
                    }}
                  >
                    {/* 並排（衝堂）時欄位很窄：課名照字換行、不截斷，才看得出是哪兩門。 */}
                    <span className={`font-medium ${block.lanes > 1 ? '[overflow-wrap:anywhere]' : 'line-clamp-2'}`}>{course.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="tabular">{block.codes}</span>
                      {newKeys.has(course.key) && <span className="rounded-full bg-base-100/90 px-1.5 font-bold text-mist-ink">新</span>}
                      {item.status !== 'planned' && <span className="rounded-full bg-base-100/90 px-1.5 font-bold text-secondary-content">{STATUS_LABELS[item.status]}</span>}
                      {item.locked && <Lock className="size-3" aria-hidden="true" />}
                    </span>
                    <span className="sr-only">，{blockExtra(block)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <ul aria-label="每日行程" className={`${mobileMode === 'agenda' ? '' : 'hidden'} space-y-3 p-4 md:hidden`}>
            {agenda.days.map(({ day, items }) => (
              <li key={day}>
                <h3 className="mb-1 text-sm font-semibold">{DAY_LABELS[day]}</h3>
                <ul className="space-y-1.5">
                  {items.map((agendaItem) => {
                    const isConflict = conflicted.has(agendaItem.courseKey);
                    return (
                      <li key={`${agendaItem.courseKey}-${agendaItem.start}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(agendaItem.courseKey)}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm ${isConflict ? 'course-conflict' : 'raised'}`}
                        >
                          <span className="tabular w-24 shrink-0 text-base-content/80">{formatClock(agendaItem.start)}–{formatClock(agendaItem.end)}</span>
                          <span className="flex-1 font-medium">{agendaItem.title}</span>
                          {isConflict && <span className="text-xs font-bold">衝堂</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {unscheduled.length > 0 && (
            <div className="border-t border-base-300 px-4 py-3">
              <h3 className="text-sm font-semibold">沒有固定時間</h3>
              <ul aria-label="沒有固定時間" className="mt-1.5 flex flex-wrap gap-2">
                {unscheduled.map(({ course, item }) => (
                  <li key={course.key}>
                    <button type="button" onClick={() => setSelected(course.key)} className="raised flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm">
                      <span className="font-medium">{course.title}</span>
                      <span className="text-base-content/75">{item.attendance === 'async' ? '非同步' : '時間未定'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedEntry && (
            <CourseActions
              key={selectedEntry.course.key}
              entry={selectedEntry}
              details={props.courseOf?.(selectedEntry.course.key)}
              courseOf={props.courseOf}
              sections={props.otherSections?.(selectedEntry.course.key)}
              onSwap={props.onSwap && ((from, to) => { props.onSwap?.(from, to); setSelected(to); })}
              onToggleLock={props.onToggleLock}
              onStatus={props.onStatus}
              onAttendance={props.onAttendance}
              onRemove={(key) => { props.onRemove(key); setSelected(null); }}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
