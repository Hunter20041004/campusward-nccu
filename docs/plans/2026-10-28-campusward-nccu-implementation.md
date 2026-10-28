# Campusward 實作計畫

日期：2026-10-28　依據：docs/specs/2026-10-28-campusward-nccu-design.md（已核可，下稱「設計」）
狀態：初稿經三方獨立審查（工程可行性／設計對照／資安隱私）與裁決後修訂，紀錄見第 12 節。
做法：滾動式規劃。Phase 0–2（第 1–2 週）寫到 TDD 步驟；之後各 Phase 只寫任務、完成標準與停止點，進入該 Phase 前在本目錄另寫細部計畫。

## 0. 目標與完成標準

- **結果**：2026-12-31 前在 Cloudflare Pages 公開上線，功能為設計第 5 節全部項目，通過設計第 11 節品質門檻與第 3 節上線門檻；1/1–1/20 試用修正並陪跑兩階段初選。
- **計畫完成標準**：設計第 5 節每列功能、第 11 節每項門檻都對應到任務（第 10 節對照表）；所有需使用者親自操作或花錢的步驟都標「⛔ 使用者」並列入第 9 節。
- **範圍不縮**：一次推出完整功能（設計第 3 節）。功能開關只用於「未達品質門檻者先關閉」，不預先關閉任何功能。
- **進度回報**：每週末更新 STATUS.md 與 HANDOFF.md（完成、未完成、下週、風險）。

## 1. 技術決定（設計未寫明、由實作者選定的預設）

| 項目 | 選擇 | 理由 |
|---|---|---|
| Node | 24 LTS（本機實測 v24.14.0）；`engines` ≥ 22.13 | 舊專案同為 ≥22.13；CI 用 24 |
| 套件管理 | npm workspaces（`packages/*`、`apps/*`）＋一份 `package-lock.json` | Node 內建 |
| 語言 | TypeScript `strict`、`noUncheckedIndexedAccess`；`tsc --noEmit` 涵蓋測試檔 | `@ts-expect-error` 型別測試才會生效 |
| 測試 | Vitest；fast-check（property 測試）；Testing Library（元件）；Playwright（端到端、網路請求錄製、CSP 違規監聽） | — |
| 執行 TS 腳本 | `tsx` | 管線腳本 |
| 結構驗證 | zod | 設計第 9 節 |
| Markdown 渲染 | react-markdown，關閉 `img`、自訂 `urlTransform`（只放行 `safeExternalUrl()` 通過者） | 設計 6.4 |
| 引擎隔離 | engine `tsconfig`：`lib: ["ES2023"]`、`types: []`（不自動載入 `@types/node`）＋`src/globals.d.ts` 只宣告 `URL`、`TextEncoder`；ESLint `no-restricted-imports`（`node:*`、`react*`）＋`no-restricted-globals`（`window`、`document`、`localStorage`、`sessionStorage`、`fetch`、`process`、`Buffer`） | 設計 8.1；workspaces 會把 `@types/node` 提升到根目錄，只靠 `lib` 擋不住 |
| 其他檢查 | ESLint `react/no-danger` 設 error | 設計 6.4 |
| 祕密與個資掃描 | gitleaks＋`scripts/checks/no-student-ids.ts`；兩者都進 pre-commit（`simple-git-hooks`）與 CI | 設計第 10 節；只在 CI 跑，推上公開庫就已外洩 |
| CI 安全 | 所有 `uses:` 釘 40 碼 commit SHA；workflow 預設 `permissions: {}`；需寫入的工作另拆；不需建置腳本的工作用 `npm ci --ignore-scripts` | 公開庫＋自動 PR＋CI secret 的供應鏈風險 |

## 2. 儲存庫結構

```
packages/engine/src/        純邏輯；儲存、網路、時間以參數注入
packages/engine/test/       含合成 fixtures
apps/web/                   React + Vite + Tailwind + daisyUI
scripts/pipeline/           建置期資料管線（Node，可用 node:*）
scripts/checks/             學號、寫死學期、workflow 釘版、品牌字樣檢查
data/snapshots/<學期>/      課程快照（JSON，進版控）
data/syllabi/<學期>/        課綱純文字分檔與索引
data/corrections/           人工時段更正表（鍵＝學期＋課號）
data/rules/                 選課規則提醒、行事曆、畢業規則檔
docs/research/              調查報告
docs/verification/          抽查紀錄（不含個資、不放截圖）
.github/workflows/          ci.yml、snapshot.yml、contract.yml
LICENSE                     MIT（已存在）
```

## 3. 舊程式去向（來源：舊專案 nccu-course-scheduler/src，2026-10-28 盤點並經審查核實）

