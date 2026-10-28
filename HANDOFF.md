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

## 2026-10-28 實作計畫完成

- 計畫：docs/plans/2026-10-28-campusward-nccu-implementation.md。三位獨立審查（工程／設計對照／資安）共 46 條意見，裁判逐條核實後採納大部分；不採納三條（預先關閉功能、連結去 query、驗證交使用者判斷），理由見計畫第 12 節。
- 實測：舊專案 npm test 全過（單元 252、畫面 112）；es.nccu 查詢為模糊比對、單次上限 500 筆、有英文課號，抓取演算法已依此設計（計畫 2.1）。
- 下一步：Phase 0。任務 0.7（舊金鑰清單→使用者作廢）、0.8（建公開 GitHub 儲存庫，執行前再確認一次）、2.6（請使用者提供去識別化全人系統樣本）。
- 停止點總表：計畫第 9 節。
- 2026-10-28 使用者確認主畫面示意符合想像：頂列（學期、搜課、非官方標示）、方案／備案切換與學分、政大節次課表（衝堂紅、鎖定、新增標示、空堂）、右側 AI 光球（直接執行＋復原＋自動備案說明）、下方規則提醒附出處、匯出與畢業缺口入口。Phase 3 依此為版面基準。

## 2026-10-28 Phase 0（本機部分）完成

- 完成：0.1–0.6。`npm run verify` 全過（lint、typecheck、32 個測試、專案檢查 0 問題）；每道檢查都先用植入違規實測擋下。提交前檢查需本機有 gitleaks（已以 brew 安裝 8.30.1）。
- 0.7 舊金鑰盤點（gitleaks 掃舊專案全歷史＋目錄，值已遮蔽）：真正的金鑰只在舊專案 `.env`（未進版控），三把：GEMINI_API_KEY、GROQ_API_KEY、TAVILY_API_KEY；其餘命中為課程資料與驗證快照的誤判。Google Sheets 憑證檔路徑已不存在。⛔ 待使用者到各服務後台作廢。
- 0.8 完成：使用者確認後建立公開儲存庫 https://github.com/Hunter20041004/campusward-nccu ；推送前全歷史 gitleaks 無洩漏；已開 secret scanning、push protection、Dependabot alerts；workflow 預設權限 read、允許 Actions 建立 PR。CI 祕密掃描改為直接執行雜湊核對過的 gitleaks 8.30.1（官方 action 在含根提交的推送上算錯範圍）。

## 2026-10-28 Phase 1 進行中（1.1–1.4、1.6 完成）

- 完成：periods（節次＋來回轉換 property 測試）、term（學期解析與預設學期）、official（官方列→Course：保留設計 8.2 欄位、連結白名單、控制字元與長度限制、備註分類）、corrections（data/corrections/1151.json，鍵＝學期:課號）、eligibility（資格判斷與條件定義）。`npm run verify` 146 個測試全過。
- 舊測試移植：用 scratchpad 的轉換腳本做語法轉換（assert→expect），逐檔核對判斷數。已移植：nccu-periods、nccu-course-notes、nccu-url、syllabus-state、nccu-course-adapter（正規化與更正部分）、eligibility-conditions、planner-core（資格部分）。
- 行為改變（已寫入提交說明）：lmtKind 是通識類別（1151 實測），不再併入修課限制；學生選擇與官方課程分開，attendance 改為 course.delivery.defaultAttendance；查無開課原因與示範條件改由參數提供。
- 與計畫不同：pickDefaultTerm 只依「已有資料的最新學期」，不用行事曆（較簡單且符合設計）。
- 1.5 完成：schedule/selection（ScheduleCourse＝課程、PlanItem＝學生選擇：出席方式、狀態 planned/registered/enrolled、鎖定、上次看到的更正）、schedule/catalog（官方→ScheduleCourse、手動課程、候選清單）、schedule/agenda。共 196 個測試。
- 未移植（提交說明逐條列出）：多選一指導老師／時段與 preset 相關 8 個測試，因新資料來源不會產生這類課，只服務舊示範資料。若日後需要，從舊 planner-core 取回。
- 1.7 完成：internship（自動找空檔／固定時段、待確認天數）。舊 planner-core 的 calculateInternshipAvailability 舊畫面未使用，不移植，情境由 internship 第一個測試涵蓋。共 202 個測試。
- 下一步：1.8 搜課篩選。使用者要求暫不推送，本機領先 origin。

## 2026-10-28 Phase 1 完成

- 1.8 搜課（候選篩選＋快照搜尋，5,000 筆約 2 ms）、1.9 選課規則提醒（重讀選課須知 114.07 原文核對頁碼，數字與出處在 data/rules）、1.10 方案／備案／復原、1.11 AI 變更方案（封閉動作清單、身分條件無法表達）、1.12 截圖匯入與排課確定性工具、1.13 儲存與匯出入（含舊站資料匯入）。引擎入口匯出全部模組。
- 程式碼審查（/code-review high）10 項全部修正，每項先寫失敗測試：最重要的是復原會丟掉偏好、自動備案可能刪掉目前方案、既有學分問題會擋住所有 AI 變更。
- 驗證：`npm run verify` 382 個測試全過；lint、typecheck、專案檢查 0 問題。
- 未移植的舊測試都在各提交說明列出（多選一指導老師／preset、三方案推薦流程、舊版內部遷移）。
- 尚未做：推送（使用者要求暫不推）；GitHub 上的 CI 尚未跑過 Phase 1 程式。
- 下一步：Phase 2 資料管線（2.1 抓取策略），並開始 2.5、2.7、2.8 調查；2.6 請使用者提供去識別化全人系統樣本。
