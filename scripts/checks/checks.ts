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

// 手機號碼與電子信箱（計畫 Phase 5）：全人系統匯出檔含導師信箱與聯絡人電話，公開庫一律不出現。
// 允許：保留給範例的網域、機器人與無回信地址；package-lock 內的套件作者資訊不檢查。
// 官方課程快照照原文保存（備註裡有承辦的加簽信箱，學校已公開）；課綱語料不在此列，管線本身要移除。
// 比對前先 NFKC（全形數字、全形＠變半形）；手機接受 0 或 +886 開頭，中間可用空白、點或連字號分隔。
const PHONE_PATTERN = /(?<![\d-])(?:\+?886[\s.-]?|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?![\d-])/g;
const EMAIL_PATTERN = /(?<![\w.%+-])[\w.%+-]+(?:@|\s*[[(]\s*at\s*[\])]\s*)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gi;
const EMAIL_ALLOWED = /@(?:[\w-]+\.)*example(?:\.(?:com|org|net|test))?$|@users\.noreply\.github\.com$|^noreply@/i;
const SHA256_HEX = /(?<![0-9A-Za-z])[0-9a-f]{64}(?![0-9A-Za-z])/g;
const CONTACT_SKIPPED = /(^|\/)package-lock\.json$|\/fixtures\/synthetic\/|^data\/(snapshots|corrections)\//;

export function findPersonalContacts(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => !CONTACT_SKIPPED.test(file.path))
    .flatMap((file) => {
      const hits: Violation[] = [];
      file.text.split('\n').forEach((rawLine, index) => {
        // 課綱語料每列帶原始頁的 sha256；十六進位雜湊裡的數字段不是電話，比對前以等長空白蓋掉，再 NFKC。
        const lineText = rawLine.replace(SHA256_HEX, (hash) => ' '.repeat(hash.length)).normalize('NFKC');
        const found: { at: number; hit: Violation }[] = [];
        for (const match of lineText.matchAll(PHONE_PATTERN)) {
          found.push({ at: match.index, hit: { check: 'phone', path: file.path, line: index + 1, detail: '疑似手機號碼' } });
        }
        for (const match of lineText.matchAll(EMAIL_PATTERN)) {
          // 網址裡的帳密（https://user:pass@host）不算信箱；mailto: 仍要檢查。
          const address = match[0].replace(/\s*[[(]\s*at\s*[\])]\s*/i, '@');
          if (EMAIL_ALLOWED.test(address) || /\/\/[^\s/]*$/.test(lineText.slice(0, match.index))) continue;
          found.push({ at: match.index, hit: { check: 'email', path: file.path, line: index + 1, detail: `疑似電子信箱 ${address.replace(/^[^@]+/, '…')}` } });
        }
        hits.push(...found.sort((a, b) => a.at - b.at).map(({ hit }) => hit));
      });
      return hits;
    });
}
