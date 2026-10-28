import { describe, expect, test } from 'vitest';
import {
  findBrandViolations,
  findHardcodedTerms,
  findStudentIds,
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
