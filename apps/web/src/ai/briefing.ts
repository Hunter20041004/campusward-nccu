// 小助手打開時的「今日重點」（參考 Claude Duet 的主動摘要）：完全在本機由課表算出，不呼叫 AI。
import type { BuddyMood } from '../buddy/motion.ts';

const DAYS = ['', '一', '二', '三', '四', '五', '六', '日'];

export interface BriefingInput {
  courses: number;
  credits: number;
  /** 衝堂的兩門課名。 */
  conflicts: readonly (readonly [string, string])[];
  /** 需要注意的選課規則提醒數。 */
  warnings: number;
  freeDays: readonly number[];
  unscheduledCandidates: number;
  /** 衝堂可以用本機「換到不衝堂的班」解決：面板直接放那顆按鈕，不再建議送 AI。 */
  localClashFix?: boolean;
}

export interface Briefing {
  lines: string[];
  suggestions: string[];
  mood: BuddyMood;
}

export function buildBriefing({ courses, credits, conflicts, warnings, freeDays, unscheduledCandidates, localClashFix = false }: BriefingInput): Briefing {
  if (courses === 0) {
    return { lines: ['課表還是空的。'], suggestions: ['幫我找週三下午的通識', '幫我排一份 15 學分左右、不要早八的課表'], mood: 'idle' };
  }
  const lines = [`目前 ${courses} 門、${credits} 學分。`];
  const suggestions: string[] = [];
  const [first] = conflicts;
  if (conflicts.length === 1 && first) {
    lines.push(`${first[0]}和${first[1]}衝堂。`);
    if (!localClashFix) suggestions.push(`幫我解決${first[0]}和${first[1]}的衝堂`);
  } else if (conflicts.length > 1) {
    lines.push(`有 ${conflicts.length} 組衝堂。`);
    if (!localClashFix) suggestions.push('幫我解決衝堂');
  }
  if (warnings > 0) lines.push(`另有 ${warnings} 則選課規則提醒。`);
  if (freeDays.length) lines.push(`你希望週${freeDays.map((day) => DAYS[day]).join('、')}空下來。`);
  if (unscheduledCandidates > 0) {
    lines.push(`候選清單還有 ${unscheduledCandidates} 門沒排。`);
    suggestions.push('把候選清單裡排得進去的課加進課表');
  }
  if (suggestions.length < 2) suggestions.push('幫我補一門不衝堂的通識');
  return { lines, suggestions: suggestions.slice(0, 3), mood: conflicts.length ? 'worried' : 'idle' };
}
