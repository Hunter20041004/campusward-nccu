export interface Period {
  code: string;
  start: number;
  end: number;
  time: string;
  special: boolean;
}

/** 一週中的某段上課時間；分鐘自午夜起算，day 1＝週一、7＝週日。 */
export interface Meeting {
  day: number;
  start: number;
  end: number;
  label: string;
}

export function toMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

const period = (code: string, start: string, end: string, special = false): Period => ({
  code,
  start: toMinutes(start),
  end: toMinutes(end),
  time: `${start}–${end}`,
  special,
});

export const NCCU_PERIODS: readonly Period[] = Object.freeze([
  period('A', '06:10', '07:00', true),
  period('B', '07:10', '08:00', true),
  period('1', '08:10', '09:00'),
  period('2', '09:10', '10:00'),
  period('3', '10:10', '11:00'),
  period('4', '11:10', '12:00'),
  period('C', '12:10', '13:00'),
  period('D', '13:10', '14:00'),
  period('5', '14:10', '15:00'),
  period('6', '15:10', '16:00'),
  period('7', '16:10', '17:00'),
  period('8', '17:10', '18:00'),
  period('E', '18:10', '19:00'),
  period('F', '19:10', '20:00'),
  period('G', '20:10', '21:00'),
  period('H', '21:10', '22:00', true),
]);

const DAY_CHARS = '一二三四五六日';

export function periodsForRange(start: number, end: number): Period[] {
  return NCCU_PERIODS.filter((slot) => start < slot.end && slot.start < end);
}

export function formatNccuSchedule(schedule: Omit<Meeting, 'label'> & { label?: string } | null, labels: readonly string[]): string {
  if (!schedule) return '時間未定';
  const codes = periodsForRange(schedule.start, schedule.end).map(({ code }) => code).join('');
  return codes ? `${labels[schedule.day] ?? ''} ${codes}` : (schedule.label ?? '');
}

export function gridPlacement(schedule: Pick<Meeting, 'start' | 'end'> & Partial<Meeting>): { rowStart: number; rowSpan: number; codes: string } | null {
  const slots = periodsForRange(schedule.start, schedule.end);
  const first = slots[0];
  const last = slots.at(-1);
  if (!first || !last) return null;
  const firstIndex = NCCU_PERIODS.indexOf(first);
  return {
    rowStart: firstIndex + 2,
    rowSpan: NCCU_PERIODS.indexOf(last) - firstIndex + 1,
    codes: slots.map(({ code }) => code).join(''),
  };
}

/** 解析官方節次文字（例「四D56」「一34日EF」）。移植自舊 meetingsFromNccuText。 */
export function parseMeetings(scheduleText: string): Meeting[] {
  const meetings: Meeting[] = [];
  for (const match of String(scheduleText || '').matchAll(/([一二三四五六日])([ABCD12345678EFGH]+)/g)) {
    const [, dayChar = '', codes = ''] = match;
    const slots = [...codes]
      .map((code) => NCCU_PERIODS.find((slot) => slot.code === code))
      .filter((slot): slot is Period => Boolean(slot));
    if (!slots.length) continue;
    meetings.push({
      day: DAY_CHARS.indexOf(dayChar) + 1,
      start: Math.min(...slots.map((slot) => slot.start)),
      end: Math.max(...slots.map((slot) => slot.end)),
      label: `${dayChar}${codes}`,
    });
  }
  return meetings;
}

export function formatMeetings(meetings: readonly Meeting[]): string {
  return meetings
    .map((meeting) => {
      const codes = periodsForRange(meeting.start, meeting.end).map(({ code }) => code).join('');
      return codes ? `${DAY_CHARS[meeting.day - 1] ?? ''}${codes}` : '';
    })
    .join('');
}
