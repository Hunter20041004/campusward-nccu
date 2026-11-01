# Campusward

給政大學生的選課排課工具。非政大官方服務。免費、開源（MIT）。

- 搜全校課程（115-1 共 2,932 門）、政大節次課表、衝堂與選課須知提醒（附出處）、備案比較、一鍵復原。
- AI 光球（用你自己的 Gemini 金鑰）：說需求直接排課，改動前先檢查衝堂、鎖定課、學分並自動備份。
- 問課綱、職涯方向找課、截圖匯入、畢業缺口（讀全人系統匯出檔的學校審查）、單門課向官方確認。
- 資料只存在你的瀏覽器；修課紀錄不送 AI。

## 在自己電腦上開來看

需要 Node 24（見 `.nvmrc`）與 gitleaks（`brew install gitleaks`，提交前檢查用）。

```bash
npm install
```

```bash
npm run dev -w @campusward/web
```

開啟終端機顯示的網址（預設 http://localhost:5173）。

正式建置與預覽（含正式的安全標頭）：

```bash
npm run build -w @campusward/web && npm run preview -w @campusward/web
```

## 檢查

```bash
npm run verify
```

```bash
npm run test:e2e
```

`verify` 依序跑 lint、型別檢查、單元測試、專案檢查（學號、手機與信箱、寫死學期、品牌字樣、workflow 釘版）。`test:e2e` 用合成資料跑桌機、手機與正式建置的流程。

## 更新課程資料

```bash
npm run pipeline -- --term 1151
```

```bash
npm run pipeline:spotcheck -- --term 1151
```

驗證紀錄見 `docs/verification/`。

## 文件

- 設計：`docs/specs/2026-10-28-campusward-nccu-design.md`
- 實作計畫：`docs/plans/`
- 設計系統：`DESIGN.md`；產品：`PRODUCT.md`
- 隱私說明：網站的 `/privacy` 頁

功能開關：建置時設 `VITE_CAMPUSWARD_DISABLE=qa,career` 可關閉指定功能（名稱見 `apps/web/src/features.ts`）。
