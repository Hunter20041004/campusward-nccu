// 手機行程檢視：依星期分組、由早到晚排序；沒有每週時段的課放「彈性」區。移植自舊 schedule-agenda。

import { NCCU_PERIODS, periodsForRange } from '../periods.ts';
import { occupiedMeetings, type ScheduleEntry } from './selection.ts';

export interface AgendaItem {
  courseKey: string;
  title: string;
  start: number;
  end: number;
  label: string;
}

export interface Agenda {
  days: { day: number; items: AgendaItem[] }[];
  flexible: { courseKey: string; title: string; reason: '非同步' | '時間未定' }[];
}

export function buildScheduleAgenda(entries: readonly ScheduleEntry[]): Agenda {
  const byDay = new Map<number, AgendaItem[]>();
  const flexible: Agenda['flexible'] = [];
  entries.forEach((entry) => {
    const meetings = occupiedMeetings(entry);
    if (!meetings.length) {
      flexible.push({
        courseKey: entry.course.key,
        title: entry.course.title,
        reason: entry.item.attendance === 'async' ? '非同步' : '時間未定',
      });
      return;
    }
    meetings.forEach((meeting) => {
      const items = byDay.get(meeting.day) ?? [];
      items.push({ courseKey: entry.course.key, title: entry.course.title, start: meeting.start, end: meeting.end, label: meeting.label });
      byDay.set(meeting.day, items);
    });
  });
  return {
    days: [...byDay.entries()]
      .sort(([first], [second]) => first - second)
      .map(([day, items]) => ({ day, items: items.sort((a, b) => a.start - b.start || a.end - b.end) })),
    flexible,
  };
}

export interface AgendaFreeStretch {
  day: number;
  start: number;
  end: number;
  codes: string[];
  /** 這天在白天（1–8 節）完全沒課。 */
  wholeDay: boolean;
}

/** 行程檢視列空檔的範圍：白天 1–8 節（含中午 C、D）；清晨與晚上不主動列。 */
const DAYTIME = NCCU_PERIODS.slice(NCCU_PERIODS.findIndex(({ code }) => code === '1'), NCCU_PERIODS.findIndex(({ code }) => code === '8') + 1);

/**
 * 手機行程檢視的空檔（2026-11-01 易用性審查第 8 名）：每天白天連續至少 minPeriods 節沒課的時段，
 * 每段一顆「找課」，不用切到方格。非同步上課、時間未定的課不佔時間；skipDays（偏好的空堂日）不列。
 */
export function agendaFreeStretches(
  entries: readonly ScheduleEntry[],
  { days = [1, 2, 3, 4, 5], skipDays = [], minPeriods = 2 }: { days?: readonly number[]; skipDays?: readonly number[]; minPeriods?: number } = {},
): AgendaFreeStretch[] {
  const busy = new Set(entries.flatMap((entry) => occupiedMeetings(entry)
    .flatMap((meeting) => periodsForRange(meeting.start, meeting.end).map(({ code }) => `${meeting.day}:${code}`))));
  return days.filter((day) => !skipDays.includes(day)).flatMap((day) => {
    const runs: (typeof DAYTIME[number])[][] = [];
    let run: (typeof DAYTIME[number])[] = [];
    DAYTIME.forEach((period) => {
      if (busy.has(`${day}:${period.code}`)) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(period);
    });
    if (run.length) runs.push(run);
    return runs.filter((periods) => periods.length >= minPeriods).map((periods) => ({
      day,
      start: periods[0]!.start,
      end: periods.at(-1)!.end,
      codes: periods.map(({ code }) => code),
      wholeDay: periods.length === DAYTIME.length,
    }));
  });
}
