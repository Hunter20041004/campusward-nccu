// 選課規則提醒：只提醒、不阻擋，也不改變選取。規則數字與出處來自 data/rules（選課須知），換版只換資料。

import { z } from 'zod';
import { normalizeSearchText } from './catalog.ts';
import type { IdentityProfile } from './eligibility.ts';
import type { ScheduleCourse, ScheduleEntry } from './schedule/selection.ts';
import { totalCredits } from './schedule/selection.ts';

const RULE_IDS = [
  'credit-minimum', 'credit-maximum', 'distribution-cap', 'stage1-professional-only', 'stage1-no-waitlist',
  'same-course', 'restricted', 'graduate-course', 'fee', 'full-year', 'auto-enrolled',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

const RulesSchema = z.object({
  document: z.string(),
  version: z.string().min(1),
  url: z.string(),
  verifiedAt: z.string(),
  credits: z.object({
    minimum: z.object({ year1to3: z.number(), year4plus: z.number() }).strict(),
    maximum: z.object({ none: z.number(), minor: z.number(), double: z.number() }).strict(),
  }).strict(),
  distributionCaps: z.object({
    chinese: z.number(), foreign: z.number(), generalAndCollege: z.number(), college: z.number(), pe: z.number(),
  }).strict(),
  codePrefixes: z.object({
    pe: z.string().length(3), chinese: z.string().length(3), foreign: z.string().length(3), college: z.string().length(3),
  }).strict(),
  sources: z.object(Object.fromEntries(RULE_IDS.map((id) => [id, z.string().min(1)])) as Record<RuleId, z.ZodString>).strict(),
}).strict();

export type EnrollmentRules = z.infer<typeof RulesSchema>;

export function parseEnrollmentRules(json: unknown): EnrollmentRules {
  return RulesSchema.parse(json);
}

export interface RuleReminder {
  id: RuleId;
  severity: 'info' | 'warn';
  message: string;
  /** 出處，例如「選課須知 114.07 版 8-2 (四)4」。 */
  source: string;
  courseKeys?: string[];
}

export interface RuleOptions {
  /** 目前所在的初選階段；未提供時不顯示階段相關提醒。 */
  phase?: 'stage1' | 'stage2' | 'add-drop';
}

type Category = 'pe' | 'chinese' | 'foreign' | 'college' | 'general' | 'professional';

function categorize(course: ScheduleCourse, rules: EnrollmentRules): Category {
  const code = course.code ?? '';
  const prefixes = rules.codePrefixes;
  if (code.startsWith(prefixes.pe)) return 'pe';
  if (code.startsWith(prefixes.chinese)) return 'chinese';
  if (code.startsWith(prefixes.foreign)) return 'foreign';
  if (code.startsWith(prefixes.college)) return 'college';
  const generalEducation = course.official?.generalEducation ?? '';
  if (generalEducation === '中文通識') return 'chinese';
  if (generalEducation === '外文通識') return 'foreign';
  if (generalEducation.includes('書院')) return 'college';
  if (generalEducation.includes('通識')) return 'general';
  return 'professional';
}

const CATEGORY_LABELS: Record<Exclude<Category, 'professional'>, string> = {
  pe: '體育必修',
  chinese: '中文通識',
  foreign: '外文通識',
  college: '書院通識',
  general: '一般通識',
};

const MAJOR_LABELS = { none: '無加修學系', minor: '輔系', double: '雙主修' } as const;

export function checkEnrollmentRules(
  entries: readonly ScheduleEntry[],
  profile: IdentityProfile,
  rules: EnrollmentRules,
  options: RuleOptions = {},
): RuleReminder[] {
  const reminders: RuleReminder[] = [];
  const cite = (id: RuleId) => `選課須知 ${rules.version} 版 ${rules.sources[id]}`;
  const remind = (id: RuleId, severity: RuleReminder['severity'], message: string, courseKeys?: string[]) => {
    reminders.push({ id, severity, message, source: cite(id), ...(courseKeys ? { courseKeys } : {}) });
  };
  const courses = entries.filter(({ course }) => course.itemType === 'course');

  if (profile.level !== 'graduate' && profile.year) {
    const total = totalCredits(courses);
    const minimum = profile.year >= 4 ? rules.credits.minimum.year4plus : rules.credits.minimum.year1to3;
    const major = profile.additionalMajor ?? 'none';
    const maximum = rules.credits.maximum[major];
    if (total < minimum) {
      remind('credit-minimum', 'warn', `目前 ${total} 學分，低於大${profile.year}學分下限 ${minimum} 學分；如確定要少修，請於規定期限上網申請「超減修習學分數」。`);
    }
    if (total > maximum) {
      remind('credit-maximum', 'warn', `目前 ${total} 學分，超過${MAJOR_LABELS[major]}學分上限 ${maximum} 學分，初選選上學分不得超過上限；如需多修，請於規定期限上網申請「超減修習學分數」。`);
    }
  }

  const planned = courses.filter(({ item }) => item.status === 'planned');
  const byCategory = new Map<Category, string[]>();
  planned.forEach(({ course }) => {
    const category = categorize(course, rules);
    byCategory.set(category, [...(byCategory.get(category) ?? []), course.key]);
  });
  const caps = rules.distributionCaps;
  const capChecks: [Exclude<Category, 'professional' | 'general'>, number][] = [
    ['chinese', caps.chinese], ['foreign', caps.foreign], ['college', caps.college], ['pe', caps.pe],
  ];
  capChecks.forEach(([category, cap]) => {
    const keys = byCategory.get(category) ?? [];
    if (keys.length > cap) {
      remind('distribution-cap', 'warn', `排了 ${keys.length} 門${CATEGORY_LABELS[category]}，初選最多只會分發 ${cap} 科。`, keys);
    }
  });
  const generalKeys = [...(byCategory.get('general') ?? []), ...(byCategory.get('college') ?? [])];
  if (generalKeys.length > caps.generalAndCollege) {
    remind('distribution-cap', 'warn', `排了 ${generalKeys.length} 門一般與書院通識，初選合計最多只會分發 ${caps.generalAndCollege} 科。`, generalKeys);
  }

  if (options.phase === 'stage1') {
    const nonProfessional = planned.filter(({ course }) => categorize(course, rules) !== 'professional').map(({ course }) => course.key);
    if (nonProfessional.length) {
      remind('stage1-professional-only', 'warn', '第 1 階段只接受專業科目登記；通識與體育請在第 2 階段登記。', nonProfessional);
    }
    if (planned.length) {
      remind('stage1-no-waitlist', 'info', '第 1 階段落選的課不會遞補，須在第 2 階段重新登記。');
    }
  }

  const groups = new Map<string, string[]>();
  courses.forEach(({ course }) => {
    const groupKeys = [`title:${normalizeSearchText(course.title)}`, ...(course.code ? [`code:${course.code.slice(0, 6)}`] : [])];
    groupKeys.forEach((groupKey) => groups.set(groupKey, [...(groups.get(groupKey) ?? []), course.key]));
  });
  const reported = new Set<string>();
  groups.forEach((keys) => {
    const unique = [...new Set(keys)];
    const signature = unique.join('|');
    if (unique.length < 2 || reported.has(signature)) return;
    reported.add(signature);
    remind('same-course', 'warn', '這幾門課名稱相同或課號前六碼相同，只會選上一門。', unique);
  });

  courses.forEach(({ course }) => {
    const official = course.official;
    const keys = [course.key];
    const degree = official?.degreeLevel ?? '';
    if (profile.level !== 'graduate' && /碩士|博士/.test(degree) && !degree.includes('學士')) {
      remind('graduate-course', 'info', `${course.title} 是${degree}課程，學士生選修請先確認系所規定與學分認列。`, keys);
    }
    if (official?.fee === '收費') remind('fee', 'info', `${course.title} 是收費課程。`, keys);
    if (/限本系|限.{0,8}年級|僅限/.test(course.restrictionText ?? '')) {
      remind('restricted', 'info', `${course.title} 有修課限制：${course.restrictionText}`, keys);
    }
    if (official?.semesterSpan === '全學年科目') {
      remind('full-year', 'info', `${course.title} 是全學年課程，上學期未修或不及格，下學期會被擋修。`, keys);
    }
    if (official?.enrollmentType === '必修灌檔') {
      remind('auto-enrolled', 'info', `${course.title} 由系所灌檔；灌檔時不檢查衝堂，若衝堂需自行退選。`, keys);
    }
  });

  return reminders;
}
