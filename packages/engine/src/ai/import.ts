// 截圖匯入的確定性部分：解析辨識結果、檢查圖片、比對全校課程快照。移植自舊 ai-contracts、ai-planner、ai-service。
// 舊版逐筆向政大即時查詢；新版比對本機快照。

import { normalizeSearchText } from '../catalog.ts';
import { courseKey } from '../schedule/catalog.ts';
import type { Course } from '../official/course.ts';
import type { Change, PlannerState } from '../plans.ts';
import { AiContractError } from './changeSet.ts';

export interface RecognizedCourse {
  courseCode: string;
  title: string;
  teacher: string;
  credits: number | null;
  scheduleText: string;
  confidence: number;
}

const MAX_RECOGNIZED = 50;
const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');

export function parseRecognizedCourses(content: string): { recognizedCourses: RecognizedCourse[] } {
  let payload: unknown;
  try {
    payload = JSON.parse(String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw new AiContractError();
  }
  const list = (payload as { recognizedCourses?: unknown })?.recognizedCourses;
  if (!Array.isArray(list) || list.length > MAX_RECOGNIZED) throw new AiContractError();
  return {
    recognizedCourses: list.map((raw: Record<string, unknown> | null) => {
      const courseCode = text(raw?.courseCode);
      const title = text(raw?.title);
      if (!courseCode && !title) throw new AiContractError();
      const credits = raw?.credits === null || raw?.credits === '' ? Number.NaN : Number(raw?.credits);
      const confidence = Number(raw?.confidence);
      return {
        courseCode,
        title,
        teacher: text(raw?.teacher),
        credits: Number.isFinite(credits) ? credits : null,
        scheduleText: text(raw?.scheduleText),
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      };
    }),
  };
}

const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateScreenshotFile(file: { type: string; size: number } | null | undefined): { message: string } | null {
  if (!file || !SCREENSHOT_TYPES.has(file.type)) return { message: '請選擇 PNG、JPEG 或 WebP 截圖。' };
  if (file.size > 3_000_000) return { message: '截圖超過 3 MB，請裁切或壓縮後重試。' };
  return null;
}

const IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

export function validateImportImage(imageDataUrl: string): string {
  if (imageDataUrl.length > 4_000_000) throw new AiContractError('截圖超過 4 MB，請裁切或壓縮後重試。');
  if (!IMAGE_PATTERN.test(imageDataUrl)) throw new AiContractError('只接受 PNG、JPEG 或 WebP 截圖。');
  return imageDataUrl;
}

export interface PendingCourse {
  recognized: RecognizedCourse;
  candidates: Course[];
  reason: string;
}

export interface MatchResult {
  matched: Course[];
  duplicates: Course[];
  pending: PendingCourse[];
}

const teacherMatches = (course: Course, teacher: string) => {
  if (!teacher) return true;
  const official = normalizeSearchText(course.teacher);
  return official.includes(teacher) || teacher.includes(official);
};

function findCandidates(recognized: RecognizedCourse, courses: readonly Course[]): Course[] {
  const code = normalizeSearchText(recognized.courseCode);
  if (code) {
    const exact = courses.find((course) => normalizeSearchText(course.code) === code);
    if (exact) return [exact];
  }
  const title = normalizeSearchText(recognized.title);
  const teacher = normalizeSearchText(recognized.teacher);
  if (!title) return [];
  const sameTitle = courses.filter((course) => normalizeSearchText(course.title) === title && teacherMatches(course, teacher));
  if (sameTitle.length) return sameTitle;
  // 辨識常把課名多認或少認字：退而以前三字比對，且同一位教師。
  const prefix = [...title].slice(0, 3).join('');
  if (!teacher || prefix.length < 3) return [];
  return courses.filter((course) => normalizeSearchText(course.title).startsWith(prefix) && teacherMatches(course, teacher));
}

export function matchRecognizedCourses(
  recognizedCourses: readonly RecognizedCourse[],
  courses: readonly Course[],
  { termLabel = '本學期' }: { termLabel?: string } = {},
): MatchResult {
  const result: MatchResult = { matched: [], duplicates: [], pending: [] };
  const seen = new Set<string>();
  recognizedCourses.forEach((recognized) => {
    const candidates = findCandidates(recognized, courses);
    const [only] = candidates;
    if (candidates.length === 1 && only) {
      (seen.has(only.code) ? result.duplicates : result.matched).push(only);
      seen.add(only.code);
      return;
    }
    result.pending.push({
      recognized,
      candidates,
      reason: candidates.length > 1 ? '找到多筆官方課程，請確認班別。' : `找不到唯一的 ${termLabel} 官方開課資料。`,
    });
  });
  return result;
}

/** 把比對成功的課加入候選清單；已在清單中的課不重複加入。 */
export function importChanges(state: PlannerState, matched: readonly Course[]): { changes: Change[]; alreadyCandidates: string[] } {
  const existing = new Set(state.candidates);
  const changes: Change[] = [];
  const alreadyCandidates: string[] = [];
  matched.forEach((course) => {
    const key = courseKey(course);
    if (existing.has(key)) alreadyCandidates.push(key);
    else {
      existing.add(key);
      changes.push({ type: 'addCandidate', key });
    }
  });
  return { changes, alreadyCandidates };
}
