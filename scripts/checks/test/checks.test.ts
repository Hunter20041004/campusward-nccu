import { describe, expect, test } from 'vitest';
import {
  findBrandViolations,
  findHardcodedTerms,
  findPersonalContacts,
  findStudentIds,
  findSyllabusLeaks,
  findUnpinnedWorkflows,
  type SourceFile,
} from '../checks.ts';

const file = (path: string, text: string): SourceFile => ({ path, text });
// 合成學號以拼接產生，避免本測試檔本身被學號檢查擋下。
const fakeStudentId = ['11', '2', '306', '045'].join('');

describe('findHardcodedTerms', () => {
  test.each(['1151', '1152', '115-1', '115-2', '1162'])('flags %s in engine source', (term) => {
    const hits = findHardcodedTerms([file('packages/engine/src/term.ts', `const t = '${term}';`)]);
    expect(hits).toHaveLength(1);
  });

  test('flags terms in web source', () => {
    expect(findHardcodedTerms([file('apps/web/src/App.tsx', 'label="115-2"')])).toHaveLength(1);
  });

  test('ignores data, tests, and docs', () => {
    expect(findHardcodedTerms([
      file('data/snapshots/1151/meta.json', '{"term":"1151"}'),
      file('packages/engine/test/term.test.ts', "parseTerm('1152')"),
      file('docs/plans/x.md', '115-2'),
    ])).toEqual([]);
  });

  test('ignores web tests and test helpers kept next to the source', () => {
    expect(findHardcodedTerms([
      file('apps/web/src/App.test.tsx', "'115-1'"),
      file('apps/web/src/test/fakeCatalog.ts', "'1151'"),
    ])).toEqual([]);
  });

  test('ignores unrelated numbers', () => {
    expect(findHardcodedTerms([file('packages/engine/src/x.ts', 'const max = 1200; const id = 11512;')])).toEqual([]);
  });
});

describe('findStudentIds', () => {
  test('flags a student-id-shaped number without any context', () => {
    const hits = findStudentIds([file('docs/verification/x.json', `{"id":"${fakeStudentId}"}`)]);
    expect(hits).toHaveLength(1);
  });

  test('allows course data directories and synthetic fixtures', () => {
    expect(findStudentIds([
      file('data/snapshots/1151/courses.json', fakeStudentId),
      file('data/syllabi/1151/a.txt', fakeStudentId),
      file('data/corrections/1151.json', fakeStudentId),
      file('packages/engine/test/fixtures/synthetic/rows.ts', fakeStudentId),
    ])).toEqual([]);
  });

  test('does not flag longer digit runs or course codes outside the pattern', () => {
    expect(findStudentIds([file('a.ts', `351026011 ${fakeStudentId}0`)])).toEqual([]);
  });

  test('skips the lockfile', () => {
    expect(findStudentIds([file('package-lock.json', fakeStudentId)])).toEqual([]);
  });
});

describe('findUnpinnedWorkflows', () => {
  const sha = 'a'.repeat(40);
  const ok = `name: ci\npermissions: {}\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v5\n      - uses: ./local-action\n`;

  test('accepts SHA-pinned actions with top-level permissions', () => {
    expect(findUnpinnedWorkflows([file('.github/workflows/ci.yml', ok)])).toEqual([]);
  });

  test('flags tag-pinned actions', () => {
    const text = ok.replace(`@${sha}`, '@v5');
    expect(findUnpinnedWorkflows([file('.github/workflows/ci.yml', text)])).toHaveLength(1);
  });

  test('flags a workflow without top-level permissions', () => {
    const text = ok.replace('permissions: {}\n', '');
    expect(findUnpinnedWorkflows([file('.github/workflows/ci.yml', text)])).toHaveLength(1);
  });

  test('ignores non-workflow files', () => {
    expect(findUnpinnedWorkflows([file('docs/x.yml', 'uses: actions/checkout@v5')])).toEqual([]);
  });
});

describe('findBrandViolations', () => {
  test.each(['Open NCCU', 'opennccu', 'OpenNCCU 合作'])('flags %s in product code', (text) => {
    expect(findBrandViolations([file('apps/web/src/Footer.tsx', text)])).toHaveLength(1);
  });

  test('allows docs to mention the name', () => {
    expect(findBrandViolations([file('docs/specs/x.md', 'Open NCCU')])).toEqual([]);
  });

  test('allows the required disclaimer', () => {
    expect(findBrandViolations([file('apps/web/src/Footer.tsx', '非政大官方服務')])).toEqual([]);
  });
});

