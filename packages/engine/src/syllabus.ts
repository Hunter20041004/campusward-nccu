// 課綱語料（計畫 4.5，格式見 docs/plans/2026-11-01-syllabus-qa.md）：驗證、切段、斷詞。建置期產生索引與瀏覽器端搜尋共用。

import { z } from 'zod';
import { parseUntrustedJson } from './safeJson.ts';

export const MAX_PASSAGE_LENGTH = 1000;
const Text = z.string().max(60_000);

const EntrySchema = z.object({
  code: z.string().regex(/^[0-9A-Z]{9}$/),
  title: z.string().max(400),
  description: Text,
  objectives: Text,
  grading: Text,
  prerequisite: z.string().max(2000),
  weekly: z.array(z.object({ week: z.number().int().min(0).max(99), topic: z.string().max(2000) }).strict()).max(60),
  weeklyText: Text,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type SyllabusEntry = z.infer<typeof EntrySchema>;
export type SyllabusSection = '課名' | '簡介' | '目標' | '評分' | '先修' | '每週主題' | '每週進度';

export interface SyllabusPassage {
  code: string;
  section: SyllabusSection;
  text: string;
}

/** 語料的一行；格式不符回 null（建置時略過並計數）。 */
export function parseSyllabusLine(line: string): SyllabusEntry | null {
  const parsed = parseUntrustedJson(line, 200_000);
  if (!parsed.ok) return null;
  const result = EntrySchema.safeParse(parsed.value);
  return result.success ? result.data : null;
}

function chunks(text: string): string[] {
  const clean = text.trim();
  const out: string[] = [];
  for (let start = 0; start < clean.length; start += MAX_PASSAGE_LENGTH) out.push(clean.slice(start, start + MAX_PASSAGE_LENGTH));
  return out;
}

/** 一門課 → 段落：每個區塊一段，超過上限的切成多段（調查：每段 1,000 字時索引才壓得進 3 MB）。 */
export function syllabusPassages(entry: SyllabusEntry): SyllabusPassage[] {
  const weekly = entry.weekly.map(({ week, topic }) => `第 ${week} 週 ${topic}`).join('\n');
  const sections: [SyllabusSection, string][] = [
    ['課名', entry.title],
    ['簡介', entry.description],
    ['目標', entry.objectives],
    ['評分', entry.grading],
    ['先修', entry.prerequisite],
    weekly ? ['每週主題', weekly] : ['每週進度', entry.weeklyText],
  ];
  return sections.flatMap(([section, text]) => chunks(text).map((part) => ({ code: entry.code, section, text: part })));
}

const HAN = /\p{Script=Han}/u;

/** NFKC、小寫；中文連續字切成二字一組（單獨一個字就保留單字），英數字以詞為單位。 */
export function tokenizeForSearch(text: string): string[] {
  const tokens: string[] = [];
  const pieces = text.normalize('NFKC').toLowerCase().match(/\p{Script=Han}+|[\p{L}\p{N}]+/gu) ?? [];
  pieces.forEach((piece) => {
    if (!HAN.test(piece)) {
      tokens.push(piece);
      return;
    }
    const chars = [...piece];
    if (chars.length === 1) tokens.push(piece);
    for (let index = 0; index < chars.length - 1; index += 1) tokens.push(chars[index]! + chars[index + 1]!);
  });
  return tokens;
}

/** 搜尋詞轉成十六進位（每個字 4 碼）：中文二字詞讓 MiniSearch 根節點有數千個分支，載入要十幾秒；轉碼後約 1 秒。 */
export function toSearchTerm(token: string): string {
  return [...token].map((char) => char.codePointAt(0)!.toString(16).padStart(4, '0')).join('');
}
