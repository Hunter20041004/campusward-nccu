import { ArrowLeft, ArrowRight, CalendarCheck, ClipboardCopy, FileUser, Heart, Layers, Lock, MousePointerClick, Search, SlidersHorizontal, TriangleAlert, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OrbMark } from './OrbMark.tsx';

export interface GuideSlide {
  title: string;
  body: string;
  picture: 'search' | 'details' | 'add' | 'block' | 'conflict' | 'backup' | 'conditions' | 'record' | 'orb' | 'register';
}

/** 使用導覽（2026-11-01 使用者要求涵蓋每個功能）。內容只寫畫面上真的有的功能。 */
export const GUIDE_SLIDES: GuideSlide[] = [
  { title: '搜課與多條件搜尋', body: '在左邊「課程搜尋」輸入課名、教師或課號。按「多條件搜尋」可以只看某幾天、早上／中午／下午／晚上，或某個通識類別；結果每頁 25 筆，底下可以換頁或改每頁筆數。', picture: 'search' },
  { title: '課程詳情與官方資料', body: '點課名展開詳細資料：修課限制、教室、修別、授課語言、考試與活動，還有官方課綱、即時餘額、教師資訊的連結。按「向官方確認最新資料」會只把這門課的課號送到政大公開查詢，看學校有沒有更新。', picture: 'details' },
  { title: '加入課表、收藏候選', body: '按「加入」放進右邊的模擬課表；按愛心先收藏到候選清單，之後再決定。匯入全人系統資料後，你已經修過的課會標「已修過」。', picture: 'add' },
  { title: '在課表上調整一門課', body: '點課表上的方塊：可以鎖定（AI 和移出都不會動它）、標成「已灌檔」或「已選上」、可非同步的課改成非同步上課，或移出課表。手機上可以在「行程」和「方格」兩種看法之間切換。', picture: 'block' },
  { title: '衝堂與選課規則', body: '時間重疊的課會變成珊瑚紅，提醒寫出是哪兩門。學分上下限、通識分發上限、同名課只會選上一門等選課須知規則，會附條文出處；規則只提醒、不擋你排課。', picture: 'conflict' },
  { title: '備案、比較與復原', body: '「＋備案」把目前的課表另存一份，上方可以切換、和另一個方案比較差了哪些課與學分。每次修改後 15 秒內可以按「復原」；一次拿掉課或改動三門以上前，會自動另存一份「自動備案」。', picture: 'backup' },
  { title: '條件：身分、資格、偏好', body: '右側圖示列的「條件」：設定學制、年級與加修學系（決定學分上下限）；有修課限制的課會問你符不符合；偏好可以設定想空下來的星期與每週實習天數，系統會算出還能實習幾天。身分與資格只有你能改，AI 不會動。', picture: 'conditions' },
  { title: '全人系統資料', body: '在「條件」或「畢業缺口」匯入全人系統下載的檔案一次：可以一鍵帶入年級與加修學系、勾選已修過的擋修條件、提醒可能重複修習、搜課標「已修過」，並列出學校畢業審查還缺的課與本學期有開的班。只存在這台瀏覽器、不含分數，不送 AI。', picture: 'record' },
  { title: 'AI 光球', body: '右下角的光球隨時可以叫出來。用你自己的 Gemini 金鑰說出需求（例如「週三下午加一門通識，不要早八」）就直接幫你排，改之前會檢查衝堂、鎖定的課與學分，做錯可以復原。也可以問課綱、依職涯方向找課、上傳課表截圖匯入；沒有金鑰可以看示範、查課綱。', picture: 'orb' },
  { title: '匯出、登記與隱私', body: '「匯出與資料」可以依序複製課號清單貼到學校選課系統登記、存成手機桌布、匯出或匯入資料檔，也可以一鍵清除這台裝置上的所有資料。Campusward 不是政大官方服務，選課結果以學校系統為準；送出哪些資料寫在「隱私說明」。', picture: 'register' },
];

const LEGEND: { swatch: string; label: string; note: string }[] = [
  { swatch: 'course-mist', label: '必修課', note: '霧藍方塊；搜課列表左側霧藍色條' },
  { swatch: 'course-apricot', label: '其他課', note: '米杏方塊；選修、群修、通識等' },
  { swatch: 'course-conflict', label: '衝堂', note: '珊瑚紅；提醒會寫出是哪兩門' },
  { swatch: 'chip', label: '課程屬性', note: '薄荷標籤：通識類別、英語授課、可非同步、收費、已修過' },
  { swatch: 'new', label: '新', note: '剛加入課表的課' },
  { swatch: 'lock', label: '鎖定', note: '鎖頭：AI 與移出都不會動它' },
  { swatch: 'status', label: '已灌檔／已選上', note: '你在學校系統的進度，會自動鎖定' },
  { swatch: 'heart', label: '收藏到候選', note: '愛心：先放進候選清單' },
  { swatch: 'auto', label: '自動備案', note: '大改動前自動另存的方案' },
  { swatch: 'passed', label: '已修過', note: '依你匯入的全人系統資料' },
];