| 舊模組（行數） | 新位置 | 處理 |
|---|---|---|
| nccu-periods (53) | engine/periods | 移植 |
| nccu-course-adapter (362) | engine/official/（解析、正規化）＋scripts/pipeline（抓取） | 移植；保留設計 8.2 指定欄位；node:https 後備只留在管線 |
| nccu-course-notes (112)、nccu-url (9)、syllabus-state (8)、course-reconciler (18) | engine/official/ | 移植 |
| nccu-syllabus (77) | scripts/pipeline/syllabus（HTML→純文字） | 移植（任務 4.5 用） |
| eligibility-conditions (121) | engine/eligibility/ | 移植；加 identity／preference 區分 |
| planner-core (403) | engine/schedule/、engine/eligibility/ | 移植，按職責拆檔 |
| internship-planner (135) | engine/internship/ | 移植 |
| catalog-filters (55)、schedule-agenda (43) | engine/catalog/、engine/schedule/ | 移植＋擴充篩選欄位 |
| plan-validator (90)、ai-planner (55)、ai-contracts (177) | engine/ai/changeSet | 改寫成設計 6.2 的「變更方案」 |
| ai-service (619) | engine/ai/import（截圖辨識結果對回快照：歧義放待確認、課號區分同名課、課名誤認靠課號救回）、engine/ai/plan（限制轉條件、最大學分組合、補足最低學分、語言課需求） | **移植確定性部分**（舊測試 tests/ai-service.test.mjs 約 27 個）；伺服器轉發與提示詞部分不搬，改寫到 apps/web/src/ai |
| planner-undo (60) | engine/history/ | 改寫：以變更方案為復原單位 |
| planner-storage (104)、planner-transfer (133) | engine/storage/ | 改寫：新格式 v1＋遷移；匯入與讀取都走 zod |
| gemini-client (121)、api-key-session (27) | apps/web/src/ai/ | 改寫錯誤分類（設計 6.2） |
| worker (168) | — | 不搬；其 CSP 與安全標頭設定沿用到 `_headers`（任務 5.3） |
| course-comparison(-picker) (182)、shared-ai-profile (15) | engine/ai/ 參考 | 併入課程問答／職涯推薦 |
| course-data (184) | — | 不搬；測試資料一律合成 |
| app.mjs (2,152)、index.html、styles.css | apps/web | 重寫 |
| 舊測試（單元 252＋畫面 112；2026-10-28 實跑全過） | engine/test、apps/web | 單元測試逐條改寫成 Vitest；畫面測試行為改寫成元件／端到端測試 |

**移植規則**
- 每個模組先把舊測試改寫成 Vitest（只改語法、型別與合成資料，不改預期行為），確認失敗，再移植實作到全部通過。
- 不得刪除或放寬舊測試的斷言。
- 例外：舊程式寫死學期的預期值（已核實：planner-core.mjs:10「115-1 查無開課資料」、ai-contracts.mjs:18 只收 115-1、nccu-course-adapter.mjs:160 以 `teaschm/1151` 判斷更正）改由參數提供，算「行為改變」，在提交說明逐條列出測試名稱與設計依據。
- 舊測試中的真實課程資料改寫成合成資料（設計第 10 節）。

## 4. Phase 0：儲存庫與工具（第 1 週前半）

### 0.1 建立工作區
- root `package.json`（workspaces；scripts：`test`、`test:e2e`、`lint`、`typecheck`、`build`、`check`）、`tsconfig.base.json`、`.nvmrc`（24）、`.gitignore`（`.env*`、`dist`、`node_modules`、`*.local.*`、`*.png`/`*.jpg` 等圖片預設忽略、以允許清單放行站內素材）。
- `packages/engine` 依第 1 節設定。
- 驗證：`npm test` 跑出 1 個冒煙測試通過；`npm run typecheck` 通過。

### 0.2 引擎隔離與 lint 自我測試
- 測試 `scripts/checks/test/eslint-rules.test.ts` 用 ESLint API `lintText(code, { filePath: 'packages/engine/src/x.ts' })` 餵違規片段：引用 `node:fs`、使用全域 `fetch`、`localStorage`、`window`；以及在 `apps/web/src/x.tsx` 使用 `dangerouslySetInnerHTML`。先看到「未報錯」的失敗 → 加規則 → 通過。
- 型別測試：engine 內寫 `fetch('x')` 的檔案 `tsc` 應失敗（以 `@ts-expect-error` 驗證）；`new URL('https://a')`、`new TextEncoder()` 應通過。
- 驗證：`npm run lint` 對正式程式碼無錯。

### 0.3 寫死學期檢查
- `scripts/checks/test/no-hardcoded-term.test.ts`：掃 `packages/engine/src`、`apps/web/src`，出現 `1151`、`1152`、`115-1`、`115-2` 即失敗（允許：`data/`、測試 fixture）。
- 驗證：故意放違規字串看到失敗，移除後通過。

### 0.4 學號與祕密掃描
- `no-student-ids`：`data/` 以外的追蹤檔，符合 `(?<!\d)1[01]\d{7}(?!\d)` 一律擋；課號以允許清單排除（只允許出現在 `data/snapshots`、`data/syllabi`、`data/corrections`，或明確標記的合成 fixture 檔）。
- 測試：無語境的 `"id":"<符合學號樣式的 9 碼合成數字>"` 被擋（測試檔中的合成學號以字串拼接產生，避免本身被掃描擋下）；`data/snapshots` 內課號不擋；合成 fixture 內課號不擋。
- gitleaks：pre-commit `gitleaks protect --staged`；CI 用官方 action（釘 SHA）。
- 驗證：兩個檢查都對合成違規範例報錯。

