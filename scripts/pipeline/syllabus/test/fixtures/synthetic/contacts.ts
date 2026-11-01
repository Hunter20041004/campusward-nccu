// 合成的聯絡資訊範例（全部虛構），給去個資規則的測試用。放在 fixtures/synthetic/ 下，專案的電話／信箱檢查會略過。
// [規則, 原文, 去除後應得]
const M = '〔聯絡資訊已移除〕';

export const POSITIVE_CASES: readonly (readonly [string, string, string])[] = [
  ['meeting_link', '線上課程 https://meet.google.com/abc-defg-hij 請準時', `線上課程 ${M} 請準時`],
  ['meeting_link', '會議室：nccu.zoom.us/j/1234567890?pwd=abc）', `會議室：${M}）`],
  ['meeting_link', 'https://teams.microsoft.com/l/meetup-join/xyz 每週上線', `${M} 每週上線`],
  ['line', '加入群組 https://line.me/ti/g/AbCdEf12', `加入群組 ${M}`],
  ['line', 'LINE ID: test_teacher01', M],
  ['line', '請加 Line：@abc123 聯繫', `請加 ${M} 聯繫`],
  ['social', '社團 https://www.facebook.com/groups/testgroup 公告', `社團 ${M} 公告`],
  ['social', 'IG帳號：test.account', M],
  ['social', 'Discord ID: tester_99', M],
  ['email', '聯絡：teacher.test@nccu.edu.tw', `聯絡：${M}`],
  ['email', '寄到 tt＠g.nccu.edu.tw 即可', `寄到 ${M} 即可`],
  ['email', 'mailto:someone@gmail.com', M],
  ['email', 'abc @ mail . nccu . edu . tw', M],
  ['email_obfuscated', 'teacher (at) nccu.edu.tw', M],
  ['email_obfuscated', 'abc at gmail dot com', M],
  ['email_obfuscated', 'abc[at]nccu[dot]edu[dot]tw', M],
  ['phone_labelled', '電話：02-1234-5678', M],
  ['phone_labelled', 'Tel: (02) 2222 3333 #100', M],
  ['phone_labelled', '手機 0912 345 678', M],
  ['mobile', '有事打 0912-345-678 找我', `有事打 ${M} 找我`],
  ['mobile', '+886 912 345 678', M],
  ['mobile', '0912345678', M],
  ['landline', '(02)2345-6789', M],
  ['landline', '辦公室 02-2345-6789', `辦公室 ${M}`],
  ['landline', '+886-2-2345-6789', M],
  ['landline', '0223456789', M],
  ['nccu_local', '校內 2939-0000', `校內 ${M}`],
  ['nccu_local', '82370000', M],
  ['extension', '分機 12345', M],
  ['extension', '總機 ext. 6789', `總機 ${M}`],
  ['extension', '請撥 #62345', `請撥 ${M}`],
  ['extension', '(總機) 轉6789', `(總機) ${M}`],
  ['student_id', 'Student ID: 987654321', M],
  ['student_id', '學號：987654321', M],
  // 參考規則之外補的一條：同一段文字提到學號時，裸寫的 9 碼學號樣式（1[01] 開頭）也移除。
  ['student_id_context', '檔名註明學號(如109999999王小明_期中考.xlsx)', `檔名註明學號(如${M}王小明_期中考.xlsx)`],
  ['student_id_context', '命名：系級學號—姓名，例如「作業—110000000—台灣」', `命名：系級學號—姓名，例如「作業—${M}—台灣」`],
  // 參考規則之外補的一條：分享連結的存取金鑰（Google 雲端的 resourcekey 等）等同密碼，只移除金鑰值。
  // 金鑰值以拼接產生，避免提交前祕密掃描把合成範例當成真的金鑰。
  ['link_key', `講義 https://drive.google.com/drive/folders/abc?resourcekey=${['0', 'AbCdEfGhIjKlMn'].join('-')} 下載`, `講義 https://drive.google.com/drive/folders/abc?resourcekey=${M} 下載`],
  ['link_key', 'https://example.com/f?id=1&token=xyz123&lang=zh', `https://example.com/f?id=1&token=${M}&lang=zh`],
  // 獨立審查補的規則（2026-11-01）：Classroom 的加入碼（cjc 參數、「代碼：」）等同門禁密碼。
  ['link_key', '課程網站 https://classroom.google.com/c/QWxQ0zZ9?cjc=qw3rty7 加入', `課程網站 https://classroom.google.com/c/QWxQ0zZ9?cjc=${M} 加入`],
  ['classroom_code', '請加入 Google Classroom 課程網站 (代碼: qw3rty7)', `請加入 Google Classroom 課程網站 (代碼: ${M})`],
  ['classroom_code', '課程邀請碼：ab12cd', `課程邀請碼：${M}`],
  // 沒有區碼也沒有「電話」標籤的 8 碼市話：前後文提到研究室、影印、聯絡等字時才移除。
  ['landline_context', '影印店(臺北市測試路一段1號1樓; 27770000, 營業到晚上)', `影印店(臺北市測試路一段1號1樓; ${M}, 營業到晚上)`],
  ['landline_context', '研究室 2777-0001', `研究室 ${M}`],
  // 助教（多半是研究生）的姓名緊接在被移除的聯絡方式旁邊時，姓名一起移除。
  ['ta_name', '有問題可以跟這門課的助教聯絡: 林小魚/ fish.test@nccu.edu.tw (Newest)!', `有問題可以跟這門課的助教聯絡: ${M} (Newest)!`],
  ['ta_name', '請寄給本課程助教王大明(daming.test@gmail.com)進行報名登記', `請寄給本課程助教${M}進行報名登記`],
  ['ta_name', '教學助理：陳小華，信箱 hua.test@nccu.edu.tw', `教學助理：${M}`],
  ['ta_name', 'TA: Amy Test (amy.test@nccu.edu.tw)', `TA: ${M}`],
  // 第四輪審查（2026-11-01）：「TA」後面接中文姓名、表格以「 | 」分隔時也要移除。
  ['ta_name', 'TA: 王小明 (ming.test@nccu.edu.tw)', `TA: ${M}`],
  ['ta_name', 'T.A.：王小明，ming.test@nccu.edu.tw', `T.A.：${M}`],
  ['ta_name', 'Teaching Assistant 王小明 ming.test@nccu.edu.tw', `Teaching Assistant ${M}`],
  ['ta_name', '助教 | 王小明 | ming.test@nccu.edu.tw', `助教 | ${M}`],
  // 助教（研究生）姓名前面寫了年級或身分（碩二、博班、碩士生），即使旁邊沒有聯絡方式也移除：年級身分連同姓名拿掉，只留「助教」。
  ['ta_name_status', '由助教碩二王小魚代為播放', '由助教代為播放'],
  ['ta_name_status', '感謝 TA 博班王大明同學', '感謝 TA 同學'],
  ['ta_name_status', '教學助理：測試所碩士生陳小華負責批改', '教學助理：負責批改'],
  ['ta_name_status', '助教博三林明，每週答疑', '助教，每週答疑'],
  // Classroom 的加入碼只寫成「#」加 6～8 碼英數（沒有「代碼」標籤）：同一段提到 Classroom 時才移除。
  ['classroom_code', '加入本課程Google Classroom【測試課 2030-31】((#ab12cd34)', `加入本課程Google Classroom【測試課 2030-31】((${M})`],
  ['classroom_code', 'Google Classroom Participation #zx9qw8er 10%', `Google Classroom Participation ${M} 10%`],
];

