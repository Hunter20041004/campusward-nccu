import {
  NCCU_PERIODS,
  buildScheduleAgenda,
  occupiedMeetings,
  periodsForRange,
  type Attendance,
  type Conflict,
  type PlanItemStatus,
  type ScheduleEntry,
} from '@campusward/engine';
import { CalendarDays, FileUp, LayoutGrid, Lock, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DAY_LABELS } from './labels.ts';

export interface TimetableProps {
  entries: readonly ScheduleEntry[];
  conflicts: readonly Conflict[];
  /** 最近一次修改加入的課，標示「新」。 */
  newKeys: ReadonlySet<string>;
  onStartSearch: () => void;
  onImport: () => void;
  onToggleLock: (key: string) => void;
  onStatus: (key: string, status: PlanItemStatus) => void;
  onAttendance: (key: string, attendance: Attendance) => void;
  onRemove: (key: string) => void;
}

const DAY_CHARS = ['', '一', '二', '三', '四', '五', '六', '日'];
const STATUS_LABELS: Record<PlanItemStatus, string> = { planned: '排入', registered: '已灌檔', enrolled: '已選上' };
const indexOf = (code: string) => NCCU_PERIODS.findIndex((period) => period.code === code);
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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

function CourseActions({ entry, onToggleLock, onStatus, onAttendance, onRemove, onClose }: {
  entry: ScheduleEntry;
  onClose: () => void;
} & Pick<TimetableProps, 'onToggleLock' | 'onStatus' | 'onAttendance' | 'onRemove'>) {
  const { course, item } = entry;
  return (
    <div role="group" aria-label={`${course.title} 的操作`} className="flex flex-wrap items-center gap-2 border-t border-base-300 px-4 py-3">
      <p className="w-full text-sm font-medium sm:w-auto sm:flex-1">{course.title}</p>
      <button type="button" className="btn btn-sm min-h-11 gap-1 border border-base-300 bg-base-100" aria-pressed={item.locked} onClick={() => onToggleLock(course.key)}>
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
        <button type="button" className="btn btn-sm min-h-11 border border-base-300 bg-base-100" onClick={() => onAttendance(course.key, item.attendance === 'async' ? 'sync' : 'async')}>
          {item.attendance === 'async' ? '改為同步上課' : '改為非同步上課'}
        </button>
      )}
      {item.locked ? (
        <span className="text-sm text-base-content/80">已鎖定，解鎖後才能移出</span>
      ) : (
        <button type="button" className="btn btn-sm min-h-11 border border-coral-ink/50 bg-base-100 text-coral-ink" onClick={() => onRemove(course.key)}>移出課表</button>
      )}
      <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11" aria-label="關閉操作" onClick={onClose}>
        <X className="size-4" aria-hidden="true" />
      </button>
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
        <button type="button" className="btn btn-ghost min-h-11 gap-2 border border-base-300" onClick={onImport}>
          <FileUp className="size-4" aria-hidden="true" />
          匯入舊站資料
        </button>
      </div>
    </div>
  );
}

export function Timetable(props: TimetableProps) {
  const { entries, conflicts, newKeys } = props;
  const [selected, setSelected] = useState<string | null>(null);
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
  const selectedEntry = entries.find(({ course }) => course.key === selected);

  // 名稱由看得到的文字組成（WCAG 2.5.3），星期與衝堂、鎖定等狀態以只給螢幕閱讀器的文字接在後面。
  const blockExtra = (block: Block) => [
    DAY_LABELS[block.day],
    conflicted.has(block.entry.course.key) ? '衝堂' : '',
    block.entry.item.locked ? '已鎖定' : '',
  ].filter(Boolean).join('，');

  return (
    <section aria-labelledby="timetable-heading" className="relief flex flex-col rounded-box md:min-h-[28rem]">
      <div className="flex items-center gap-2 border-b border-base-300 px-4 py-2">
        <h2 id="timetable-heading" className="flex-1 py-1 text-base font-semibold">課表</h2>
        {entries.length > 0 && (
          <div className="flex rounded-field border border-base-300 md:hidden" role="group" aria-label="課表檢視">
            <button type="button" aria-pressed={mobileMode === 'agenda'} className={`flex min-h-11 items-center gap-1 rounded-l-field px-3 text-sm ${mobileMode === 'agenda' ? 'bg-primary/15 text-mist-ink' : ''}`} onClick={() => setMobileMode('agenda')}>
              <CalendarDays className="size-4" aria-hidden="true" />行程
            </button>
            <button type="button" aria-pressed={mobileMode === 'grid'} className={`flex min-h-11 items-center gap-1 rounded-r-field px-3 text-sm ${mobileMode === 'grid' ? 'bg-primary/15 text-mist-ink' : ''}`} onClick={() => setMobileMode('grid')}>
              <LayoutGrid className="size-4" aria-hidden="true" />方格
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? <EmptyState onStartSearch={props.onStartSearch} onImport={props.onImport} /> : (
        <>
          <div className={`${mobileMode === 'grid' ? '' : 'hidden md:block'} overflow-x-auto p-3`}>
            <div
              role="group"
              aria-label="每週課表"
              className="grid min-w-[34rem] gap-px"
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
                    <span className="tabular text-[0.6875rem] text-base-content/70">{clock(period.start)}</span>
                  </div>
                );
              })}
              {periods.map((code, row) => days.map((day, column) => (
                <div key={`${code}-${day}`} aria-hidden="true" className="border-t border-base-300 bg-base-200/40" style={{ gridColumnStart: column + 2, gridRowStart: row + 2 }} />
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
                    onClick={() => setSelected(isSelected ? null : course.key)}
                    className={`relative z-10 m-0.5 flex flex-col items-start overflow-hidden rounded-field border px-1.5 py-1 text-left text-xs leading-tight transition-shadow duration-150 ${
                      isConflict ? 'border-coral-ink/60 bg-error/15 text-coral-ink' : 'border-primary/50 bg-primary/15 text-mist-ink'
                    } ${isSelected ? 'ring-2 ring-mist-ink' : ''}`}
                    style={{
                      gridColumnStart: days.indexOf(block.day) + 2,
                      gridRowStart: block.rowStart,
                      gridRowEnd: `span ${block.span}`,
                      width: `calc(${100 / block.lanes}% - 0.25rem)`,
                      marginLeft: `calc(${(100 / block.lanes) * block.lane}% + 0.125rem)`,
                    }}
                  >
                    <span className="line-clamp-2 font-medium">{course.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="tabular">{block.codes}</span>
                      {newKeys.has(course.key) && <span className="rounded-selector bg-mint-wash px-1 font-semibold text-accent-content">新</span>}
                      {item.status !== 'planned' && <span className="rounded-selector bg-secondary px-1 text-secondary-content">{STATUS_LABELS[item.status]}</span>}
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
                          className={`flex min-h-11 w-full items-center gap-3 rounded-field border px-3 py-2 text-left text-sm ${isConflict ? 'border-coral-ink/60 bg-error/10' : 'border-base-300 bg-base-100'}`}
                        >
                          <span className="tabular w-24 shrink-0 text-base-content/80">{clock(agendaItem.start)}–{clock(agendaItem.end)}</span>
                          <span className="flex-1 font-medium">{agendaItem.title}</span>
                          {isConflict && <span className="text-xs font-medium text-coral-ink">衝堂</span>}
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
                    <button type="button" onClick={() => setSelected(course.key)} className="flex min-h-11 items-center gap-2 rounded-field border border-base-300 bg-base-100 px-3 text-sm">
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
              entry={selectedEntry}
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