### 0.5 其他自動檢查
- `workflow-pinning`：掃 `.github/workflows/*.yml`，`uses:` 非 40 碼 SHA 或缺頂層 `permissions` 即失敗。
- `no-brand`：掃 `apps/web`，出現「Open NCCU」「opennccu」或暗示官方合作字樣即失敗（允許：本計畫與設計文件）。
- 各附違規範例測試。

### 0.6 CI
- `ci.yml`（`permissions: contents: read`）：`npm ci` → lint → typecheck → test → build → checks → Playwright 端到端（外部服務以固定回應取代；Phase 3 起有內容）→ gitleaks。
- 驗證：推送後 CI 綠燈。

### 0.7 舊金鑰清單 ⛔ 使用者
- 對舊專案跑 `gitleaks detect`（含全部歷史）＋搜尋 `.env*`，列出曾用過的金鑰種類與位置（不印出金鑰值），交使用者到 Google AI Studio 等處作廢（設計第 10 節）。

### 0.8 公開儲存庫 ⛔ 使用者確認
- 公開前對本庫全歷史跑 `gitleaks detect --log-opts="--all"`，結果附回報。
- `gh repo create Hunter20041004/campusward-nccu --public`（使用者 2026-10-28 已核可公開，執行前在對話中再確認一次）。
- 以 `gh api` 開啟 secret scanning、push protection、「允許 GitHub Actions 建立 PR」；失敗則給使用者設定步驟。
- 更新 CLAUDE.md、AGENTS.md 的「測試與建置指令」。

## 5. Phase 1：引擎移植（第 1–2 週）

**順序（依實際引用關係）**：1.1 → 1.2 → 1.3 → 1.4 → 1.6 → 1.5 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11 → 1.12 → 1.13。1.3 完成後 Phase 2 的 2.1–2.4 可並行。

每個任務同一循環：①改寫舊測試成 Vitest → ②`npx vitest run <檔>` 看到失敗 → ③移植實作 → ④該檔全過 → ⑤`npm test`、`npm run typecheck` 全套 → ⑥提交。以下只列**新增或改變的行為**；舊行為以舊測試為準。

### 1.1 節次 `periods`
- 舊測試：nccu-periods 全部。
- 新增：`parseMeetings("四D56")` 與 `formatMeetings` 互逆（fast-check：隨機合法節次串來回轉換不變）。

### 1.2 學期 `term`
- `Term` 型別、`parseTerm("1152")`、`formatTerm`、`termLabel`（「115-2」）。
- `pickDefaultTerm(availableTerms, today, calendar)`：最近一個要選課的學期；測試：2026-10-28 且 1152 無資料 → 1151；1152 有資料 → 1152。
- 選課日期表 `data/rules/calendar.json`（附出處：115 學年度行事曆 7 月版）。

### 1.3 官方資料正規化 `official`
- 舊測試：nccu-course-adapter、nccu-course-notes、nccu-url、syllabus-state、course-reconciler 全部。
- 新增：保留 `smtQty`、`gdeType`、`pay`、`subGde`、`subKind`、`core`、`emiType`、`lmtKind`、`subRemainUrl`（每欄一個測試）。
- `OfficialRow` zod 結構：字串長度上限、去除控制字元；所有網址欄位必須是 https 且主機屬 `nccu.edu.tw` 或其子網域，否則丟棄並記 `dataIssues`。
- `safeExternalUrl(url, allowlist)`：全站唯一的外部連結出口（課綱、餘額、教師、手動課程網址、AI 回覆連結）；測試：`javascript:`、`data:`、http、非白名單主機、`user@host` 形式皆拒絕；保留 query（政大課綱網址需要）。
- 合成 fixture：`packages/engine/test/fixtures/official-rows.ts`（合成課號與課名）。

### 1.4 人工時段更正表
- `applyCorrections(course, corrections)`，鍵為 `${term}:${courseCode}`。
- 測試：同課號不同學期不套用；舊 TAICA 非同步更正行為在對應學期鍵下仍成立。

### 1.6 資格條件 `eligibility`（排在 1.5 前：planner-core 依賴它）
- 舊測試：eligibility-conditions 全部＋planner-core 資格案例。
- 條件分 `identity`（只能由使用者介面動作設定）與 `preference`（空堂日、實習時段）；型別測試以 `@ts-expect-error` 確認 AI 動作型別無法帶 `identity`。

### 1.5 衝堂、學分、選取、鎖定 `schedule`
- 舊測試：planner-core 衝堂、選取、鎖定、節次選項、手動課程、非同步案例；schedule-agenda 全部。
- 新增：`totalCredits(selection)`；課程狀態 `planned | registered | enrolled`（已灌檔／已選上），後兩者預設鎖定；候選清單與課表為不同集合。

