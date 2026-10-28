import { expect, test } from 'vitest';
import { classifyOfficialNotes } from '../src/official/notes.ts';

test('keeps language and course classifications out of eligibility rules', () => {
  const classified = classifyOfficialNotes({
    courseCode: '703055001',
    restrictionText: '英語授課。；傳播類課程；本課程為112/113級群C課程；日文系擴大輔系課程',
  });

  expect(classified.eligibilityRules).toEqual([]);
  expect(classified.deliveryNotes).toEqual(['英語授課']);
  expect(classified.programTags).toEqual([
    '傳播類課程',
    '本課程為112/113級群C課程',
    '日文系擴大輔系課程',
  ]);
});

test('separates TAICA delivery, event, and program notes without making a checkbox', () => {
  const classified = classifyOfficialNotes({
    courseCode: '070426001',
    restrictionText: '【臺灣大專院校人工智慧學程聯盟課程】1.TAICA主導課程，北科大韓秉軒老師授課。2.遠距上課每週四13:10-16:00，使用NTUCOOL平台。3.12/26共同展示交流期末成果。4.選課前務必詳閱教學大綱，需於本校選課、不可跨校選課。本課程對應AI自然語言學分學程。',
  });

  expect(classified.eligibilityRules).toEqual([]);
  expect(classified.deliveryNotes.length).toBe(1);
  expect(classified.deliveryNotes[0]).toMatch(/遠距上課.*NTUCOOL/);
  expect(classified.examEvents).toEqual([{ date: '12/26', label: '共同展示交流期末成果' }]);
  expect(classified.programTags.some((note) => note.includes('TAICA主導課程'))).toBeTruthy();
  expect(classified.programTags.some((note) => note.includes('AI自然語言學分學程'))).toBeTruthy();
});

test('creates a concise required rule only for an explicit enrollment restriction', () => {
  const classified = classifyOfficialNotes({
    courseCode: '509041001',
    restrictionText: '僅限歐文系及雙主修學生修讀。',
  });

  expect(classified.eligibilityRules).toEqual([{
    conditionId: 'official-restriction:509041001',
    conditionLabel: '我是歐文系或雙主修學生',
    conditionDescription: '政大官方限制：僅限歐文系及雙主修學生修讀',
    enforcement: 'required',
    rationale: '僅限歐文系及雙主修學生修讀',
    source: 'nccu-official',
    confidence: 'high',
  }]);
});

test('turns an exclusive audience note into one condition while preserving course policies', () => {
  const classified = classifyOfficialNotes({
    courseCode: '088E54011',
    restrictionText: '1.僅供外籍交換生與外籍學位生修習，外籍學位生修此課學分不予以採計。2.第一堂課務必出席，否則將予以退選。3.課堂抽點名未到逾12小時，該科將以零分計算。',
  });

  expect(classified.eligibilityRules).toEqual([{
    conditionId: 'official-restriction:088E54011',
    conditionLabel: '我是外籍交換生或外籍學位生',
    conditionDescription: '政大官方限制：僅供外籍交換生與外籍學位生修習',
    enforcement: 'required',
    rationale: '僅供外籍交換生與外籍學位生修習',
    source: 'nccu-official',
    confidence: 'high',
  }]);
  expect(classified.informationNotes).toEqual([
    '外籍學位生修此課學分不予以採計',
    '第一堂課務必出席，否則將予以退選',
    '課堂抽點名未到逾12小時，該科將以零分計算',
  ]);
});

test('keeps a direct department limit as a required rule', () => {
  const [rule] = classifyOfficialNotes({
    courseCode: '123456001',
    restrictionText: '限本系學生',
  }).eligibilityRules;

  expect(rule?.conditionLabel).toBe('我符合：限本系學生');
  expect(rule?.enforcement).toBe('required');
});

test('summarizes alternative language prerequisites as one required rule', () => {
  const restrictionText = '須先修習學士班日文（一）、（二）其中一門，或曾在大學修習日文語文 4 學分以上，或通過日本語能力試驗 N3 以上，始得修習本課程';
  const [rule] = classifyOfficialNotes({
    courseCode: '651171001',
    restrictionText,
  }).eligibilityRules;

  expect(rule?.conditionLabel).toBe('我符合本課程任一項日文先修資格');
  expect(rule?.rationale).toBe(restrictionText);
});

test('turns one blocked prerequisite course into a required condition', () => {
  const classified = classifyOfficialNotes({
    courseCode: '303033011',
    restrictionText: '擋修中會(二)。',
  });

  expect(classified.eligibilityRules).toEqual([{
    conditionId: 'prerequisite-course:中會(二)',
    conditionLabel: '我修過中會(二)',
    conditionDescription: '政大官方擋修：沒修過中會(二)的話，選課系統會擋下這門課。',
    enforcement: 'required',
    rationale: '官方擋修：須先修過中會(二)',
    source: 'nccu-official',
    confidence: 'high',
  }]);
});

test('turns multiple blocked courses into normalized prerequisite conditions', () => {
  const classified = classifyOfficialNotes({
    courseCode: '303002071',
    restrictionText: '會二甲，擋修初會(一)、初會（二），擋修者請勿選修，不簽同意修課單。',
  });

  expect(classified.eligibilityRules.map(({ conditionId }) => conditionId)).toEqual(['prerequisite-course:初會(一)', 'prerequisite-course:初會(二)']);
});

test('does not turn blocked-enrollment process notes into course conditions', () => {
  const classified = classifyOfficialNotes({
    courseCode: '000000001',
    restrictionText: '如被擋修，請於加退選結束前將證明寄給助教，設定允許擋修後，方得於系統上選課',
  });

  expect(classified.eligibilityRules.some(({ conditionId }) => (
      conditionId.startsWith('prerequisite-course:')
    ))).toBe(false);
});

test('keeps classifying other information in a blocked prerequisite note', () => {
  const classified = classifyOfficialNotes({
    courseCode: '303002091',
    restrictionText: '擋修初會（二）,英語授課，ETP優先。',
  });

  expect(classified.eligibilityRules.map(({ conditionId }) => conditionId)).toEqual(['prerequisite-course:初會(二)']);
  expect(classified.deliveryNotes).toEqual(['擋修初會（二）,英語授課，ETP優先']);
});
