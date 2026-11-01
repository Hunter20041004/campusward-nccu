import { ArrowLeft } from 'lucide-react';
import { OrbMark } from './components/OrbMark.tsx';

const SECTIONS: { id?: string; title: string; items: string[] }[] = [
  {
    title: '留在你的瀏覽器',
    items: [
      '課表、備案、候選清單、偏好、身分與資格條件，都只存在這台裝置的瀏覽器裡。Campusward 沒有帳號，也沒有伺服器保存你的資料。',
      '匯入的全人系統檔案只讀學籍、修課紀錄與學校的畢業審查；原始檔讀完就丟，分數不保存（只留通過、未通過或停修），姓名、學號、聯絡資料都不讀。整理後的資料存在這台瀏覽器，讓條件、重修提醒、搜課「已修過」與畢業缺口共用；不送給 AI、不放進匯出檔，按「清除修課資料」或「清除本機資料」就刪除。',
      '可以隨時匯出成檔案，或在「匯出與資料」按「清除本機資料」全部刪除（包含保留的備份）。',
      '用共用電腦或別人的電腦時，同一個瀏覽器的其他使用者看得到這些資料；用完請清除本機資料。',
    ],
  },
  {
    title: '政大課程資料（es.nccu.edu.tw）',
    items: [
      '課程資料是事先從政大公開課程查詢（es.nccu.edu.tw）整理好、放在本站的檔案；瀏覽時不會把你的任何資料送到政大。',
      '在課程詳情按「向官方確認最新資料」時，只會把那一門課的學期與課號送到政大的公開課程查詢（es.nccu.edu.tw），不含你的其他資料。',
    ],
  },
  {
    title: '送到 Google（generativelanguage.googleapis.com）',
    items: [
      '只有在你使用 AI 功能時，才會把你輸入的需求與必要的課程資料，用你自己的 Gemini 金鑰送給 Google。',
      '截圖匯入會把你選的圖片送給 Google 辨識；送出前請先裁掉姓名、學號等個資。',
      '修課紀錄與成績不會送給 AI，身分與資格條件也不會。金鑰預設只存在記憶體，重新整理就會消失；勾選「這個分頁記住金鑰」才會存到這個分頁的 sessionStorage，關掉分頁就清除。',
      '第一次使用 AI 前，會請你確認已年滿 18 歲並讀過 Gemini API 條款；沒有確認就不會送出任何 AI 請求。',
      'Gemini API 條款要求使用者年滿 18 歲；免費額度的內容可能用於改進 Google 產品並可能由人工審閱，請不要送出敏感或個人資料。',
    ],
  },
  {
    id: 'gemini',
    title: 'Gemini 金鑰怎麼申請',
    items: [
      '用 Google 帳號登入 Google AI Studio（aistudio.google.com），在「API keys」建立金鑰，複製後貼到 Campusward 的 AI 分頁。不需要付費也能用免費額度。',
      '金鑰等同你的帳號額度，不要貼到別的網站或傳給別人；不用時可在 AI 分頁按「移除金鑰」，或到 AI Studio 刪除金鑰。',
      'Gemini API 附加條款（2026-03-23 生效）要求使用者年滿 18 歲，不得用在主要給未滿 18 歲的人使用的服務，並把 API 定位為專業或商業用途、不是一般消費者使用（原文：「not for consumer use」）。Campusward 只能請你自行確認，無法替你符合這條；使用前請自己讀過條款。',
      '免費額度送出的內容可能被 Google 用來改進產品，也可能由人工審閱；請不要在需求裡寫入姓名、學號、成績等個人資料。',
    ],
  },
  {
    title: '不做的事',
    items: [
      '不載入外部字型或流量分析，不使用追蹤 Cookie。',
      '正式上線後網站會放在 Cloudflare 上；和任何網站一樣，託管業者看得到一般連線資訊（例如 IP 位址），本站不另外收集。',
      'Campusward 不是政大官方服務，選課結果以學校選課系統為準。',
    ],
  },
];

export function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="bg-base-100">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-field text-sm font-medium text-mist-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />回到排課
          </a>
          <span className="ml-auto flex items-center gap-2 font-semibold"><OrbMark size={24} />Campusward</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">隱私說明</h1>
        <p className="mt-2 max-w-[65ch] text-base-content/85">哪些資料留在你的裝置、哪些會送出去，以及送到哪裡。</p>
        {SECTIONS.map((section) => (
          <section key={section.title} id={section.id} className="mt-8 scroll-mt-4">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <ul className="mt-2 max-w-[65ch] list-disc space-y-1.5 pl-5 leading-relaxed">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
