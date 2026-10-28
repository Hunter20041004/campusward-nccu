import { expect, test } from 'vitest';
import {
  buildConditionDefinitions,
  buildConditionImpacts,
  evaluateEligibility,
  profileConditionIds,
  rulesForCourse,
  validateCustomCondition,
  type ConditionDefinitionMap,
} from '../src/eligibility.ts';

// 移植自舊專案 tests/planner-core.test.mjs（資格部分）與 tests/eligibility-conditions.test.mjs。
// 改變：查無開課的原因改由參數帶入學期；示範用的已知條件改由參數提供（舊版寫死在程式中）。
const DEMO_CONDITIONS: ConditionDefinitionMap = {
  'program:innovation': {
    label: '創新創業學程資格',
    category: 'program',
    description: '部分候選課程限定創新創業學程學生，或在第一階段優先開放。',
  },
  'prerequisite:statistics': {
    label: '修過統計學 3 學分',
    category: 'prerequisite',
    description: '部分量化課程將統計學 3 學分列為先修門檻。',
  },
};

const profile = {
  level: 'undergrad',
  year: 3,
  programs: ['innovation'],
  prerequisites: [],
} as const;

test('marks a program-only junior course eligible for a matching year-three student', () => {
  expect(evaluateEligibility({ minYear: 3, programs: ['innovation'] }, profile)).toEqual({ status: 'eligible', reasons: [] });
});

test('marks a graduate course that opens to juniors for review', () => {
  expect(evaluateEligibility({ level: 'graduate', openToUndergradYear: 3 }, profile)).toEqual({ status: 'review', reasons: ['碩士班課程，課綱開放大三以上，需確認學分認列'] });
});

test('marks a graduate course requiring undergraduate review for review', () => {
  expect(evaluateEligibility({ level: 'graduate', undergradReview: true }, profile)).toEqual({ status: 'review', reasons: ['碩士班課程，學士生須確認選課資格與學分認列'] });
});

test('marks a missing review condition for review with its rationale', () => {
  expect(evaluateEligibility({
      eligibilityRules: [{
        conditionId: 'competency:python',
        enforcement: 'review',
        rationale: '建議具備 Python 基礎，未具備者須先與教師確認。',
      }],
    }, { ...profile, conditionIds: [] })).toEqual({
      status: 'review',
      reasons: ['建議具備 Python 基礎，未具備者須先與教師確認。'],
    });
});

test('marks an unanswered required official condition for review', () => {
  expect(evaluateEligibility({
      eligibilityRules: [{
        conditionId: 'official-restriction:509041001',
        enforcement: 'required',
        rationale: '僅限歐文系及雙主修學生修讀',
      }],
    }, { ...profile, conditionIds: [], rejectedConditionIds: [] })).toEqual({
      status: 'review',
      reasons: ['僅限歐文系及雙主修學生修讀'],
    });
});

test('blocks a required official condition the student rejected', () => {
  expect(evaluateEligibility({
      eligibilityRules: [{
        conditionId: 'official-restriction:509041001',
        enforcement: 'required',
        rationale: '僅限歐文系及雙主修學生修讀',
      }],
    }, {
      ...profile,
      conditionIds: [],
      rejectedConditionIds: ['official-restriction:509041001'],
    })).toEqual({
      status: 'blocked',
      reasons: ['僅限歐文系及雙主修學生修讀'],
    });
});

test('marks a course with no current section unavailable', () => {
  expect(evaluateEligibility({ available: false }, profile, { termLabel: '115-1' })).toEqual({ status: 'unavailable', reasons: ['115-1 查無開課資料'] });
});

test('blocks a course when its prerequisite is missing', () => {
  expect(evaluateEligibility({ prerequisites: ['statistics'] }, profile)).toEqual({ status: 'blocked', reasons: ['缺少先修：statistics'] });
});

test('blocks a graduate-only course for an undergraduate', () => {
  expect(evaluateEligibility({ level: 'graduate' }, profile)).toEqual({ status: 'blocked', reasons: ['僅限碩、博士班'] });
});

test('normalizes legacy program and prerequisite facts into condition ids', () => {
  expect(profileConditionIds({
    programs: ['innovation'],
    prerequisites: ['statistics'],
  })).toEqual([
    'program:innovation',
    'prerequisite:statistics',
  ]);
});

