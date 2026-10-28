// 手機行程檢視：依星期分組、由早到晚排序；沒有每週時段的課放「彈性」區。移植自舊 schedule-agenda。

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
