import { describe, expect, test } from 'vitest';
import snapshot from '../../../data/snapshots/1151/courses.json' with { type: 'json' };
import type { Course } from '../src/official/course.ts';
import { classOptions, classRequiredCourses, formatClassName, parseClassName } from '../src/schedule/classPlan.ts';

// 真實的 115-1 開課快照（公開的官方資料）：系級選單裡的每個值存起來再讀回來，都要是同一個系級。
const courses = snapshot as unknown as Course[];

describe('classOptions on the real snapshot', () => {
  const options = classOptions(courses);

  test('every value parses back to the same department, grade and section', () => {
    const broken = options.filter((option) => {
      const parsed = parseClassName(option.value);
      return !parsed || formatClassName(parsed) !== option.value
        || parsed.department !== option.department || parsed.grade !== option.grade || parsed.section !== option.section;
    });
    expect(broken.map(({ value }) => value)).toEqual([]);
  });

  test('the stored value finds the same required courses as the option itself', () => {
    options.forEach((option) => {
      const direct = classRequiredCourses(courses, option).required.map(({ id }) => id);
      expect(classRequiredCourses(courses, parseClassName(option.value)!).required.map(({ id }) => id), option.value).toEqual(direct);
    });
  });

  test('offers the 地政 tracks', () => {
    expect(options.map(({ value }) => value)).toEqual(expect.arrayContaining(['地政二土管', '地政二土資', '地政二土測']));
  });
});
