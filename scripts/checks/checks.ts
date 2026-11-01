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

// 課綱語料的第二道防線（獨立審查 2026-11-01）：管線去個資只換掉聯絡方式時，助教姓名會留在標記旁邊；
// Google Classroom 的加入碼（cjc 參數、「代碼：」）等同門禁密碼。這裡獨立比對，不沿用管線的規則。
const REMOVED = '〔聯絡資訊已移除〕';
// 第四輪審查（2026-11-01）補：「TA／T.A.」後接中文姓名、表格的「|」分隔；姓名前寫了年級身分（碩二、博班）時，
// 旁邊沒有標記也算；Classroom 段落裡「#」加 6～8 碼英數的加入碼；前後文提到電話、研究室等字的 8 碼裸市話。
const TA_WORD = String.raw`(?:助教|教學助理|\bTAs?\b|\bT\.A\.|\bTeaching [Aa]ssistants?)`;
const TA_NAME_PATTERNS = [
  new RegExp(String.raw`(?:助教|教學助理|\bTAs?\b|\bT\.A\.|\bTeaching [Aa]ssistants?)[^\n。；;〔〕"]{0,8}?(?!信箱|郵件|電郵|電話|手機|聯絡|聯繫|辦公室|研究室)\p{Script=Han}{2,4}\s*[/:：,，、|(（]?\s*${REMOVED}`, 'gu'),
  new RegExp(String.raw`\b(?:TA|Teaching [Aa]ssistant)s?\s*[:：]?\s*[A-Z][A-Za-z'\-]+(?:[ \-][A-Z][A-Za-z'\-]+){0,3}\s*[/:,(（]?\s*${REMOVED}`, 'gu'),
];
const TA_STATUS_NAME = new RegExp(
  String.raw`${TA_WORD}\s*[:：]?\s*(?:\p{Script=Han}{1,8}?[系所]\s*)?(?:碩[一二三四]|博[一二三四五六七]|[碩博]士?班|[碩博]士生)\s*\p{Script=Han}{2}`,
  'gu',
);
const JOIN_CODE_PARAM = /[?&](?:cjc|invite|invite_code)=(?!〔)[A-Za-z0-9]/g;
const CLASSROOM_MENTION = /classroom|邀請碼|加入碼|class\s*code|join\s*code/i;
const CLASSROOM_CODE = /(?:代碼|邀請碼|加入碼|課程碼|class\s*code|join\s*code)\s*[:：]?\s*(?!〔)(?=[A-Za-z0-9]{0,7}[A-Za-z])[A-Za-z0-9]{6,8}(?![A-Za-z0-9])/gi;
const CLASSROOM_HASH_CODE = /(?<![A-Za-z0-9&/])[#＃]\s?(?=[A-Za-z0-9]{0,7}[A-Za-z])(?=[A-Za-z0-9]{0,7}\d)[A-Za-z0-9]{6,8}(?![A-Za-z0-9])/g;
// 沒有區碼的台北 8 碼市話（2[2-9] 開頭），前面 30 字內要有電話、研究室、影印等字；頁碼（pp.）、字數、DOI 不算。
const BARE_LANDLINE = new RegExp(
  String.raw`(?:電話|聯絡|聯繫|研究室|辦公室|影印|傳真|總機|撥打|\b(?:tel|phone|fax|call)\b)[^\n。]{0,30}?`
  + String.raw`(?<![\d\-./]|pp?\.\s?|doi:\S*)2[2-9]\d{2}[\s\-]?\d{4}(?![\d\-]|\s*(?:字|頁|words?|pages?))`,
  'giu',
);

export function findSyllabusLeaks(files: SourceFile[]): Violation[] {
  return files
    .filter((file) => !CONTACT_SKIPPED.test(file.path))
    .flatMap((file) => [
      ...TA_NAME_PATTERNS.flatMap((pattern) => scan(file, pattern, 'ta-name', () => '助教姓名緊接在已移除的聯絡方式旁邊')),
      ...scan(file, TA_STATUS_NAME, 'ta-name', () => '助教姓名前面寫了年級或身分'),
      ...scan(file, JOIN_CODE_PARAM, 'join-code', () => '網址帶課程空間加入碼'),
      ...file.text.split('\n').flatMap((lineText, index) => (CLASSROOM_MENTION.test(lineText)
        ? [...lineText.matchAll(CLASSROOM_CODE), ...lineText.matchAll(CLASSROOM_HASH_CODE)]
          .map(() => ({ check: 'join-code', path: file.path, line: index + 1, detail: 'Classroom 加入碼' }))
        : [])),
      ...scan(file, BARE_LANDLINE, 'landline', () => '疑似沒有區碼的市話'),
    ]);
}