### 1.7 實習空檔 `internship`
- 舊測試：internship-planner 全部＋planner-core 實習案例。

### 1.8 搜課篩選 `catalog`
- 舊測試：catalog-filters 全部。
- 新增：課名、教師、課號、開課單位、通識類別、星期節次篩選各一個測試；全形／半形與空白正規化。
- 效能：5,000 筆合成課程基準測試只在本機量（`npm run bench`），結果記入第 11 節；CI 不設時間斷言。

### 1.9 選課規則提醒 `rules`
- 規則資料 `data/rules/enrollment-<版本>.json`，每條含 `id`、`source`（選課須知版本＋頁碼）、`appliesTo`；開工前重讀 114.07 版原文核對頁碼。
- 一條規則一組測試，涵蓋設計第 5 節全部：學分下限（大一至三 12、大四 10）與上限（一般 25、輔系 28、雙主修 31）、可申請超減修提示；初選分發科目數上限（中文、外文通識各 1；一般＋書院通識合計 3、書院至多 1；體育必修 1）；第 1 階段只能登記專業科目；第 1 階段落選不遞補；同名或代號前六碼相同只會選上一門；碩士班、收費、限本系／年級標示；全學年課與灌檔課提示。
- 輸出只有提醒（`info | warn`），測試斷言規則函式不改變選取。
- 版本更新由任務 2.4 的改版偵測觸發（見 2.4）。

### 1.10 備案與復原 `plans`、`history`
- 舊測試：planner-undo 中以變更方案為單位後仍成立的部分。
- 主方案＋備案的建立、切換、比較（新增／移除課程、學分差）。
- 「大改動」定義：一次變更移除主課表 ≥ 1 門課或變動 ≥ 3 門課；大改動前自動另存備案。自動備案上限 5，滿了回傳 `needsConfirmation`，不覆蓋。
- 復原：`apply(state, changeSet) → { state, undo, diff }`，`diff` 列出本次新增／移除；套回 `undo` 後與原狀態深度相等（fast-check）。

### 1.11 變更方案 `ai/changeSet`
- 舊測試：plan-validator、ai-planner、ai-contracts 中可對應案例。
- 動作清單（設計 6.2）分兩類：
  - 變更動作：`addCandidate`/`removeCandidate`、`addToSchedule`/`removeFromSchedule`、`createPlan`/`switchPlan`、`setPreference`。
  - 非變更動作：`searchCourses`、`openCourse`、`answer`、`recommendCareer`。
- `ChangeSet` zod 結構，變更動作數上限 20；驗證：課號存在快照、衝堂、鎖定課不被移除、實習天數、學分範圍；不合格回傳原因清單、不套用。
- 安全測試：`setIdentity` 類動作在結構驗證即被拒；課號不在快照被拒；超過上限被拒；多餘欄位被拒。

### 1.12 截圖匯入與 AI 排課的確定性部分 `ai/import`、`ai/plan`
- 舊測試：ai-service.test.mjs 確定性案例（約 27 個）：辨識結果對回快照、歧義放待確認、課號區分同名課、課名多一字靠課號救回、限制轉條件、最大學分組合、補足最低學分、語言課需求。

### 1.13 儲存與匯出入 `storage`
- 新格式 `campusward:v1`；`migrate(raw)`：每版一個純函式；未知版本回傳錯誤、不清資料。
- 舊站匯入：接受 `nccu-course-planner:v3`（version 6）匯出檔，轉成新格式（舊 planner-storage／planner-transfer 遷移案例）。
- 匯入**與啟動讀取 localStorage** 都走同一個 zod 驗證：多餘欄位、大小、筆數、字串長度上限、`__proto__`／`constructor` 鍵拒絕；竄改值被拒時回退到備份，不讓畫面崩潰。
- 匯入前產生備份、匯入可復原。
- 狀態型別中沒有金鑰欄位；測試：在任何可序列化狀態放入假金鑰字串，匯出、儲存、備份、復原歷史都不含。
- 兩分頁同時修改：以注入的假 storage 模擬 `storage` 事件，後寫入者為準並提示。

## 6. Phase 2：資料管線與調查（第 1–2 週；2.1–2.4 在 1.3 完成後開始）

### 2.1 抓取策略（TDD，網路以假 fetch 注入）
- **事實**（2026-10-28 實測，兩次獨立）：查詢是模糊比對，除課號外也比對教室、備註、網址等欄位（查「35」246 筆，約 30 筆因教室或備註命中）；有含英文的課號（如 `ZM` 開頭、`088F…`、`044M…`）；「0」「3」「00」「001」都達 500 筆上限；單次約 0.2–0.8 秒；Node 24 `fetch` 可直接連線。
- 演算法：起始查詢 `0`–`9` 與 `A`–`Z`；回傳達 500 筆就加一位（`0-9A-Z`）往下切；全部結果依 `學期+subNum` 去重，只保留 `y`、`s` 符合學期的列；總查詢數上限（預設 3,000）超過即失敗。
- 測試：假 fetch 模擬上限 → 會往下切；重複列只留一筆；失敗重試 3 次後整體失敗；併發上限 4、請求間隔 ≥ 200 ms；超過總查詢上限即失敗。

