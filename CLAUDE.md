# Campusward（campusward-nccu）接手規則

先讀 STATUS.md、HANDOFF.md 最新區段與 docs/specs/2026-10-28-campusward-nccu-design.md。

- 產品：只服務政大學生的選課排課工具；不做校方、老師、承辦功能，不接校務系統，不收費，非政大官方服務。
- 設計已核可：照設計文件直接執行，不要重新丟產品問題給使用者；只有超出設計範圍、花錢、不可逆或需要使用者親自操作的事才詢問。
- 不使用 Open NCCU 的標誌、名稱或暗示合作的字樣。
- 公開儲存庫：不得提交金鑰、真實學生資料、私人檔案；不搬舊專案 git 歷史。
- 使用者自帶 Gemini 金鑰：預設只存記憶體，不寫入長期儲存、匯出檔、網址或日誌；修課紀錄與成績不送給 AI。
- 開發一律 TDD；packages/engine 不得依賴畫面框架或 node:*。
- 對使用者一律用繁體中文（台灣用語）。
- 測試與建置指令（根目錄執行；Node 24，見 .nvmrc）：
  - `npm install`（會裝提交前檢查；需先 `brew install gitleaks`）
  - `npm run verify`：lint → typecheck → 單元測試 → 專案檢查（學號、寫死學期、品牌字樣、workflow 釘版）
  - 個別：`npm test`、`npm run lint`、`npm run typecheck`、`npm run check`
