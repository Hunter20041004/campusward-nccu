// 把官方備註文字分類成資格條件、上課方式、考試活動、學程標籤與一般資訊。移植自舊 nccu-course-notes。

export interface EligibilityRule {
  conditionId: string;
  conditionLabel: string;
  conditionDescription: string;
  enforcement: 'required' | 'review';
  rationale: string;
  source: 'nccu-official' | 'custom';
  confidence: 'high' | 'medium' | 'low';
}

export interface ExamEvent {
  date: string;
  label: string;
}

export interface ClassifiedNotes {
  eligibilityRules: EligibilityRule[];
  scheduleNotes: string[];
  deliveryNotes: string[];
  examEvents: ExamEvent[];
  programTags: string[];
  informationNotes: string[];
}

function splitOfficialNotes(value: string): string[] {
  return String(value || '')
    .split(/[；。\n]+/)
    .map((note) => note.trim())
    .filter(Boolean);
}

function requiredRule(courseCode: string, rationale: string, conditionLabel: string): EligibilityRule {
  return {
    conditionId: `official-restriction:${courseCode}`,
    conditionLabel,
    conditionDescription: `政大官方限制：${rationale}`,
    enforcement: 'required',
    rationale,
    source: 'nccu-official',
    confidence: 'high',
  };
}

/** 擋修先修條件 id：課名全形括號轉半形、去空白。修課紀錄（studentExport）用同一個函式產生，確保對得上。 */
export function prerequisiteConditionId(courseTitle: string): string {
  return `prerequisite-course:${courseTitle.replaceAll('（', '(').replaceAll('）', ')').replaceAll(/\s+/g, '')}`;
}

function blockedPrerequisiteRule(courseTitle: string): EligibilityRule {
  return {
    conditionId: prerequisiteConditionId(courseTitle),
    conditionLabel: `我修過${courseTitle}`,
    conditionDescription: `政大官方擋修：沒修過${courseTitle}的話，選課系統會擋下這門課。`,
    enforcement: 'required',
    rationale: `官方擋修：須先修過${courseTitle}`,
    source: 'nccu-official',
    confidence: 'high',
  };
}

export function classifyOfficialNotes({ courseCode = '', restrictionText = '' }: { courseCode?: string; restrictionText?: string } = {}): ClassifiedNotes {
  const result: ClassifiedNotes = {
    eligibilityRules: [],
    scheduleNotes: [],
    deliveryNotes: [],
    examEvents: [],
    programTags: [],
    informationNotes: [],
  };

  splitOfficialNotes(restrictionText).forEach((note) => {
    const normalized = note.replace(/^\d+\./, '').trim();
    const blockedPrerequisites = [...new Set(
      [...normalized.matchAll(/擋修([^，,。；;\n]+)/g)]
        .flatMap((match) => (match[1] ?? '').split('、'))
        .map((courseTitle) => courseTitle
          .replaceAll('（', '(')
          .replaceAll('）', ')')
          .replaceAll(/\s+/g, ''))
        .filter((courseTitle) => (
          courseTitle
          && !/^(?:者|程序|單|後|前|時|流程|規則|規定|資格|條件|名單|作業)/.test(courseTitle)
        )),
    )];
    result.eligibilityRules.push(...blockedPrerequisites.map(blockedPrerequisiteRule));
    const exclusiveAudience = normalized.match(/^僅供(.+?)修習(?:[，,](.+))?$/);
    if (exclusiveAudience) {
      const audience = exclusiveAudience[1] ?? '';
      const rationale = `僅供${audience}修習`;
      result.eligibilityRules.push(requiredRule(courseCode, rationale, `我是${audience.replaceAll('與', '或')}`));
      const policy = exclusiveAudience[2]?.trim();
      if (policy) result.informationNotes.push(policy);
      return;
    }
    const restrictedAudience = normalized.match(/^僅限(.+?)學生修讀$/)?.[1];
    if (restrictedAudience) {
      result.eligibilityRules.push(requiredRule(
        courseCode,
        normalized,
        `我是${restrictedAudience.replace('及雙主修', '或雙主修')}學生`,
      ));
      return;
    }
    if (/^限(?!制)[^。]+/.test(normalized)) {
      result.eligibilityRules.push(requiredRule(courseCode, normalized, `我符合：${normalized}`));
      return;
    }
    if (/(?:須|需).*(?:先修|修習|具備)/.test(normalized)) {
      const language = normalized.match(/(?:先修習|修習)[^，；]{0,30}(日文|英文|德文|法文)/)?.[1];
      result.eligibilityRules.push(requiredRule(
        courseCode,
        normalized,
        language && normalized.includes('或')
          ? `我符合本課程任一項${language}先修資格`
          : `我符合：${normalized}`,
      ));
      return;
    }
    const event = normalized.match(/^(\d{1,2}\/\d{1,2})(.+(?:考試|展示|成果).*)$/);
    if (event) {
      result.examEvents.push({ date: event[1] ?? '', label: (event[2] ?? '').trim() });
      return;
    }
    if (/(?:英語|英文)授課|遠距上課|同步上課|非同步|NTUCOOL|Moodle/.test(normalized)) {
      result.deliveryNotes.push(normalized);
      return;
    }
    if (/(?:類課程|群[A-ZＡ-Ｚ]|擴大輔系課程|TAICA|人工智慧學程聯盟|學分學程)/.test(normalized)) {
      result.programTags.push(normalized);
      return;
    }
    result.informationNotes.push(normalized);
  });

  return result;
}