// Phase 5：公開庫不得出現手機號碼與電子信箱（全人系統匯出檔含導師信箱、緊急聯絡人電話）。
// 範例以拼接產生，避免本測試檔本身被檢查擋下。
const fakeMobile = ['09', '12-345', '-678'].join('');
const fakeMobile2 = ['098', '765', '4321'].join('');
const fakeEmail = ['teacher', 'nccu.edu.tw'].join('@');
describe('findPersonalContacts', () => {
  test('flags Taiwanese mobile numbers and email addresses', () => {
    const hits = findPersonalContacts([file('docs/notes.md', `導師 ${fakeMobile}，信箱 ${fakeEmail}\n另一支 ${fakeMobile2}`)]);
    expect(hits.map(({ check, line }) => `${check}:${line}`)).toEqual(['phone:1', 'email:1', 'phone:2']);
  });

  test('allows placeholder addresses, npm scopes and bot addresses', () => {
    expect(findPersonalContacts([
      file('apps/web/src/a.ts', "import x from '@campusward/engine'; // student@example.com"),
      file('README.md', 'Co-Authored-By: Claude <noreply@anthropic.com> 與 1234+bot@users.noreply.github.com'),
      file('package-lock.json', `"author": "${['someone', 'real.com'].join('@')}"`),
    ])).toEqual([]);
  });

  test('keeps official course snapshots as published but checks the syllabus corpus', () => {
    expect(findPersonalContacts([file('data/snapshots/1151/courses.json', fakeEmail)])).toEqual([]);
    expect(findPersonalContacts([file('data/syllabi/1151/x.json', fakeEmail)]).map(({ check }) => check)).toEqual(['email']);
  });

  test('digits inside a sha256 hash are not a phone number, but a number next to one still is', () => {
    const hash = `28063326f0b4e8eb54fc69ff5d1dcc06b32469b1577c29ca${['09', '54205040'].join('')}cc4f77`;
    expect(hash).toHaveLength(64);
    expect(findPersonalContacts([file('data/syllabi/1151/corpus.jsonl', `{"hash":"${hash}"}`)])).toEqual([]);
    expect(findPersonalContacts([file('data/syllabi/1151/corpus.jsonl', `{"a":"${fakeMobile}","hash":"${hash}"}`)]).map(({ check }) => check)).toEqual(['phone']);
  });

  test('still flags an address in a mailto link', () => {
    expect(findPersonalContacts([file('README.md', `[寫信](mailto:${fakeEmail})`)]).map(({ check }) => check)).toEqual(['email']);
  });

  test('skips synthetic fixtures and credentials inside URLs', () => {
    expect(findPersonalContacts([
      file('packages/engine/test/fixtures/synthetic/x.json', fakeMobile),
      file('a.ts', `'https://user:pass@${['newdoc', 'nccu.edu.tw'].join('.')}/a' 'https://a.tw@evil.example.com/'`),
    ])).toEqual([]);
  });

  test('does not mistake long digit strings like course codes for phone numbers', () => {
    expect(findPersonalContacts([file('data/x.json', '"900123001" 2026-10-28 09123456789')])).toEqual([]);
  });
});

// 獨立審查修正（2026-11-01 第二輪）：常見的其他寫法也要擋。
test.each([
  ['spaces', ['0912', '345', '678'].join(' ')],
  ['dots', ['0912', '345', '678'].join('.')],
  ['country code', ['+886', '912', '345', '678'].join('-')],
  ['country code without separators', ['+886', '912345678'].join('')],
  ['full-width digits', ['０９１２', '３４５６７８'].join('')],
])('flags a mobile number written with %s', (_, text) => {
  expect(findPersonalContacts([file('data/syllabi/1151/corpus.jsonl', `助教 ${text}`)]).map(({ check }) => check)).toEqual(['phone']);
});

test.each([
  ['a full-width at sign', ['teacher', 'nccu.edu.tw'].join('＠')],
  ['[at]', ['teacher', 'nccu.edu.tw'].join(' [at] ')],
  ['(at)', ['teacher', 'nccu.edu.tw'].join('(at)')],
])('flags an email written with %s', (_, text) => {
  expect(findPersonalContacts([file('data/syllabi/1151/corpus.jsonl', `信箱 ${text}`)]).map(({ check }) => check)).toEqual(['email']);
});

// 獨立審查（2026-11-01）：去個資只換掉聯絡方式時，助教姓名還留在標記旁邊；Classroom 加入碼等同門禁密碼。
// 姓名、加入碼都是虛構的，以拼接產生。
const MARK = '〔聯絡資訊已移除〕';
const fakeCode = ['qw3', 'rty7'].join('');
describe('findSyllabusLeaks', () => {
  test.each([
    ['a TA name before a removed contact', `有問題可以跟助教聯絡: ${['林', '小魚'].join('')}/ ${MARK}`],
    ['a TA name with the contact in brackets', `寄給本課程助教${['王', '大明'].join('')}(${MARK})報名`],
    ['an English TA name', `TA: ${['Amy', 'Test'].join(' ')} (${MARK})`],
    ['a Classroom cjc join code', `https://classroom.google.com/c/QWxQ0zZ9?cjc=${fakeCode}`],
    ['a Classroom code written out', `google classroom 課程網站 (代碼: ${fakeCode})`],
  ])('flags %s', (_, text) => {
    expect(findSyllabusLeaks([file('data/syllabi/1151/corpus.jsonl', text)]).map(({ check }) => check)).toHaveLength(1);
  });

  test.each([
    `助教聯絡: ${MARK}`,
    `助教信箱：${MARK}`,
    `https://classroom.google.com/c/QWxQ0zZ9?cjc=${MARK}`,
    `google classroom (代碼: ${MARK})`,
    '科目代碼: 000211011',
  ])('accepts already-scrubbed text: %s', (text) => {
    expect(findSyllabusLeaks([file('data/syllabi/1151/corpus.jsonl', text)])).toEqual([]);
  });

  test('skips synthetic fixtures', () => {
    expect(findSyllabusLeaks([file('scripts/pipeline/syllabus/test/fixtures/synthetic/contacts.ts', `cjc=${fakeCode}`)])).toEqual([]);
  });
});