### 2.2 快照檢查與寫出
- 測試：筆數低於上一版 90% → 失敗並保留上一版；zod 驗證失敗率 > 1% → 失敗；輸出 `courses.json`＋`meta.json`（抓取時間、筆數、查詢次數、`dataIssues` 統計）。
- 輸出排序固定，內容相同時檔案位元組相同。

### 2.3 1151 驗收（真實網路）
- `npm run pipeline -- --term 1151`，記錄總筆數、耗時、查詢次數到第 11 節。
- 覆蓋驗證：所有英文開頭課號都有抓到（另以 `A`–`Z` 單字查詢交叉比對）；抽查 20 門（通識、體育、碩士班、非同步、多時段課）與官網逐欄比對，存 `docs/verification/`。
- 契約測試 `snapshot.contract.test.ts` 只在每日排程跑。

### 2.4 每日排程 `snapshot.yml`（2026-10-28 使用者決定暫緩：之後可能取得學校資料；測試先用 115-1 資料）
- 每日台灣時間 06:00。工作拆兩段：
  - `fetch`（`permissions: contents: read`、`npm ci --ignore-scripts`）：跑管線與全套測試，產出檔上傳為 artifact。
  - `open-pr`（`permissions: contents: write, pull-requests: write`，不安裝套件）：下載 artifact、有差異就開 PR。
- 因 `GITHUB_TOKEN` 開的 PR 不觸發 `ci.yml`，測試在 `fetch` 工作內跑完並把結果寫進 PR 說明。
- PR 說明自動列出：筆數變化、新出現的網域、`dataIssues`。
- 每日偵測：1152 是否有資料；選課須知與行事曆下載頁是否改版（比對檔名／雜湊）。首次出現即開 issue。
- 合併責任：由實作者（Claude 在使用者的 session 中）每個工作日檢查並合併；選課期（1/5–1/20）24 小時內合併。
- 調查 GitHub Actions 機器連 es.nccu 是否被擋（設計第 16 節）；被擋則改本機排程＋手動推送，記入 HANDOFF。

### 2.5 調查：畢業規則可取得性（文件；2026-10-28 發現匯出檔內含學校的畢業審查結果，做法待使用者確認，見 docs/research/nccu-student-export.md 第 3.1 節）
- 選 3 個學系／學程（優先財管雙主修、資科、一個學程），找官方必修科目表來源、格式、版本、是否依入學年不同。
- 產出 `docs/research/graduation-rules.md`：可行性與理由、規則檔 JSON schema＋1 個完整範例。完成標準：格式定稿。

### 2.6 調查：全人系統修課紀錄格式（2026-10-28 已取得一份樣本，見 docs/research/nccu-student-export.md）
- 第 1 週就請使用者自己登入，把個資遮掉後提供格式樣本（或描述欄位）；我不代登入。樣本不進版控。
- 不卡進度：未取得前畢業缺口檢查只支援手動輸入與貼上文字（設計 8.5）。

### 2.7 調查並選定：學生身分驗證方案
- 設計第 16 節列為「實作時處理，不需使用者決定」：由我評估後直接選定推薦方案；**只有需要付費或建帳號時停下**。
- 候選：政大信箱一次性驗證碼（Cloudflare Worker＋寄信服務）；Google 登入限 `@nccu.edu.tw`；其他（政大 SSO 預期排除，列理由）。
- 評估標準：不在伺服器保存使用者資料；每 IP 與每信箱雜湊的頻率上限；驗證碼嘗試上限；KV 只存 HMAC(信箱)＋存活時間；token 不含身分資訊；log 與回應不含信箱原文；與 CSP `script-src 'self'` 相容；成本；使用者摩擦。
- 寫明：純靜態網站的前端閘門可被技術使用者繞過，以及這對 Gemini 條款處理的意義（設計 6.3）。
- 寫明未通過驗證時，哪些 AI 功能被擋（預設：所有呼叫 Gemini 的功能；示範模式與非 AI 功能可用）。
- 產出 `docs/research/student-verification.md`＋選定方案。

### 2.8 調查：Gemini 搜尋建議顯示規定與引用格式
- **事實**（裁決時讀 Google 官方 grounding 條款）：使用 Google 搜尋 grounding 時，須將回傳的搜尋建議（HTML＋CSS）與結果一同、不經修改地顯示；可將結果再送一次模型整理，但最終畫面須附搜尋建議（至多 5 則）。
- 這與設計 6.4「不以 HTML 直接插入」及 CSP 有張力。產出 `docs/research/gemini-grounding-display.md`：定案顯示方式（候選：`sandbox` iframe＋`srcdoc`，不給 `allow-scripts`），以及對應 CSP（`frame-src`、`child-src`）調整；同時記錄 `groundingMetadata` 引用網址格式（設計第 16 節）。
- 完成標準：用真實回應樣本（以使用者提供的測試金鑰、或延到 Phase 5 契約測試時）驗證；沒有金鑰前先依文件定案並標「待實測」。

