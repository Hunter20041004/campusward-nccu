// 資格條件：課程的修課限制 × 學生自己勾選的身分條件。移植自舊 eligibility-conditions 與 planner-core。
// 身分與資格條件（IdentityProfile）只能由學生本人在畫面上勾選；AI 只能改偏好（Preferences，見 schedule）。

export interface IdentityProfile {
  level?: 'undergrad' | 'graduate';
  year?: number;
  /** 加修學系：影響學分上限（選課須知）。 */
  additionalMajor?: 'none' | 'minor' | 'double';
  programs?: readonly string[];
  prerequisites?: readonly string[];
  conditionIds?: readonly string[];
  rejectedConditionIds?: readonly string[];
}

export interface RuleLike {
  conditionId: string;
  enforcement: 'required' | 'review';
  rationale: string;
  conditionLabel?: string;
  conditionDescription?: string;
}

/** 判斷資格所需的課程資訊。官方課程只會有 eligibilityRules；其餘欄位來自手動或自訂課程。 */
export interface EligibilityTarget {
  id?: string;
  title?: string;
  available?: boolean;
  level?: 'undergrad' | 'graduate';
  undergradReview?: boolean;
  openToUndergradYear?: number;
  minYear?: number;
  programs?: readonly string[];
  prerequisites?: readonly string[];
  eligibilityRules?: readonly RuleLike[];
}

export type EligibilityStatus = 'eligible' | 'review' | 'blocked' | 'unavailable';

export interface EligibilityResult {
  status: EligibilityStatus;
  reasons: string[];
}

export interface ConditionDefinition {
  id: string;
  label: string;
  category: string;
  description: string;
  source: 'course' | 'custom';
}

export type ConditionDefinitionMap = Readonly<Record<string, Omit<ConditionDefinition, 'id' | 'source'>>>;

