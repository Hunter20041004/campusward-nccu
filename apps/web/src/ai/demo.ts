import { findClashes, toScheduleCourse, type Course, type ScheduleCourse, type ScheduleEntry } from '@campusward/engine';

/**
 * 「看示範」要加的那門課：依官方的通識類別欄位挑（課名幾乎不會寫「通識」），
 * 跳過已排、和目前課表衝堂、沒有固定上課時間的課。找不到回傳 undefined。
 */
export function pickDemoCourse(courses: readonly Course[], catalog: ReadonlyMap<string, ScheduleCourse>, entries: readonly ScheduleEntry[]): string | undefined {
  const scheduled = new Set(entries.map(({ course }) => course.key));
  for (const course of courses) {
    if (!course.official?.generalEducation) continue;
    const key = toScheduleCourse(course).key;
    const scheduleCourse = catalog.get(key);
    if (!scheduleCourse || scheduled.has(key)) continue;
    if (!scheduleCourse.meetings.length) continue;
    if (findClashes(entries, scheduleCourse).length) continue;
    return key;
  }
  return undefined;
}
