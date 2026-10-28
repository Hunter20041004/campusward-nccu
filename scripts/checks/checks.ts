export interface SourceFile {
  path: string;
  text: string;
}

export interface Violation {
  check: string;
  path: string;
  line: number;
  detail: string;
}

function scan(file: SourceFile, pattern: RegExp, check: string, detail: (match: string) => string): Violation[] {
  const hits: Violation[] = [];
  file.text.split('\n').forEach((lineText, index) => {
    for (const match of lineText.matchAll(pattern)) {
      hits.push({ check, path: file.path, line: index + 1, detail: detail(match[0]) });
    }
  });
  return hits;
}

const PRODUCT_SOURCE = /^(packages\/[^/]+\/src|apps\/[^/]+\/src)\//;
// 網站測試與元件放在一起；測試檔與測試輔助資料夾可以出現學期代碼。
const TEST_SOURCE = /(\.test\.tsx?$|\/src\/test\/)/;

// 學期一律由資料或參數提供（設計第 5 節「不寫死 115-1」）。
const TERM_PATTERN = /(?<![\d-])11\d-?[12](?![\d-])/g;

export function findHardcodedTerms(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => PRODUCT_SOURCE.test(file.path) && !TEST_SOURCE.test(file.path))
    .flatMap((file) => scan(file, TERM_PATTERN, 'hardcoded-term', (term) => `寫死學期 ${term}`));
}

// 政大學號樣式：1[01] 開頭共 9 碼。公開儲存庫不得出現（設計第 10 節）；課程資料目錄與合成 fixture 例外。
const STUDENT_ID_PATTERN = /(?<!\d)1[01]\d{7}(?!\d)/g;
const STUDENT_ID_ALLOWED = [
  /^data\/(snapshots|syllabi|corrections)\//,
  /\/fixtures\/synthetic\//,
  /(^|\/)package-lock\.json$/,
];

export function findStudentIds(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => !STUDENT_ID_ALLOWED.some((allowed) => allowed.test(file.path)))
    .flatMap((file) => scan(file, STUDENT_ID_PATTERN, 'student-id', () => '疑似學號（9 碼，1[01] 開頭）'));
}

const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const USES_PATTERN = /^\s*-?\s*uses:\s*([^\s#]+)/;

// 公開庫的 CI 供應鏈：外部 action 一律釘 40 碼 commit SHA，且宣告最小權限。
export function findUnpinnedWorkflows(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => WORKFLOW_FILE.test(file.path))
    .flatMap((file) => {
      const hits: Violation[] = [];
      if (!/^permissions:/m.test(file.text)) {
        hits.push({ check: 'workflow-permissions', path: file.path, line: 1, detail: '缺少頂層 permissions' });
      }
      file.text.split('\n').forEach((lineText, index) => {
        const ref = USES_PATTERN.exec(lineText)?.[1];
        if (!ref || ref.startsWith('./')) return;
        if (!/@[0-9a-f]{40}$/.test(ref)) {
          hits.push({ check: 'workflow-pinning', path: file.path, line: index + 1, detail: `未釘 SHA：${ref}` });
        }
      });
      return hits;
    });
}

// 不使用 Open NCCU 名稱或暗示合作（設計第 7 節）。文件可以提及。
const BRAND_PATTERN = /open\s*nccu/gi;

export function findBrandViolations(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => /^(apps|packages)\//.test(file.path))
    .flatMap((file) => scan(file, BRAND_PATTERN, 'brand', (name) => `產品程式出現 ${name}`));
}
