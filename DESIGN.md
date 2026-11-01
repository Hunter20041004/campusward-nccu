---
name: Campusward
description: 給政大學生的選課排課工具：課表是主角，其他東西都往課表送。
colors:
  base-100: "oklch(0.995 0.002 263)"
  base-200: "oklch(0.955 0 0)"
  base-300: "oklch(0.89 0.008 263)"
  base-content: "oklch(0.27 0.035 263)"
  mist-blue: "oklch(0.626 0.072 263)"
  mist-ink: "oklch(0.45 0.08 263)"
  apricot: "oklch(0.822 0.025 77)"
  mint-wash: "rgb(90 191 184 / 0.25)"
  coral: "oklch(0.62 0.143 22)"
  coral-ink: "oklch(0.5 0.15 22)"
typography:
  title:
    fontFamily: "Outfit, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  body:
    fontFamily: "Outfit, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Outfit, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  selector: "0.5rem"
  field: "0.625rem"
  box: "1rem"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "24px"
  touch-target: "44px"
components:
  button-default:
    backgroundColor: "{colors.base-100}"
    textColor: "{colors.base-content}"
    rounded: "{rounded.field}"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.mist-blue}"
    textColor: "oklch(0.18 0.035 263)"
    rounded: "{rounded.field}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.coral}"
    textColor: "oklch(0.99 0.01 22)"
    rounded: "{rounded.field}"
    height: "44px"
  card-relief:
    backgroundColor: "{colors.base-100}"
    rounded: "{rounded.box}"
  section-card:
    backgroundColor: "{colors.base-100}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
---

# Campusward 設計系統

## Overview

**北極星：政大的排課筆記本。** 安靜、清楚、可信：學生在選課季反覆搜課、試排、比較，介面只負責讓「現在排了什麼、哪裡有問題、還能做什麼」一眼看懂。模式是 Operate（完成任務），品牌只活在細節：霧藍與薄荷的小山（AI 小助手）、政大節次方格、附出處的規則提醒。

- 課表是主角：桌機左 3／右 2 兩欄（課表＋側欄），手機改成底部三分頁（課表、搜課、AI）。
- 視覺方向 B（使用者核可）：與 Open NCCU 同家族的配色與字體，但不使用其名稱或標誌；畫面固定標示「非政大官方服務」。
- 色票與元件定義的唯一來源是 `apps/web/src/styles.css`（daisyUI 主題 `campusward` 與 `@theme`）。

## Colors

- **霧藍 mist-blue**：主色，只用在主要動作（送出、加入課表）與選取狀態的底色；當文字時改用 **mist-ink**（對比 ≥4.5:1）。
- **薄荷 mint-wash**：小山的醉夢溪水珠、選取反白；不當文字色。
- **米杏 apricot**：修課限制等「要注意但不是錯」的底色。
- **珊瑚 coral／coral-ink**：只用在衝堂、錯誤、危險操作（清除資料）。衝堂的兩格同時變珊瑚紅，提醒列寫出是哪兩門。
- 底色三層：base-200（頁面）→ base-100（卡片）→ base-300（框線、分隔）。
- 只有淺色主題；所有文字與背景組合以 WCAG 2.2 AA 驗過（端到端 axe 檢查）。

## Typography

- 字體隨站提供（@fontsource Outfit＋Noto Sans TC），不從外部載入（CSP `font-src 'self'`）。
- 介面以 14px 為主（body／title），說明與次要資訊 12px（label，`text-base-content/75` 仍需 AA 對比）。數字（課號、學分、節次）用 `.tabular` 等寬數字。
- 層級靠字重（600 標題、400 內文）與位置，不靠放大字級；全站沒有大標。

## Layout

2026-11-01 使用者決定照 Open NCCU 的配置：

- 桌機（≥768px）三欄：左「課程搜尋」（lg 1.5 份）、中「右側工具面板」（1 份）、最右 3.5rem 圖示列。兩個面板固定在視窗高度、內部捲動；面板標題為霧藍粗體＋圖示＋直線。
- 課程搜尋：正中間膠囊搜尋框＋「多條件搜尋」（展開星期、時段、通識類別）；結果在凹陷區內，桌機為表格欄位（課程名稱／教師／課程編號／類型／時間地點／收藏・加入），每列左側色條；底部說明與分頁（每頁 25／50／100）。
- 右側工具面板內容由圖示列切換：模擬課表（方案、課表、規則提醒）、條件、匯出與資料、畢業缺口；各工具都保持掛載，切換不丟狀態。
- 手機（<768px）：一次一個區塊，底部分頁「搜課、課表、AI、更多（條件、匯出與資料、畢業缺口）」。
- 第一次進站：使用導覽視窗（5 頁），看過記在這台裝置；頂列「?」可再開。

