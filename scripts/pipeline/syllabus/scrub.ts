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
export const EXTRA_RULES: readonly (readonly [string, RegExp])[] = Object.freeze([
  rule('link_key', String.raw`(?<=[?&](?:resourcekey|token|access_token|pwd|passcode|sig|key)=)(?!〔)[^&\s<>"'）)」]+`),
]);

export const STUDENT_ID_CONTEXT_RULE = 'student_id_context';
const STUDENT_ID_MENTION = /學號|student\s*(?:id|no\.?|number)/iu;
const BARE_STUDENT_ID = /(?<!\d)1[01]\d{7}(?!\d)/gu;

export type ScrubHits = Record<string, number>;

export function scrub(input: string): { text: string; hits: ScrubHits } {
  const hits: ScrubHits = {};
  if (!input) return { text: input, hits };
  let text = input;
  for (const [name, pattern] of [...RULES, ...EXTRA_RULES]) {
    let count = 0;
    text = text.replace(pattern, () => { count += 1; return MARK; });
    if (count) hits[name] = count;
  }
  // 參考規則之外補的一條（115-1 實跑發現）：老師舉例檔名時會裸寫學號（「學號(如1xxxxxxxx王小魚.xlsx)」），
  // 前面沒有緊接標籤，student_id 抓不到。只在同一段文字提到學號時才移除，避免誤刪 1[01] 開頭的課號。
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
