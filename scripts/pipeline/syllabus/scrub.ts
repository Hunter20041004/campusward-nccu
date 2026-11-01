// 課綱語料去個資（計畫 4.5 第 2 節）：所有保留下來的文字欄位都要過一遍。
// 規則照 2026-11-01 語料調查在 115-1 全量頁面上校正過的參考實作逐條移植（scrub.py），順序有意義：
// 先移除網址與信箱，再移除電話，避免電話規則把網址或信箱切成半截。
// 移植差異只有一處：Python 原文在字元類別裡寫了 \"，JavaScript 的 u 旗標不接受這種多餘跳脫，改寫成 "，意義相同。

export const MARK = '〔聯絡資訊已移除〕';

const rule = (name: string, ...parts: string[]) => [name, new RegExp(parts.join(''), 'giu')] as const;

// 每條規則以 String.raw 照抄參考實作的原文（相鄰字串即 Python 的隱式串接）。
export const RULES: readonly (readonly [string, RegExp])[] = Object.freeze([
  rule('meeting_link',
    String.raw`(?:https?://)?(?:[a-z0-9\-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com)/[^\s<>"'）)」]+`),
  rule('line',
    String.raw`(?:https?://)?(?:line\.me|lin\.ee)/[^\s<>"'）)」]+`,
    String.raw`|(?<![A-Za-z0-9])line\s*(?:id|帳號|帳戶)?\s*[:：]\s*@?[A-Za-z0-9._\-]{3,}`),
  rule('social',
    String.raw`(?:https?://)?(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.me|instagram\.com|t\.me|discord\.gg|discord\.com/invite|wa\.me)/[^\s<>"'）)」]+`,
    String.raw`|(?<![A-Za-z0-9])(?:wechat|微信|telegram|discord|whatsapp|ig|instagram)\s*(?:id|帳號)\s*[:：]\s*@?[A-Za-z0-9._\-]{3,}`),
  rule('email',
    String.raw`(?:mailto:)?[A-Za-z0-9][A-Za-z0-9._%+\-]*\s?[@＠]\s?[A-Za-z0-9\-]+(?:\s?[.．]\s?[A-Za-z0-9\-]+)+`),
  rule('email_obfuscated',
    String.raw`[A-Za-z0-9][A-Za-z0-9._%+\-]*\s*(?:[(\[（［{]\s*at\s*[)\]）］}]|\s+at\s+(?=(?:g\.)?nccu|gmail|yahoo|hotmail|outlook|mail))\s*`,
    String.raw`[A-Za-z0-9\-]+(?:\s*(?:[.．]|[(\[（［{]\s*dot\s*[)\]）］}]|\s+dot\s+)\s*[A-Za-z0-9\-]+)+`),
  rule('phone_labelled',
    String.raw`(?:電話|聯絡電話|手機|行動電話|tel|phone|mobile|cell)\s*(?:no\.?|number)?\s*[:：]?\s*\+?[\d(（][\d\s\-()（）#＃~]{6,}\d`),
  rule('mobile',
    String.raw`(?<!\d)(?:[(（]?\+?886[)）]?[\s\-]?|0)9\d{2}[\s\-.．]?\d{3}[\s\-.．]?\d{3}(?!\d)`),
  rule('landline',
    String.raw`(?<!\d)(?:[(（]?\+?886[)）]?[\s\-]?[(（]?0?[2-8][)）]?[\s\-]?|[(（]0[2-8]\d?[)）]\s?|0[2-8]\d?[\s\-])\d{3,4}[\s\-]?\d{3,4}(?!\d)`,
    String.raw`|(?<!\d)02\d{8}(?!\d)`),
  rule('nccu_local', String.raw`(?<!\d)(?:2939|2938|8237)[\s\-]?\d{4}(?!\d)`),
  rule('extension',
    String.raw`(?:分機|ext\.?|extension)\s*[:：#＃]?\s*\d{3,6}(?!\d)|[#＃]\s?\d{4,6}(?!\d)|(?<=[\d)）\s])轉\s?\d{3,6}(?!\d)`),
  rule('student_id', String.raw`(?:學號|student\s*(?:id|no\.?|number))\s*[:：]?\s*\d{8,9}(?!\d)`),
]);

