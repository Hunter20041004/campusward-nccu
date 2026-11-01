// AI 光球（設計 6.1、6.2；計畫 4.3）：一次需求最多 2 次模型呼叫。
// 第一次可以請 Campusward 搜課；搜課由引擎在本機完成，第二次只能從搜尋結果挑課。
// 這裡只產生變更方案，套用與檢查交給 usePlanner.applyAi（引擎 applyAiChangeSet）。

import {
  AiContractError,
  buildAiPrompt,
  parseAiActions,
  searchCourses,
  toScheduleCourse,
  type Change,
  type Course,
  type CourseCorrection,
  type PlannerState,
  type ScheduleCourse,
} from '@campusward/engine';
import { GeminiError, type GeminiClient } from './gemini.ts';
import { MODELS } from './models.ts';

export const MAX_CALLS = 2;
const RESULTS_PER_QUERY = 20;
const MAX_QUERIES = 4;
const WEEKDAY = /^(?:週|星期|禮拜)([一二三四五六日天])$/;
const WEEKDAYS = '一二三四五六日';

export interface OrbInput {
  client: Pick<GeminiClient, 'generate'>;
  request: string;
  termLabel: string;
  planner: PlannerState;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  courses: readonly Course[];
  missingCourseNames?: readonly string[];
  model?: string;
}

export type OrbPlan =
  | { status: 'planned'; changes: Change[]; answer: string; corrections: CourseCorrection[]; calls: number }
  | { status: 'failed'; message: string };

/** AI 的搜課關鍵字：「週三」「星期五」轉成星期條件，其餘當關鍵字；全部都要符合找不到時，改成符合任一個。 */
export function aiSearch(courses: readonly Course[], query: string): Course[] {
  const tokens = query.normalize('NFKC').split(/\s+/).filter(Boolean);
  const weekdays = tokens.flatMap((token) => {
    const day = WEEKDAY.exec(token)?.[1];
    return day ? [day === '天' ? 7 : WEEKDAYS.indexOf(day) + 1] : [];
  });
  const words = tokens.filter((token) => !WEEKDAY.test(token));
  if (!words.length && !weekdays.length) return [];
  const all = searchCourses(courses, { text: words.join(' '), weekdays });
  if (all.length || words.length < 2) return all;
  const seen = new Set<string>();
  return words.flatMap((word) => searchCourses(courses, { text: word, weekdays })).filter((course) => {
    if (seen.has(course.code)) return false;
    seen.add(course.code);
    return true;
  });
}

const answerOf = (requests: ReturnType<typeof parseAiActions>['requests']) => requests
  .flatMap((request) => (request.type === 'answer' ? [request.text.trim()] : []))
  .filter(Boolean)
  .join('\n');

export async function planWithAi(input: OrbInput): Promise<OrbPlan> {
  const model = input.model ?? MODELS.orb;
  const base = {
    request: input.request,
    termLabel: input.termLabel,
    planner: input.planner,
    catalog: input.catalog,
    ...(input.missingCourseNames?.length ? { missingCourseNames: input.missingCourseNames } : {}),
  };
  try {
    const first = parseAiActions(await input.client.generate({ model, ...buildAiPrompt(base) }), input.catalog);
    const queries = first.requests.flatMap((request) => (request.type === 'searchCourses' ? [request.query] : [])).slice(0, MAX_QUERIES);
    if (first.changes.length || !queries.length) {
      return { status: 'planned', changes: first.changes, answer: answerOf(first.requests), corrections: first.corrections, calls: 1 };
    }
    const searchResults = queries.map((query) => ({
      query,
      courseKeys: aiSearch(input.courses, query).slice(0, RESULTS_PER_QUERY).map((course) => toScheduleCourse(course).key),
    }));
    // 第二次是最後一次：再要求搜課也不會照做。
    const second = parseAiActions(await input.client.generate({ model, ...buildAiPrompt({ ...base, searchResults }) }), input.catalog);
    return { status: 'planned', changes: second.changes, answer: answerOf(second.requests), corrections: second.corrections, calls: MAX_CALLS };
  } catch (error) {
    if (error instanceof GeminiError || error instanceof AiContractError) return { status: 'failed', message: error.message };
    return { status: 'failed', message: 'AI 處理時發生錯誤，沒有修改課表。' };
  }
}