### 2.9 調查：Open NCCU 技術棧（低優先）
- 設計第 16 節。僅記錄公開可見的技術痕跡，供日後合併討論；不影響實作。

## 7. Phase 3–7（之後細化）

### Phase 3：React 畫面（第 2–5 週）
進入前寫 `docs/plans/<日期>-web-ui.md`，並用 impeccable 做設計檢查。
- 3.1 骨架：Vite、Tailwind、daisyUI 主題（設計第 7 節色票與字體，字型隨站提供）、路由、功能開關。
- 3.2 學期選擇、搜課（讀快照）、課程詳情、單門課即時向官方確認、官方連結（全部經 `safeExternalUrl`、新分頁、`rel="noopener noreferrer"`）。
- 3.3 政大節次課表（桌機方格、手機行程檢視）、衝堂與學分、選課規則提醒面板（每則附出處）。
- 3.4 資格條件（身分只由使用者勾選）、實習空檔、備案切換與比較、已灌檔／已選上標記。
- 3.5 匯出：手機桌布圖（在正式 CSP 下端到端跑過）、依序複製課號清單（桌機友善）、JSON 匯出入（含舊站匯入）。
- 3.6 一鍵清除本機資料（localStorage、sessionStorage 金鑰、IndexedDB、Cache API）；隱私說明頁（Phase 4 驗證定案後更新身分驗證段落）；「非政大官方服務」標示。
- 完成標準：元件測試涵蓋主要互動；Playwright 跑「搜課→加入→衝堂→規則提醒→匯出」於 1280×800 與 375×812；觸控目標 ≥ 44px；axe 無 AA 違規；每畫面兩輪截圖自檢＋impeccable。

### Phase 4：AI 與進階功能（第 4–7 週）
- 4.1 金鑰：只放在 AI 用戶端模組的閉包，不進 React 狀態或任何 store；預設只存記憶體，勾選才存 sessionStorage；移除按鈕；以 `x-goog-api-key` 標頭傳送。端到端測試：輸入假金鑰走完所有流程，掃 localStorage、IndexedDB、Cache（未勾選時含 sessionStorage）皆不含；任何請求網址不含 `key=`；console 與錯誤訊息不含。金鑰申請說明頁列出 Gemini 條款（設計 6.3）。
- 4.2 Gemini 用戶端：錯誤依 `error.details[].reason` 分類；回歸測試「400／401 不一律當金鑰無效」；API_KEY_INVALID、格式錯誤、RESOURCE_EXHAUSTED／429、安全過濾、MAX_TOKENS 各一測試；模型名稱集中於 `apps/web/src/ai/models.ts`；供應鏈檢查（禁止中國來源模型，沿用舊 model-supply-chain 測試）。
- 4.3 AI 光球：需求 → 最多 2 次模型呼叫（測試斷言呼叫次數）→ `ChangeSet` → 引擎驗證 → 直接套用、標示本次新增／移除、「已幫你加入 N 門課 [復原]」；大改動自動備案，備案滿了顯示提示（元件測試）；光球以霧藍＋薄荷繪製。離線評估題 ≥ 30 題（固定模型回應，確定性檢查合法性）。端到端：「AI 幫排→復原」桌機與手機（固定回應）。
- 4.4 安全：只有光球指令的呼叫能產生 `ChangeSet`；課程問答、職涯推薦、截圖匯入的回應結構不含變更動作（結構測試）；AI 回覆渲染無 `<img>`（渲染 `![x](https://a/)` 斷言 DOM 無 img）；連結經 `safeExternalUrl`；AI 回覆中的課號一律比對快照，不存在者標示；提示注入測試題 ≥ 10 題（課綱內嵌指令、課名內嵌指令、要求移除鎖定課、要求外洩需求文字等）。
- 4.5 課程問答：管線擴充抓課綱（設計 8.4）；只收課名、簡介、目標、評分、先修、每週主題；移除信箱、電話、學號（測試）；單頁 HTML 大小上限；全文按課分檔、點開才載入；每段附原網址；MiniSearch 二字一組；索引壓縮 < 3 MB、手機搜尋 < 300 ms；IndexedDB／Cache API 快取；驗收題 30–50 題記錄召回率；課綱未齊全提示與前學期回退；教師／學校申請移除管道（GitHub issue 範本＋聯絡信箱）。
- 4.6 職涯推薦：兩段式（2.5 Flash＋搜尋 → 結構化）；依 2.8 定案顯示搜尋建議；來源連結只取 `groundingMetadata`，引文以來源片段比對；推薦的課號比對快照。
- 4.7 截圖匯入：辨識 → 引擎 1.12 對回快照；送出前提醒裁掉個資。
- 4.8 畢業缺口檢查：依 2.5 規則檔格式；本機比對、不送 AI；測試斷言所有送 Gemini 的請求內容不含修課紀錄與成績欄位；「僅供參考，以系所審核為準」與未檢查項目清單；不支援學系顯示「尚未支援」。
- 4.9 示範模式：預錄 ChangeSet 播放，標示「示範」。
- 4.10 學生身分驗證：依 2.7 選定方案實作（Worker 單元測試：log 與回應不含信箱原文、頻率與嘗試上限）；更新隱私說明頁。
- 每個 AI 相關畫面同樣做兩輪截圖自檢＋impeccable。
- **第 7 週檢核點**：逐一對照品質門檻；未達者依設計第 3 節以功能開關關閉，並向使用者回報原因與補救時程。

