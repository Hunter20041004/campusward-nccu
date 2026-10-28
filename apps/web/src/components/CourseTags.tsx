import type { Course } from '@campusward/engine';

/** 課程的官方標籤：通識類別、英語授課、收費、碩博士班、全學年。 */
export function courseTags(course: Course): string[] {
  const { official } = course;
  const degree = official.degreeLevel;
  return [
    official.generalEducation,
    official.emi ? '英語授課' : '',
    official.fee === '收費' ? '收費' : '',
    /碩士|博士/.test(degree) && !degree.includes('學士') ? degree : '',
    official.semesterSpan === '全學年科目' ? '全學年' : '',
    course.delivery.asyncAllowed ? '可非同步' : '',
  ].filter(Boolean);
}

export function CourseTags({ course }: { course: Course }) {
  const tags = courseTags(course);
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="課程標籤">
      {tags.map((tag) => (
        <li key={tag} className="rounded-selector bg-mint-wash px-2 py-0.5 text-xs font-medium text-accent-content">{tag}</li>
      ))}
    </ul>
  );
}
