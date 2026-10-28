# 交接

## 2026-10-28 專案建立（由「Campusward MVP status」對話交接）

- 目標／驗收：設計文件第 3 節上線門檻；116/1/12 初選前上線完整功能。
- 已核可：見設計文件全文（定位、三工具融合、完整功能一次推出、AI 直接執行＋復原＋自動備案、使用者自帶 Gemini 金鑰＋學生身分驗證、不做登記清單、選課規則以提醒呈現、外觀方向 B、React＋Tailwind＋daisyUI、TS 引擎、公開開源 MIT、舊專案全刪不備份）。
- 使用者要求：新對話直接開工，不要再丟產品問題；只有超出設計範圍、要花錢、不可逆或要使用者親自操作（建 Cloudflare／GitHub 帳號設定、清空垃圾桶）時才停下來問。
- 工作區：~/Developer/campusward-nccu，branch main，有一個初始提交，尚無遠端。
- 舊來源：/Users/cengweiting/Developer/創業計畫/campusward（main 8ce1901）。政大排課在其 nccu-course-scheduler/；測試指令 `cd nccu-course-scheduler && npm test`。
- 審查紀錄：2026-10-28 三方獨立審查（學生／技術／資安）與裁決，結論已併入設計文件。
- 下一步：1) 寫 docs/plans/ 實作計畫（TDD 步驟）；2) 建立公開 GitHub 儲存庫 Hunter20041004/campusward-nccu（使用者已核可公開）；3) 依計畫第 1 週：引擎移植、1151 資料管線、畢業規則可行性調查。
- 已知限制：115-2 課程尚未公布（:sem=1152 為 0 筆）；Gemini 條款年齡與消費者使用限制由使用者決定以身分驗證處理。