test('keeps an unanswered required condition in an explicit unknown state', () => {
  const courses = [{
    id: 'analytics',
    title: '商業分析',
    prerequisites: ['statistics'],
  }];
  const definitions = buildConditionDefinitions(courses, [], DEMO_CONDITIONS);

  expect(buildConditionImpacts(courses, definitions, { conditionIds: [] })).toEqual([{
    id: 'prerequisite:statistics',
    label: '修過統計學 3 學分',
    category: 'prerequisite',
    description: '部分量化課程將統計學 3 學分列為先修門檻。',
    source: 'course',
    selected: false,
    state: 'unknown',
    summary: '影響 1 門候選課',
    affectedCourses: [{
      courseId: 'analytics',
      title: '商業分析',
      enforcement: 'required',
      rationale: '須先具備 statistics。',
      consequence: '尚未回答，加入前需確認資格',
    }],
  }]);
});

test('explains the blocking effect of an explicitly rejected required condition', () => {
  const courses = [{
    id: 'analytics',
    title: '商業分析',
    prerequisites: ['statistics'],
  }];
  const definitions = buildConditionDefinitions(courses, [], DEMO_CONDITIONS);
  const [impact] = buildConditionImpacts(courses, definitions, {
    conditionIds: [],
    rejectedConditionIds: ['prerequisite:statistics'],
  });

  expect(impact?.state).toBe('rejected');
  expect(impact?.selected).toBe(false);
  expect(impact?.affectedCourses[0]?.consequence).toBe('不符合時無法直接加入');
});

test('normalizes legacy course programs and prerequisites into required rules', () => {
  expect(rulesForCourse({
    programs: ['innovation'],
    prerequisites: ['statistics'],
  })).toEqual([
    {
      conditionId: 'program:innovation',
      enforcement: 'required',
      rationale: '限具 innovation 相關資格的學生。',
    },
    {
      conditionId: 'prerequisite:statistics',
      enforcement: 'required',
      rationale: '須先具備 statistics。',
    },
  ]);
});

test('discovers course conditions before unique custom conditions with human labels', () => {
  const definitions = buildConditionDefinitions([
    { id: 'agentic', programs: ['innovation'] },
    { id: 'analytics', prerequisites: ['statistics'] },
  ], [
    {
      id: 'program:innovation',
      label: '重複資料',
      category: 'program',
      description: '不應蓋過課程定義',
      source: 'custom',
    },
    {
      id: 'competency:python',
      label: 'Python 基礎',
      category: 'competency',
      description: '我能閱讀 Python 程式',
      source: 'custom',
    },
  ], DEMO_CONDITIONS);

  expect(definitions.map(({ id, label, source }) => ({ id, label, source }))).toEqual([
    { id: 'program:innovation', label: '創新創業學程資格', source: 'course' },
    { id: 'prerequisite:statistics', label: '修過統計學 3 學分', source: 'course' },
    { id: 'competency:python', label: 'Python 基礎', source: 'custom' },
  ]);
});

test('uses labels and explanations supplied by an imported official restriction', () => {
  const definitions = buildConditionDefinitions([{
    id: 'ai-509041001',
    eligibilityRules: [{
      conditionId: 'official-restriction:509041001',
      conditionLabel: '我是歐文系或雙主修學生',
      conditionDescription: '政大官方備註：僅限歐文系及雙主修學生修讀。',
      enforcement: 'required',
      rationale: '僅限歐文系及雙主修學生修讀。',
    }],
  }]);

  expect(definitions[0]).toEqual({
    id: 'official-restriction:509041001',
    label: '我是歐文系或雙主修學生',
    category: 'official-restriction',
    description: '政大官方備註：僅限歐文系及雙主修學生修讀。',
    source: 'course',
  });
});

test('rejects a custom condition without a name', () => {
  expect(validateCustomCondition({
    label: '   ',
    category: 'other',
    description: '',
  }, [])).toEqual({
    field: 'label',
    message: '請輸入條件名稱。',
  });
});

test('rejects a custom condition whose normalized name already exists', () => {
  expect(validateCustomCondition({
    label: 'python 基礎',
    category: 'competency',
    description: '',
  }, [{ id: 'competency:python', label: ' Python   基礎 ' }])).toEqual({
    field: 'label',
    message: '這項條件已經存在。',
  });
});

// 程式碼審查修正：未填年級時不因年級限制擋下（與舊版行為一致）
test('does not block a year-limited course before the student sets their year', () => {
  expect(evaluateEligibility({ minYear: 3 }, { level: 'undergrad' })).toEqual({ status: 'eligible', reasons: [] });
});
