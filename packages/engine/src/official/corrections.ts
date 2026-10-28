import { z } from 'zod';
import type { Course } from './course.ts';

// 人工時段更正：官方節次與課綱不符時（例如 TAICA 非同步課），以人工核對結果覆寫。鍵為「學期:課號」。

const MeetingSchema = z.object({
  day: z.number().int().min(1).max(7),
  start: z.number().int().min(0).max(1440),
  end: z.number().int().min(0).max(1440),
  label: z.string().max(200),
}).strict();

const EventSchema = z.object({
  label: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  week: z.number().int().min(1).max(20).optional(),
  day: z.number().int().min(1).max(7).optional(),
  start: z.number().int().min(0).max(1440).optional(),
  end: z.number().int().min(0).max(1440).optional(),
}).strict();

const CorrectionSchema = z.object({
  correctionId: z.string().min(1).max(100),
  deliveryMode: z.enum(['asynchronous', 'asynchronous-optional']),
  meetings: z.array(MeetingSchema),
  events: z.array(EventSchema).optional(),
  deliveryNote: z.string().max(500).optional(),
  informationNotes: z.array(z.string().max(500)).optional(),
}).strict();

const TableSchema = z.object({
  source: z.string().optional(),
  corrections: z.record(z.string().regex(/^\d{4}:[0-9A-Z]{9}$/), CorrectionSchema),
}).strict();

export type Correction = z.infer<typeof CorrectionSchema>;
export type CorrectionTable = ReadonlyMap<string, Correction>;

export function parseCorrections(json: unknown): CorrectionTable {
  return new Map(Object.entries(TableSchema.parse(json).corrections));
}

const eventKey = (event: { label: string; date?: string; week?: number }) => `${event.label}|${event.date ?? ''}|${event.week ?? ''}`;
const unique = (values: string[]) => [...new Set(values)];

export function applyCorrections(course: Course, table: CorrectionTable): Course {
  const correction = table.get(`${course.term}:${course.code}`);
  if (!correction) return course;
  const correctionEvents = correction.events ?? [];
  const correctedKeys = new Set(correctionEvents.map(eventKey));
  return {
    ...course,
    meetings: correction.meetings.map((meeting) => ({ ...meeting })),
    delivery: { mode: correction.deliveryMode, asyncAllowed: true, defaultAttendance: 'async' },
    events: [
      ...course.events.filter((event) => !correctedKeys.has(eventKey(event))),
      ...correctionEvents.map((event) => ({ ...event })),
    ],
    correctionId: correction.correctionId,
    notes: {
      ...course.notes,
      deliveryNotes: unique([...course.notes.deliveryNotes, ...(correction.deliveryNote ? [correction.deliveryNote] : [])]),
      informationNotes: unique([...course.notes.informationNotes, ...(correction.informationNotes ?? [])]),
    },
  };
}
