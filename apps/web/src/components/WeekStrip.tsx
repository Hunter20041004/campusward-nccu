import { NCCU_PERIODS, occupiedMeetings, periodsForRange, totalCredits, type Conflict, type ScheduleEntry } from '@campusward/engine';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

export interface WeekStripProps {
  entries: readonly ScheduleEntry[];
  conflicts: readonly Conflict[];
  /** 最近一次修改加入的課：那幾格亮起來。 */
  newKeys: ReadonlySet<string>;
  /** 點週條：切到完整課表。 */
  onOpen: () => void;
}

type CellState = 'free' | 'busy' | 'new' | 'clash';
const DAY_CHARS = ['', '一', '二', '三', '四', '五', '六', '日'];
const STATE_CLASS: Record<CellState, string> = {
  free: 'bg-base-300/80',
  busy: 'bg-primary',
  new: 'bg-accent ring-1 ring-mist-ink',
  clash: 'bg-error',
};
const indexOf = (code: string) => NCCU_PERIODS.findIndex((period) => period.code === code);

/**
 * 手機搜課頁頂端的迷你週條（2026-11-01 易用性審查第 8 名）：一列高，每天一小段、每節一格；
 * 有課的格子霧藍、剛加的薄荷、兩門課同一節的珊瑚。不用切到課表分頁就知道加了之後有沒有衝堂。
 */
export function WeekStrip({ entries, conflicts, newKeys, onOpen }: WeekStripProps) {
  const { days, periods, cells } = useMemo(() => {
    const occupied = new Map<string, string[]>();
    entries.forEach((entry) => occupiedMeetings(entry).forEach((meeting) => {
      periodsForRange(meeting.start, meeting.end).forEach(({ code }) => {
        const id = `${meeting.day}-${code}`;
        occupied.set(id, [...(occupied.get(id) ?? []), entry.course.key]);
      });
    }));
    // 和課表方格一樣：固定 1–8 節（含 C、D），清晨或晚上有課才補上。
    const used = [...occupied.keys()].map((id) => indexOf(id.split('-')[1]!));
    const first = Math.min(indexOf('1'), ...used);
    const last = Math.max(indexOf('8'), ...used);
    const usedDays = new Set([...occupied.keys()].map((id) => Number(id.split('-')[0])));
    const state = (id: string): CellState => {
      const keys = occupied.get(id) ?? [];
      if (keys.length > 1) return 'clash';
      if (!keys.length) return 'free';
      return newKeys.has(keys[0]!) ? 'new' : 'busy';
    };
    return {
      days: [1, 2, 3, 4, 5, ...[6, 7].filter((day) => usedDays.has(day))],
      periods: NCCU_PERIODS.slice(first, last + 1).map(({ code }) => code),
      cells: state,
    };
  }, [entries, newKeys]);
  const credits = totalCredits(entries);
  const summary = entries.length
    ? `課表週覽：${entries.length} 門、${credits} 學分${conflicts.length ? `、${conflicts.length} 個衝堂` : ''}`
    : '課表週覽：還沒有排課';
  return (
    <button type="button" onClick={onOpen} className="well flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 py-1.5 text-left">
      <span className="sr-only">{summary}，看完整課表</span>
      <span aria-hidden="true" className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => (
          <span key={day} data-strip-day={day} className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="text-[0.6875rem] leading-none text-base-content/75">{DAY_CHARS[day]}</span>
            <span className="flex w-full gap-px">
              {periods.map((code) => {
                const value = cells(`${day}-${code}`);
                return <span key={code} data-cell={`${day}-${code}`} data-state={value} className={`h-2.5 min-w-0 flex-1 rounded-[2px] transition-colors duration-200 ${STATE_CLASS[value]}`} />;
              })}
            </span>
          </span>
        ))}
      </span>
      <span className="flex shrink-0 flex-col items-end text-xs leading-tight">
        <span className="tabular font-semibold">{credits} 學分</span>
        {conflicts.length > 0 && <span className="tabular font-bold text-coral-ink">衝堂 {conflicts.length}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-base-content/60" aria-hidden="true" />
    </button>
  );
}