const escaped = MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ADJACENT_MARKS = new RegExp(`(?:${escaped}[\\s,;，；、/]*){2,}`, 'gu');

/**
 * 參考規則之外補的規則（115-1 實跑時提交前祕密掃描發現）：分享連結裡的存取金鑰等同密碼，
 * 只把金鑰值換掉，網址其餘部分保留。
 */
export const EXTRA_RULES: readonly (readonly [string, RegExp, string?])[] = Object.freeze([
  // cjc／invite：Google Classroom 等課程空間的加入碼（獨立審查 2026-11-01 補）。
  rule('link_key', String.raw`(?<=[?&](?:resourcekey|token|access_token|pwd|passcode|sig|key|cjc|invite|invite_code)=)(?!〔)[^&\s<>"'）)」]+`),
  // 沒有區碼也沒有標籤的 8 碼台北市話（2[2-9] 開頭）。只在前面 30 字內提到電話、研究室、影印、聯絡等字時才移除，
  // 頁碼（pp. 2289-2301）、字數（2500-3000 字）、DOI（.2345-6789）、日期（20261003）都不動。
  rule('landline_context',
    String.raw`(?<=(?:電話|tel|phone|聯絡|聯繫|研究室|辦公室|影印|傳真|fax|總機|撥打|call)[^\n。]{0,30}?)`,
    String.raw`(?<![\d\-./]|pp?\.\s?)2[2-9]\d{2}[\s\-]?\d{4}(?![\d\-]|\s*(?:字|頁|words?|pages?))`),
  // 助教（多半是研究生）的姓名緊接在已移除的聯絡方式旁邊時，連同姓名換成一個標記（聯絡方式已在前面換成標記）。
  // 「信箱、電話」這類詞不是姓名；英文名須大寫開頭，所以這條不加 i 旗標。
  // 中文姓名前面可以是「助教／教學助理」或「TA／T.A.／Teaching Assistant」；分隔符號含表格的「|」（第四輪審查 2026-11-01）。
  ['ta_name', new RegExp([
    String.raw`(?:(?<=(?:助教|教學助理)[^\n。；;〔〕]{0,8}?|\b(?:TA|T\.A\.|Teaching [Aa]ssistant)s?\s*[:：|]?\s*)`,
    String.raw`(?!信箱|郵件|電郵|電話|手機|聯絡|聯繫|辦公室|研究室|專線|分機|帳號)\p{Script=Han}{2,4}(?:同學|先生|小姐)?`,
    String.raw`|(?<=\b(?:TA|T\.A\.|Teaching [Aa]ssistant)s?\s*[:：]?\s*)[A-Z][A-Za-z'\-]+(?:[ \-][A-Z][A-Za-z'\-]+){0,3})`,
    String.raw`(?=\s*(?:[/:：,，、|]\s*)?(?:(?:信箱|電子郵件|[Ee]-?mail|電話|手機|聯絡方式)\s*[:：]?\s*)?[(（]?\s*${MARK})`,
    String.raw`\s*(?:[/:：,，、|]\s*)?(?:(?:信箱|電子郵件|[Ee]-?mail|電話|手機|聯絡方式)\s*[:：]?\s*)?(?:[(（]\s*${MARK}\s*[)）]?|${MARK})`,
  ].join(''), 'gu')],
  // 助教姓名前面寫了年級或身分（碩二、博班、碩士生，前面可帶系所）時，旁邊沒有聯絡方式也是在點名研究生：
  // 年級身分連同姓名拿掉，只留「助教／TA」（「由助教碩二○○○代為播放」→「由助教代為播放」）。第四輪審查 2026-11-01。
  // 姓名取 2～3 字，後面要接常見的接續詞或非漢字；都接不上時取 3 字（台灣姓名多為 3 字）。
  ['ta_name_status', new RegExp([
    String.raw`(?<=(?:助教|教學助理|\bTAs?|\bT\.A\.|\bTeaching [Aa]ssistants?)\s*[:：]?\s*)`,
    String.raw`(?:\p{Script=Han}{1,8}?[系所]\s*)?(?:碩[一二三四]|博[一二三四五六七]|碩班|博班|碩士班|博士班|碩士生|博士生)\s*`,
    String.raw`(?:\p{Script=Han}{2,3}?(?=同學|代為|協助|負責|擔任|帶領|主持|講解|說明|批改|[會將於在和與及的]|[^\p{Script=Han}]|$)|\p{Script=Han}{3})`,
  ].join(''), 'gu'), ''],
]);

