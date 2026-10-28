# Campusward 現況

更新：2026-10-28

- **是什麼**：給政大學生的選課排課工具。說出需求，AI 光球直接幫你搜課、排課、檢查衝堂與選課規則，可一鍵復原。免費、開源、非政大官方服務。
- **目標**：115-2 第 1 階段初選（116/1/12–13）前，2026-12-31 公開上線完整功能；目標是有人用。之後由使用者與 Open NCCU 團隊討論是否合併。
- **設計**：docs/specs/2026-10-28-campusward-nccu-design.md（已核可）。
- **技術**：packages/engine（TypeScript 純邏輯）＋ apps/web（React、Vite、Tailwind、daisyUI）；使用者自帶 Gemini 金鑰＋學生身分驗證；Cloudflare Pages 靜態部署。
- **計畫**：docs/plans/2026-10-28-campusward-nccu-implementation.md（經三方審查與裁決修訂）。
- **進度**：Phase 0 本機部分完成（工作區、引擎隔離、四道專案檢查、CI 設定、提交前檢查）；公開儲存庫 Hunter20041004/campusward-nccu 已建立。Phase 1 引擎完成（382 個測試，經程式碼審查修正）。下一步：Phase 2 資料管線。
- **舊來源**：/Users/cengweiting/Developer/創業計畫/campusward（政大排課 nccu-course-scheduler、課途徑、選課工作區），搬完後整個移到垃圾桶。