## Elevation & Depth

柔浮雕（2026-11-01 使用者決定）：所有表面與頁面同一個淺灰 `base-100 oklch(0.955 0 0)`，只靠陰影分層。工具類別在 `styles.css`：

- `relief`：大面板凸起（左上白光 `-10px -11px 16px rgb(252 252 252/.7)`、右下陰影 `9px 14px 24px -10px rgb(0 0 0/.25)`），圓角 1rem。課表、側欄、規則提醒、匯出、畢業缺口。
- `well`：凹陷的內容區（課表方格、搜尋結果列表、側欄分頁列、子區塊）。
- `raised`：小元件凸起（按鈕、學期標籤、行程項目）；`.btn` 全站預設如此，按下時凹陷。
- `crater`：輸入框、搜尋框、選單凹陷，保留一條淡框線讓邊界看得出來。
- `tab-selected`：分頁與方案切換的選取狀態。
- 浮動層只有「復原」提示（深底淺字，15 秒）與確認對話框。

## Shapes

- 圓角三階：selector 0.5rem（勾選框、標籤）、field 0.625rem（按鈕、輸入框、小區塊）、box 1rem（大卡片）。
- 所有可點的東西至少 44×44px（端到端在手機上量測）。

## Components

- **按鈕**：預設白底＋1px 框線＋圖示（lucide）＋文字；主要動作霧藍底；危險動作珊瑚。一個區塊最多一個主要按鈕。
- **區塊卡（section-card）**：AI 分頁與畢業缺口裡的子功能，h3 標題前放 16px 圖示。
- **課表方格**：政大節次（A/B/1–8/C/D/E–H），課程塊用 `course-mist`（必修）／`course-apricot`（其他）／`course-conflict`（衝堂），帶內陰影、深色字；「新」為白底膠囊；鎖定有鎖頭。
- **搜尋結果**：在 `well` 裡，每列左側 4px 色條（必修霧藍、其他米杏）、課名 20px 粗體、教師粗體、標籤用 `chip`（薄荷底灰字）。
- **提醒列**：警告在前、資訊在後；每則附「選課須知 114.07 版 x-x」出處。
- **AI 回覆**：一律純文字（不渲染 HTML／Markdown／圖片）；文中課號比對快照，查無者標「快照查無此課號」；結果框先說做了什麼（加入／移出幾門），再列課名，最後才是 AI 的說明。
- **外部連結**：只連政大官方網域（經 `safeExternalUrl`），帶外部連結圖示與「開新分頁，政大官方網站」的螢幕閱讀器說明。
- **小山（buddy/、FloatingOrb）**：右下角浮動，64px 凸起圓鈕；霧藍玻璃質感的指南山雙峰、兩隻深色眼睛、兩顆薄荷色水珠在山腳繞行（醉夢溪）；表情只靠眼睛形狀與身體動作，跟著常見操作反應（詳見設計文件小助手改版一節），減少動態或「讓小山安靜」時不動。提醒泡泡在光球旁（手機在正上方），「復原」提示永遠在最上層。面板頂端是今日重點卡（`duet-rings` 兩圈細線背景）與建議問題按鈕；回覆是小助手頭像＋左上尖角的凸起泡泡。
- **示範**：沒有金鑰時的「看示範」，結果加「示範」標籤，一樣可以復原。

## Do's and Don'ts

- Do：每個改課表的動作都要能在 15 秒內復原，並說清楚改了什麼。
- Do：AI、課綱、職涯的結果都標明資料來源與限制（「未上網查證」「以官方課綱為準」）。
- Do：新功能先放進功能開關（`apps/web/src/features.ts`）。
- Don't：不要用彈窗當第一選擇；課程詳情在原地展開，只有清除資料、蓋掉自動備案才用確認。
- Don't：不要加開場動畫或裝飾性動態；動態 150–250ms，只表達狀態。
- Don't：不要出現 Open NCCU 名稱或任何暗示合作、官方的字樣。
- Don't：不要 inline script、外部字型或 CDN（CSP `script-src 'self'`）。