### Phase 5：品質門檻與資安（第 7–8 週）
- 5.1 每日契約測試 `contract.yml`：es.nccu 小查詢＋1152 檢查；Gemini 測試金鑰 1–2 次（涵蓋金鑰無效、格式錯誤、429、安全過濾、MAX_TOKENS）。⛔ 使用者：建立測試金鑰、在 Google 端限制只能呼叫 Generative Language API 並設每日額度、放進 GitHub secret。
- 5.2 Playwright 錄下所有網路請求，與隱私說明頁列出的網域逐一核對；斷言沒有第三方分析網域。
- 5.3 `_headers`：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://es.nccu.edu.tw https://generativelanguage.googleapis.com <驗證端點>; frame-src <依 2.8>; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`，以及 `Referrer-Policy: no-referrer`、`X-Content-Type-Options`、`Permissions-Policy`（參考舊 worker.mjs）。測試：Playwright 監聽 `securitypolicyviolation`，任一頁面出現即失敗；`dist/index.html` 無 inline script。
- 5.4 資安檢查：XSS、提示注入、匯入攻擊、金鑰外洩；開多個獨立審查 subagent＋裁決。
- 5.5 無障礙：axe 自動檢查＋鍵盤實測紀錄。

### Phase 6：上線（第 8–9 週，目標 2026-12-31）
- 部署到 Cloudflare Pages（帳號已於 2.7 結束時建立）。
- 115-2 資料公布後 3 天內重建、抽查 20 門。
- 上線門檻逐項打勾（設計第 3 節），附證據（測試輸出、截圖、網路請求紀錄）；含「規則檔已對最新公布版本選課須知核對」。
- 舊站撤下（⛔ 若需使用者帳號操作）；舊專案刪除清單交使用者確認（設計第 13 節）。

### Phase 7：試用與選課期陪跑（2027-01-01 至 01-20）
- 每日檢查快照與課綱 PR、24 小時內合併；熱修流程（修正→CI→部署，當日完成）。
- 1152 晚於 12/31 公布時：公布當日跑管線、3 天內完成抽查；上線時先以 1151 資料＋「115-2 課程尚未公布」提示運作。
- 選課須知 115 版或行事曆調整公布時：重核規則檔並更新出處。
- 第 1 階段（1/12–13）、第 2 階段（1/18–20）期間每日回報問題與處理。

## 8. 時程與優先順序

| 週 | 日期 | 內容 |
|---|---|---|
| 1 | 10/28–11/3 | Phase 0；1.1–1.4；2.1–2.2；2.6 請求樣本；2.5、2.7、2.8 調查開始 |
| 2 | 11/4–11/10 | 1.5–1.13；2.3–2.4；調查定稿；⛔ Cloudflare 帳號（2.7 後） |
| 3–5 | 11/11–12/1 | Phase 3 |
| 4–7 | 11/18–12/15 | Phase 4（與 Phase 3 後半重疊）；第 7 週檢核點 |
| 7–8 | 12/9–12/22 | Phase 5 |
| 9 | 12/23–12/31 | Phase 6 上線 |
| — | 1/1–1/20 | Phase 7 |

關鍵路徑上的優先順序（時間不夠時先保住）：搜課 → 課表與衝堂 → 規則提醒 → AI 光球＋復原 → 匯出。其餘功能照排程完成，未達門檻者在第 7 週檢核點處理。

## 9. 停止點（需使用者）

| 時點 | 事項 |
|---|---|
| 第 1 週（0.7） | 作廢舊專案用過的金鑰（我提供清單與步驟） |
| 第 1 週（0.8） | 建立公開 GitHub 儲存庫前最後確認；若 `gh api` 無法開啟「允許 Actions 建立 PR」，到 GitHub 設定頁手動開 |
| 第 1 週（2.6） | 提供去識別化的全人系統修課紀錄格式樣本（不卡進度） |
| 第 2 週（2.7 後） | 建立 Cloudflare 帳號；若選定方案需付費寄信服務或 Google OAuth 設定，由使用者決定與操作 |
| Phase 5（5.1） | 建立並限制 Gemini 測試金鑰、放進 GitHub secret |
| Phase 6 | 撤下舊站（若需使用者帳號）；確認舊專案刪除清單；夥伴圖書館網站刪除前取得夥伴同意；確認刪除展示原型 Artifact |
| Phase 6 後 | 舊專案移到垃圾桶前停止其本機服務；清空垃圾桶、刪 GitHub 私人庫與 Drive 由使用者執行 |