/** Classroom 的「代碼：〈加入碼〉」：同一段文字提到 Classroom 或加入碼時才移除，避免誤刪一般的課程代碼。 */
export const CLASSROOM_CODE_RULE = 'classroom_code';
const CLASSROOM_MENTION = /classroom|邀請碼|加入碼|class\s*code|join\s*code/iu;
const CLASSROOM_CODE = /(?<=(?:代碼|邀請碼|加入碼|課程碼|class\s*code|join\s*code)\s*[:：]?\s*)(?!〔)(?=[a-z0-9]{0,7}[a-z])[a-z0-9]{6,8}(?![a-z0-9])/giu;
/**
 * 只寫成「#」加 6～8 碼英數（同時有字母和數字）、前面沒有「代碼」標籤的加入碼：
 * 同樣只在提到 Classroom 的段落移除。要在其他規則之前跑，分機規則（#1234）才不會把以數字開頭的碼切成兩半。
 */
const CLASSROOM_HASH_CODE = /(?<![A-Za-z0-9&/])[#＃]\s?(?=[a-z0-9]{0,7}[a-z])(?=[a-z0-9]{0,7}\d)[a-z0-9]{6,8}(?![a-z0-9])/giu;

export const STUDENT_ID_CONTEXT_RULE = 'student_id_context';
const STUDENT_ID_MENTION = /學號|student\s*(?:id|no\.?|number)/iu;
const BARE_STUDENT_ID = /(?<!\d)1[01]\d{7}(?!\d)/gu;

export type ScrubHits = Record<string, number>;

export function scrub(input: string): { text: string; hits: ScrubHits } {
  const hits: ScrubHits = {};
  if (!input) return { text: input, hits };
  let text = input;
  const classroom = CLASSROOM_MENTION.test(input);
  let classroomCodes = 0;
  if (classroom) text = text.replace(CLASSROOM_HASH_CODE, () => { classroomCodes += 1; return MARK; });
  for (const [name, pattern, replacement = MARK] of [...RULES, ...EXTRA_RULES]) {
    let count = 0;
    text = text.replace(pattern, () => { count += 1; return replacement; });
    if (count) hits[name] = count;
  }
  // 參考規則之外補的一條（115-1 實跑發現）：老師舉例檔名時會裸寫學號（「學號(如1xxxxxxxx王小魚.xlsx)」），
  // 前面沒有緊接標籤，student_id 抓不到。只在同一段文字提到學號時才移除，避免誤刪 1[01] 開頭的課號。
  if (classroom) {
    let count = classroomCodes;
    text = text.replace(CLASSROOM_CODE, () => { count += 1; return MARK; });
    if (count) hits[CLASSROOM_CODE_RULE] = count;
  }
  if (STUDENT_ID_MENTION.test(input)) {
    let count = 0;
    text = text.replace(BARE_STUDENT_ID, () => { count += 1; return MARK; });
    if (count) hits[STUDENT_ID_CONTEXT_RULE] = count;
  }
  return { text: text.replace(ADJACENT_MARKS, MARK), hits };
}

/** 把多次 scrub 的命中數加總；鍵依名稱排序，輸出才會穩定。 */
export function addHits(total: ScrubHits, more: ScrubHits): ScrubHits {
  const merged: ScrubHits = { ...total };
  for (const [name, count] of Object.entries(more)) merged[name] = (merged[name] ?? 0) + count;
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
