// 實習空檔：自動找空檔（auto）或檢查學生固定的實習時段（fixed）。移植自舊 internship-planner。
// 實習設定屬於偏好，AI 可以調整；身分條件則不行（見 eligibility）。

import { toMinutes } from './periods.ts';
import { occupiedMeetings, type ScheduleEntry } from './schedule/selection.ts';

export type InternshipWindowMode = 'full' | 'morning' | 'afternoon';

export interface InternshipSettings {
  targetDays: number;
  start: string;
  end: string;
  mode: 'auto' | 'fixed';
  /** 星期（1–5）→ 固定實習時段；mode 為 fixed 時使用。 */
  fixedDays: Readonly<Record<number, InternshipWindowMode | 'none'>>;
}

export interface InternshipWindow {
  day: number;
  start: number;
  end: number;
  mode: InternshipWindowMode;
  value: 0.5 | 1;
}

export interface InternshipConflict {
  courseKey: string;
  courseTitle: string;
  window: InternshipWindow;
}

export interface InternshipPlan {
  availableDays: number;
  suggestedWindows: InternshipWindow[];
  displayWindows: InternshipWindow[];
  conflicts: InternshipConflict[];
  /** 有實體課時間未定時，空檔只能算「待確認」。 */
  tentative: boolean;
  confirmedDays: number;
  pendingDays: number;
  meetsTarget: boolean;
}

export const DEFAULT_INTERNSHIP_SETTINGS: InternshipSettings = Object.freeze({
  targetDays: 2.5,
  start: '09:00',
  end: '18:00',
  mode: 'auto',
  fixedDays: Object.freeze({}),
});

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validateInternshipSettings(settings: unknown): { field: 'end' | 'target'; message: string } | null {
  const candidate = (settings ?? {}) as { start?: unknown; end?: unknown; targetDays?: unknown };
  const validTime = (value: unknown): value is string => typeof value === 'string' && CLOCK.test(value);
  if (
    !settings || typeof settings !== 'object'
    || !validTime(candidate.start) || !validTime(candidate.end)
    || toMinutes(candidate.end) - toMinutes(candidate.start) < 120
  ) {
    return { field: 'end', message: '實習結束時間必須晚於開始時間，且每日時段至少兩小時。' };
  }
  const targetDays = Number(candidate.targetDays);
  const hasValidTarget = String(candidate.targetDays ?? '').trim()
    && Number.isFinite(targetDays)
    && targetDays >= 0
    && targetDays <= 5
    && Number.isInteger(targetDays * 2);
  if (!hasValidTarget) return { field: 'target', message: '每週實習目標必須是 0 到 5 天，並以半天為單位。' };
  return null;
}

const overlaps = (first: { start: number; end: number }, second: { start: number; end: number }) => (
  first.start < second.end && second.start < first.end
);

function dayWindows(settings: InternshipSettings, day: number): Record<InternshipWindowMode, InternshipWindow> {
  const start = toMinutes(settings.start);
  const end = toMinutes(settings.end);
  const midpoint = start + (end - start) / 2;
  return {
    full: { day, start, end, mode: 'full', value: 1 },
    morning: { day, start, end: midpoint - 30, mode: 'morning', value: 0.5 },
    afternoon: { day, start: midpoint + 30, end, mode: 'afternoon', value: 0.5 },
  };
}

function conflictsForWindow(entries: readonly ScheduleEntry[], window: InternshipWindow): InternshipConflict[] {
  return entries.flatMap((entry) => occupiedMeetings(entry)
    .filter((meeting) => meeting.day === window.day && overlaps(meeting, window))
    .map(() => ({ courseKey: entry.course.key, courseTitle: entry.course.title, window })));
}

function automaticCandidates(entries: readonly ScheduleEntry[], settings: InternshipSettings) {
  const full: InternshipWindow[] = [];
  const half: InternshipWindow[] = [];
  let availableDays = 0;
  for (let day = 1; day <= 5; day += 1) {
    const windows = dayWindows(settings, day);
    if (!conflictsForWindow(entries, windows.full).length) {
      full.push(windows.full);
      availableDays += 1;
      continue;
    }
    (['morning', 'afternoon'] as const).forEach((mode) => {
      if (!conflictsForWindow(entries, windows[mode]).length) {
        half.push(windows[mode]);
        availableDays += 0.5;
      }
    });
  }
  return { availableDays, candidates: [...full, ...half] };
}

function internshipCertainty(entries: readonly ScheduleEntry[], availableDays: number) {
  const tentative = entries.some((entry) => entry.item.attendance !== 'async' && !entry.course.meetings.length);
  return {
    tentative,
    confirmedDays: tentative ? 0 : availableDays,
    pendingDays: tentative ? availableDays : 0,
  };
}

export function calculateInternshipPlan(
  entries: readonly ScheduleEntry[],
  settings: InternshipSettings = DEFAULT_INTERNSHIP_SETTINGS,
): InternshipPlan {
  if (settings.mode === 'fixed') {
    const displayWindows = Object.entries(settings.fixedDays)
      .filter((pair): pair is [string, InternshipWindowMode] => Boolean(pair[1]) && pair[1] !== 'none')
      .map(([day, mode]) => dayWindows(settings, Number(day))[mode]);
    const conflicts = displayWindows.flatMap((window) => conflictsForWindow(entries, window));
    const conflictingWindows = new Set(conflicts.map(({ window }) => window));
    const availableDays = displayWindows.reduce((total, window) => total + (conflictingWindows.has(window) ? 0 : window.value), 0);
    const certainty = internshipCertainty(entries, availableDays);
    return {
      availableDays,
      suggestedWindows: [],
      displayWindows,
      conflicts,
      ...certainty,
      meetsTarget: certainty.confirmedDays >= settings.targetDays,
    };
  }
  const { availableDays, candidates } = automaticCandidates(entries, settings);
  let planned = 0;
  const suggestedWindows = candidates.filter((window) => {
    if (planned >= settings.targetDays) return false;
    planned += window.value;
    return true;
  });
  const certainty = internshipCertainty(entries, availableDays);
  return {
    availableDays,
    suggestedWindows,
    displayWindows: suggestedWindows,
    conflicts: [],
    ...certainty,
    meetsTarget: certainty.confirmedDays >= settings.targetDays,
  };
}
