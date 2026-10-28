// 計畫 1.8：5,000 筆合成課程的搜尋時間，只在本機量（npm run bench），結果記入計畫第 11 節。
import { performance } from 'node:perf_hooks';
import { searchCourses } from '../../packages/engine/src/catalog.ts';
import { rowToCourse, type Course } from '../../packages/engine/src/official/course.ts';
import { officialRow, TERM } from '../../packages/engine/test/fixtures/synthetic/official-rows.ts';

const DAYS = '一二三四五';
const courses: Course[] = Array.from({ length: 5000 }, (_, index) => {
  const { course } = rowToCourse(officialRow({
    subNum: String(900000001 + index * 1000).padStart(9, '0'),
    subNam: `合成課程${index}`,
    teaNam: `教師${index % 300}`,
    subTime: `${DAYS[index % 5]}${['234', 'D56', '78', '1', 'EF'][index % 5]}`,
    lmtKind: index % 7 === 0 ? '社會通識' : '',
  }), TERM);
  if (!course) throw new Error('synthetic row rejected');
  return course;
});

function measure(label: string, run: () => unknown): void {
  for (let i = 0; i < 20; i += 1) run();
  const samples: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const pick = (q: number) => samples[Math.floor(q * (samples.length - 1))]?.toFixed(2);
  console.log(`${label}: 中位數 ${pick(0.5)} ms，p95 ${pick(0.95)} ms`);
}

measure('關鍵字搜尋 5,000 筆', () => searchCourses(courses, { text: '教師12 課程' }));
measure('星期＋節次篩選 5,000 筆', () => searchCourses(courses, { weekdays: [2, 4], periods: ['D', '5'] }));
