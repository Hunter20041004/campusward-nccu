// 合成的官方查詢回傳列：欄位名稱與格式照 es.nccu.edu.tw 實際回傳（2026-10-28 實測 31 欄），內容為虛構。
export const TERM = { year: 115, semester: 1 } as const;

export function officialRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    y: '115',
    s: '1',
    subNum: '900123001',
    subNam: '合成課程概論',
    teaNam: '王合成',
    subPoint: '3.0',
    subTime: '四D56',
    subClassroom: '綜合900101',
    subGde: '合成系',
    subKind: '必修',
    smtQty: '單學期科目',
    gdeType: '學士班',
    pay: '免費',
    core: '否',
    emiType: '否',
    lmtKind: '',
    langTpe: '中文',
    tranTpe: '一般',
    far: '無資料',
    note: '＠備註:無',
    gdeTpe: '否',
    gdeTpeMsg: '',
    info: '＠異動資訊:無',
    isTrace: '0',
    subOdr: '513',
    teaSchmUrl: 'https://newdoc.nccu.edu.tw/teaschm/1151/schmPrv.jsp-yy=115&smt=1&num=900123&gop=00&s=1.html',
    teaExpUrl: 'https://newdoc.nccu.edu.tw/teaschm/1151/teaExpC.jsp-yy=115&smt=1&num=900123&gop=00&s=1.htm',
    subSetUrl: 'https://newdoc.nccu.edu.tw/teaschm/1151/setC.jsp-yy=115&smt=1&num=900123&gop=00&s=1&willtpe=1.htm',
    subRemainUrl: 'https://selectcourse.nccu.edu.tw/remain/goGenDetail.aspx?view=SYNTHETIC',
    subUnitRuleUrl: 'https://newdoc.nccu.edu.tw/generalcourse/emptyforqry.htm',
    subLocUrl: 'https://sgnweb.nccu.edu.tw/mnccuqa/index.html?roomid=900101',
    ...overrides,
  };
}