/** 沒提到學號時，1[01] 開頭的 9 碼數字多半是課號，保留。 */
export const COURSE_CODE_WITHOUT_STUDENT_ID = '先修 101999999 或 110000000 課程';

/** 相鄰的移除標記合併成一個。 */
export const COLLAPSE_CASE = ['Email: a.test@nccu.edu.tw, Tel: 02-1234-5678', `Email: ${M}`] as const;

/** 不得被移除的文字：課號、年份、日期、學分、百分比、時間、書號、版本。 */
export const NEGATIVE_CASES: readonly string[] = [
  '課號 000211011，3 學分',
  '2026 年第 12 週',
  '2026/11/01 期中考',
  '11/15（六）補課',
  '期中報告 40%，期末考 60%',
  '下午 2:10-5:00 上課',
  'ISBN 978-986-123-456-7',
  '游泳 1500 公尺、馬拉松 42.195 公里',
  'Python 3.12 與 Node 24',
  'deadline: 12/31 前繳交',
  '線上 online: Moodle',
  '第 3 章 pp. 123-456',
  '課程代碼 753001001 與 000211011',
  'https://docs.google.com/document/d/abc/edit?usp=sharing',
  'key=value 是設定檔寫法',
  // 頁碼、字數、DOI 裡的 8 碼數字不是電話（即使附近有「研究室」）。
  '研究室推薦閱讀 pp. 2289-2301',
  '研究室報告 2500-3000 字',
  '聯絡研究的 doi:10.1000/j.2345-6789',
  '期中考 20261003 舉行',
  // 沒提到 Classroom 或加入碼時，「代碼」後面的英數字保留。
  '科目代碼: 000211011',
  '課程代碼: ABC1234',
  // 助教旁邊沒有被移除的聯絡方式時，不動。
  '助教會在課堂上公布分組名單',
  // 沒有年級或身分詞時，助教後面的一般文字不動；沒提到 Classroom 時，「#」加英數（章節、色碼）保留。
  '助教碩士論文指導原則',
  'TA 時間另行公告',
  '習題 #ab12cd34 與 #x1y2z3',
  '研究室推薦 Classroom 文化讀本第 #3 章',
];

/** 「助教信箱：〔聯絡資訊已移除〕」的「信箱」不是人名，不能被當成姓名移除。 */
export const TA_NOT_A_NAME = `助教信箱：${M}`;