## 10. 設計對照表

| 設計項目 | 任務 |
|---|---|
| 學期選擇（不寫死） | 1.2、0.3、3.2 |
| 搜課 | 1.3、1.8、2.1–2.4、3.2 |
| 候選清單與課表 | 1.1、1.5、3.3 |
| 選課規則提醒 | 1.9、2.4（改版偵測）、3.3、Phase 7 |
| 資格條件 | 1.6、3.4 |
| 實習空檔 | 1.7、3.4 |
| 課表備案 | 1.10、3.4、4.3 |
| 已灌檔／已選上 | 1.5、3.4 |
| AI 光球（6.1、6.2） | 1.10、1.11、1.12、4.1–4.4 |
| AI 安全（6.4） | 1.3、1.11、4.4、5.3、5.4 |
| 金鑰與身分（6.3） | 2.7、4.1、4.8、4.10 |
| 截圖匯入 | 1.12、4.7 |
| 課程問答（8.4） | 4.5 |
| 畢業缺口檢查（8.5） | 2.5、2.6、4.8 |
| 職涯推薦（8.6） | 2.8、4.6 |
| 匯出 | 1.13、3.5 |
| 示範模式 | 4.9 |
| 官方連結 | 1.3、3.2 |
| 外觀（第 7 節） | 3.1、4.3、0.5（品牌字樣）、5.2（無分析） |
| 部署與 CSP（8.3） | 2.7、5.3、Phase 6 |
| 隱私（第 9 節） | 1.13、3.6、4.10、5.2 |
| 開源與儲存庫（第 10 節） | 0.4、0.7、0.8 |
| 品質門檻（第 11 節） | 每個任務的 TDD、0.6、5.1–5.5 |
| 時程與上線（第 3、12 節） | 第 8 節、Phase 6、Phase 7 |
| 舊專案處理（第 13 節） | 第 9 節停止點 |
| 待查證（第 16 節） | 2.3、2.4、2.6、2.7、2.8、2.9、Phase 7 |

## 11. 實測紀錄（隨執行補上）

- 2026-10-28 任務 1.8：`npm run bench`（本機 Node 24）5,000 筆合成課程關鍵字搜尋中位數 2.25 ms（p95 2.36）、星期＋節次篩選中位數 1.42 ms（p95 1.51），門檻 50 ms。Vitest 5 已無 `bench` 匯出，改用 tsx 計時腳本。
- 2026-10-28 Phase 0：TypeScript 6 預設 `types` 已是空陣列（拿掉設定仍不載入 Node 型別；明設 `types: ["node"]` 時型別測試抓到 fetch、process、Buffer、localStorage 外洩）；eslint-plugin-react 7.37 不支援 ESLint 10，固定 ESLint 9；CI action 釘 SHA：checkout v7.0.1、setup-node v7.1.0、gitleaks-action v3.0.0（皆發布逾兩週）；提交前檢查實測擋下假 Google 金鑰與植入的學號／學期／品牌違規。
- 2026-10-28：舊專案 `npm test` 全過（單元 252、畫面 112）。es.nccu 回傳 31 個欄位，含設計 8.2 指定欄位；Node 24 fetch 可直接連線；查「0」「3」各 500 筆、約 0.5 秒（設計 8.2「寬查詢約 16–18 秒」可能指其他查詢型態，2.3 實測時一併確認）。

## 12. 審查紀錄

2026-10-28 初稿經三位獨立審查（工程可行性、設計對照、資安隱私，共 46 條意見）與一位裁判逐條核實原始資料。採納的主要修訂：
- 舊程式 ai-service 的確定性邏輯改為移植（新任務 1.12）；補列 nccu-syllabus。
- 引擎隔離改用 `types: []`＋`no-restricted-globals`；lint 自測改用 `lintText`。
- 任務順序依實際引用關係調整；寫死學期的舊預期值改參數。
- 抓取演算法加 A–Z 與總查詢上限；英文課號覆蓋驗證。
- CI 釘 SHA、最小權限、抓取與開 PR 拆工作；GITHUB_TOKEN 開的 PR 不觸發 CI 的處理。
- 完整 CSP 與 CSP 違規監聽；金鑰全儲存掃描；建置期資料當不可信資料；問答與職涯回應不得含變更動作。
- 學號掃描改為全擋＋課號允許清單，進 pre-commit；測試資料一律合成。
- 身分驗證由我選定方案（設計第 16 節），Cloudflare 帳號停止點提前到第 2 週。
- 新增 2.8 Gemini 搜尋建議顯示規定調查、Phase 7 試用陪跑、選課須知與行事曆改版偵測、舊金鑰作廢停止點。

不採納：預先關閉課程問答等功能（違反設計第 3 節「一次推出完整功能」）；連結一律去 query（會弄壞政大課綱網址）；驗證是否足夠交使用者判斷（與設計第 16 節衝突）。