function Picture({ kind }: { kind: GuideSlide['picture'] }) {
  const icon = {
    search: <Search className="size-10" aria-hidden="true" />,
    details: <MousePointerClick className="size-10" aria-hidden="true" />,
    add: <Heart className="size-10" aria-hidden="true" />,
    block: <Lock className="size-10" aria-hidden="true" />,
    conditions: <SlidersHorizontal className="size-10" aria-hidden="true" />,
    record: <FileUser className="size-10" aria-hidden="true" />,
    conflict: <TriangleAlert className="size-10" aria-hidden="true" />,
    backup: <Layers className="size-10" aria-hidden="true" />,
    orb: <OrbMark size={56} />,
    register: <ClipboardCopy className="size-10" aria-hidden="true" />,
  }[kind];
  // 迷你課表：霧藍與米杏方塊示意，衝堂那頁有一格珊瑚紅；純裝飾。
  return (
    <div aria-hidden="true" className="relative flex h-44 items-center justify-center gap-6 overflow-hidden rounded-2xl bg-gradient-to-br from-mint-wash via-base-100 to-primary/25 sm:h-56">
      <div className="raised flex size-24 items-center justify-center rounded-3xl text-mist-ink">{icon}</div>
      <div className="well hidden grid-cols-3 gap-1.5 rounded-xl p-2 sm:grid">
        {[0, 1, 2, 3, 4, 5].map((cell) => (
          <span
            key={cell}
            className={`h-9 w-10 rounded-md ${
              kind === 'conflict' && cell === 4 ? 'course-conflict' : cell % 3 === 0 ? 'course-mist' : cell % 3 === 1 ? 'course-apricot' : 'bg-base-200'
            }`}
          />
        ))}
      </div>
      {kind === 'backup' && <Undo2 className="absolute right-6 bottom-5 size-6 text-mist-ink" />}
      {kind === 'register' && <CalendarCheck className="absolute right-6 bottom-5 size-6 text-mist-ink" />}
    </div>
  );
}

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<'steps' | 'legend'>('steps');
  const slide = GUIDE_SLIDES[index]!;
  const last = index === GUIDE_SLIDES.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(0);
      setTab('steps');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog ref={ref} className="modal" aria-labelledby="guide-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {open && (
        <div className="modal-box relief max-w-2xl p-5 sm:p-6">
          <div role="tablist" aria-label="導覽內容" className="well flex gap-1 rounded-full p-1">
            {([['steps', '教學'], ['legend', '圖例']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`guide-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`guide-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                  const next = id === 'steps' ? 'legend' : 'steps';
                  setTab(next);
                  document.getElementById(`guide-tab-${next}`)?.focus();
                }}
                className={`min-h-11 flex-1 rounded-full text-sm font-bold ${tab === id ? 'tab-selected text-mist-ink' : 'text-base-content/75'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'legend' ? (
            <div role="tabpanel" id="guide-panel-legend" aria-labelledby="guide-tab-legend" className="mt-4">
              <h2 id="guide-title" className="text-xl font-bold">畫面上的顏色與標示</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {LEGEND.map(({ swatch, label, note }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-8 w-14 shrink-0 items-center justify-center">
                      {swatch.startsWith('course-') ? <span className={`block h-8 w-10 rounded-md ${swatch}`} />
                        : swatch === 'chip' ? <span className="chip">通識</span>
                          : swatch === 'new' ? <span className="rounded-full bg-primary/30 px-1.5 text-xs font-bold text-mist-ink">新</span>
                            : swatch === 'lock' ? <Lock className="size-5 text-mist-ink" />
                              : swatch === 'heart' ? <Heart className="size-5 fill-coral-ink text-coral-ink" />
                                : swatch === 'auto' ? <span className="rounded-full bg-secondary px-2 text-xs text-secondary-content">自動</span>
                                  : swatch === 'passed' ? <span className="chip">已修過</span>
                                    : <span className="whitespace-nowrap rounded-full bg-secondary px-1.5 text-xs font-bold text-secondary-content">已灌檔</span>}
                    </span>
                    <span className="text-sm"><span className="font-bold">{label}</span><span className="block text-xs text-base-content/75">{note}</span></span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end">
                <button type="button" className="btn btn-primary min-h-11" onClick={onClose}>開始使用</button>
              </div>
            </div>
          ) : (
          <div role="tabpanel" id="guide-panel-steps" aria-labelledby="guide-tab-steps">
          <p className="mt-4 text-sm font-bold text-mist-ink">使用導覽 {index + 1} / {GUIDE_SLIDES.length}</p>
          <div className="mt-3">
            <Picture kind={slide.picture} />
          </div>
          <h2 id="guide-title" className="mt-5 text-xl font-bold">{slide.title}</h2>
          <p className="mt-2 leading-relaxed text-base-content/85">{slide.body}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1" role="group" aria-label="導覽頁面">
            {GUIDE_SLIDES.map((item, dot) => (
              <button
                key={item.title}
                type="button"
                aria-label={`第 ${dot + 1} 頁：${item.title}`}
                aria-current={dot === index ? 'step' : undefined}
                onClick={() => setIndex(dot)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <span className={`block h-2 rounded-full transition-all duration-200 ${dot === index ? 'w-5 bg-primary' : 'w-2 bg-base-300'}`} />
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost min-h-11" onClick={onClose}>略過教學</button>
            <span className="flex-1" />
            {index > 0 && (
              <button type="button" className="btn min-h-11 gap-1" onClick={() => setIndex(index - 1)}>
                <ArrowLeft className="size-4" aria-hidden="true" />上一步
              </button>
            )}
            {last ? (
              <button type="button" className="btn btn-primary min-h-11" onClick={onClose}>開始使用</button>
            ) : (
              <button type="button" className="btn btn-primary min-h-11 gap-1" onClick={() => setIndex(index + 1)}>
                下一步<ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          </div>
          )}
        </div>
      )}
    </dialog>
  );
}
