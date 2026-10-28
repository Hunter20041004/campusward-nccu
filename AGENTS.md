# Campusward（campusward-nccu）給 Codex 的接手規則

先讀 STATUS.md、HANDOFF.md 最新區段、docs/specs/ 設計與 docs/plans/ 對應計畫。

- 產品界線同 CLAUDE.md：只服務學生、非政大官方、不使用 Open NCCU 標誌名稱、不提交金鑰與真實學生資料。
- 開發一律 TDD：一次一個行為，先看到失敗再實作；Task 收尾跑全套測試。
- packages/engine 為純 TypeScript，不可依賴 React、瀏覽器專屬 API 或 node:*（儲存與網路經介面注入）。
- 與 Claude 同時工作時，同一檔案（含鎖檔）同一時間只由一方修改。
- 測試與建置指令（根目錄執行；Node 24，見 .nvmrc）：
  - `npm install`（會裝提交前檢查；需先 `brew install gitleaks`）
  - `npm run verify`：lint → typecheck → 單元測試 → 專案檢查（學號、寫死學期、品牌字樣、workflow 釘版）
  - 個別：`npm test`、`npm run lint`、`npm run typecheck`、`npm run check`
