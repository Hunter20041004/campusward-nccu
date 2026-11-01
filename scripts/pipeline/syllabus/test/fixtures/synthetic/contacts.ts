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
];

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
];