const unique = (values: readonly (string | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];

export function profileConditionIds(profile: IdentityProfile = {}): string[] {
  return unique([
    ...(profile.conditionIds ?? []),
    ...(profile.programs ?? []).map((program) => `program:${program}`),
    ...(profile.prerequisites ?? []).map((prerequisite) => `prerequisite:${prerequisite}`),
  ]);
}

export function evaluateEligibility(
  section: EligibilityTarget,
  profile: IdentityProfile,
  { termLabel = '本學期' }: { termLabel?: string } = {},
): EligibilityResult {
  const reasons: string[] = [];
  const reviewReasons: string[] = [];
  const selectedConditionIds = new Set(profileConditionIds(profile));
  const rejectedConditionIds = new Set(profile.rejectedConditionIds ?? []);
  const year = profile.year ?? 0;
  if (section.available === false) {
    return { status: 'unavailable', reasons: [`${termLabel} 查無開課資料`] };
  }
  if (section.level === 'graduate' && profile.level === 'undergrad' && section.undergradReview) {
    return { status: 'review', reasons: ['碩士班課程，學士生須確認選課資格與學分認列'] };
  }
  if (
    section.level === 'graduate'
    && profile.level === 'undergrad'
    && section.openToUndergradYear
    && year >= section.openToUndergradYear
  ) {
    return { status: 'review', reasons: ['碩士班課程，課綱開放大三以上，需確認學分認列'] };
  }
  if (section.level === 'graduate' && profile.level === 'undergrad') reasons.push('僅限碩、博士班');
  // 學生還沒填年級時不以年級擋下（舊版 undefined < n 為 false，行為一致）。
  if (section.minYear && profile.year !== undefined && year < section.minYear) reasons.push(`限大${section.minYear}以上`);
  if (
    section.programs?.length
    && !section.programs.some((program) => (
      profile.programs?.includes(program) || selectedConditionIds.has(`program:${program}`)
    ))
  ) {
    reasons.push('學程限制');
  }
  (section.prerequisites ?? []).forEach((prerequisite) => {
    if (!profile.prerequisites?.includes(prerequisite) && !selectedConditionIds.has(`prerequisite:${prerequisite}`)) {
      reasons.push(`缺少先修：${prerequisite}`);
    }
  });
  (section.eligibilityRules ?? []).forEach((rule) => {
    if (selectedConditionIds.has(rule.conditionId)) return;
    if (rule.enforcement === 'required' && rejectedConditionIds.has(rule.conditionId)) {
      reasons.push(rule.rationale);
      return;
    }
    reviewReasons.push(rule.rationale);
  });
  if (!reasons.length && reviewReasons.length) return { status: 'review', reasons: reviewReasons };
  return { status: reasons.length ? 'blocked' : 'eligible', reasons };
}

export function rulesForCourse(course: EligibilityTarget = {}): RuleLike[] {
  return [
    ...(course.eligibilityRules ?? []),
    ...(course.programs ?? []).map((program): RuleLike => ({
      conditionId: `program:${program}`,
      enforcement: 'required',
      rationale: `限具 ${program} 相關資格的學生。`,
    })),
    ...(course.prerequisites ?? []).map((prerequisite): RuleLike => ({
      conditionId: `prerequisite:${prerequisite}`,
      enforcement: 'required',
      rationale: `須先具備 ${prerequisite}。`,
    })),
  ];
}

function fallbackDefinition(id: string) {
  const [category = 'other', rawLabel = id] = id.split(':', 2);
  return {
    label: rawLabel.replaceAll('-', ' '),
    category,
    description: '這項條件由候選課程的結構化選課限制產生。',
  };
}

export function buildConditionDefinitions(
  courses: readonly EligibilityTarget[] = [],
  customConditions: readonly ConditionDefinition[] = [],
  knownConditions: ConditionDefinitionMap = {},
): ConditionDefinition[] {
  const courseRules = courses.flatMap((course) => rulesForCourse(course));
  const courseConditionIds = unique(courseRules.map((rule) => rule.conditionId));
  const courseDefinitions = courseConditionIds.map((id): ConditionDefinition => {
    const rule = courseRules.find((candidate) => candidate.conditionId === id);
    const fallback = fallbackDefinition(id);
    return {
      id,
      ...(knownConditions[id] ?? {
        ...fallback,
        label: rule?.conditionLabel || fallback.label,
        description: rule?.conditionDescription || fallback.description,
      }),
      source: 'course',
    };
  });
  const knownIds = new Set(courseConditionIds);
  return [...courseDefinitions, ...customConditions.filter((condition) => !knownIds.has(condition.id))];
}

type ConditionState = 'accepted' | 'rejected' | 'unknown';

function impactConsequence(rule: RuleLike, state: ConditionState): string {
  if (state === 'accepted') return '符合後可直接選';
  if (state === 'unknown') return '尚未回答，加入前需確認資格';
  return rule.enforcement === 'review' ? '不符合仍可選，但需教師／系所確認' : '不符合時無法直接加入';
}

export function buildConditionImpacts(
  courses: readonly EligibilityTarget[] = [],
  definitions: readonly ConditionDefinition[] = [],
  profile: IdentityProfile = {},
) {
  const selectedIds = new Set(profileConditionIds(profile));
  const rejectedIds = new Set(profile.rejectedConditionIds ?? []);
  return definitions.map((definition) => {
    const selected = selectedIds.has(definition.id);
    const state: ConditionState = selected ? 'accepted' : rejectedIds.has(definition.id) ? 'rejected' : 'unknown';
    const affectedCourses = courses.flatMap((course) => (
      rulesForCourse(course)
        .filter((rule) => rule.conditionId === definition.id)
        .map((rule) => ({
          courseId: course.id,
          title: course.title,
          enforcement: rule.enforcement,
          rationale: rule.rationale,
          consequence: impactConsequence(rule, state),
        }))
    ));
    return {
      ...definition,
      selected,
      state,
      summary: affectedCourses.length ? `影響 ${affectedCourses.length} 門候選課` : '目前不影響候選課，可安全移除',
      affectedCourses,
    };
  });
}

export function validateCustomCondition(
  input: { label?: string; category?: string; description?: string } = {},
  existingDefinitions: readonly { id?: string; label?: string }[] = [],
): { field: 'label'; message: string } | null {
  if (!input.label?.trim()) return { field: 'label', message: '請輸入條件名稱。' };
  const normalize = (label: string) => label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-Hant');
  const normalizedLabel = normalize(input.label);
  if (existingDefinitions.some((definition) => definition.label !== undefined && normalize(definition.label) === normalizedLabel)) {
    return { field: 'label', message: '這項條件已經存在。' };
  }
  return null;
}
