# 課綱問答（計畫 4.5）細部計畫與資料格式

日期：2026-11-01　依據：設計 8.4；實作計畫 4.5；2026-11-01 課綱語料調查（抓取、解析、去個資、索引實測）。

## 1. 成果與完成標準
- 學生在 AI 分頁問課程內容（「哪門課教機器學習、期末是報告？」），Campusward 先在本機課綱索引找段落，Gemini 只根據這些段落回答，每個說法附課號，連到官方課綱原文。
- 完成標準：語料全量抓取一次並通過去個資掃描（專案檢查的電話／信箱檢查對 data/syllabi 為 0）；索引 gzip < 3 MB；查詢 < 300 ms；驗收題 30 題記錄召回率；送 Gemini 的內容只含問題與課綱段落（不含課表、身分、修課紀錄）。

## 2. 共用資料格式（管線產生、網站讀取）

`data/syllabi/<學期>/corpus.jsonl`：一行一門課，依課號排序，序列化固定（同內容同位元組）。

```json
{"code":"000211011","title":"政治學 Political Science","description":"…","objectives":"…","grading":"…","prerequisite":"…","weekly":[{"week":1,"topic":"…"}],"weeklyText":"","hash":"<原始頁 sha256>"}
```

- 所有文字欄位已去除聯絡資訊（以「〔聯絡資訊已移除〕」取代）；只保留白名單欄位：課名、簡介、目標、評分、先修、每週主題（沒有週次表時保留每週進度原文 `weeklyText`）。
- Office Hours、助教、附件、連結區塊整段不收；沒有課綱或「尚未上傳」的課不寫入。
- 原網址不存，網站由快照的 `links.syllabus` 取得。

`data/syllabi/<學期>/meta.json`：`{ term, fetchedAt, pages, parsed, notUploaded, missing, failed, scrubHits }`。

## 3. 分工
- 管線（scripts/pipeline/syllabus/）：抓取（讀快照的課綱網址、經 trustedNccuUrl、每秒 1 次、ETag 條件請求與內容雜湊、單頁 1.5 MB 上限、原始 HTML 只放 .cache/ 不進版控）、解析（cheerio，以範本標題 h2/h3 內 span.Zh 切區塊，先移除 HTML 註解）、去個資、輸出。測試一律用合成頁面。
- 網站（apps/web）：建置時由 corpus.jsonl 產生索引（MiniSearch；NFKC、中文二字一組、英文單字；詞轉十六進位；每段 1,000 字上限；出現在 2% 以上段落的常見詞去除）與每門課的全文檔；瀏覽器端搜尋、組問答請求、顯示答案與官方連結。
