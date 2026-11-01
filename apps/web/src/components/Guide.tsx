import { ArrowLeft, ArrowRight, CalendarCheck, ClipboardCopy, FileUser, Heart, Layers, Lock, MousePointerClick, Search, SlidersHorizontal, TriangleAlert, Undo2 } from 'lucide-react';
import { NCCU_PERIODS, formatClock } from '@campusward/engine';
import { useEffect, useRef, useState } from 'react';
import { OrbMark } from './OrbMark.tsx';

export interface GuideSlide {
  title: string;
  /** 桌機的說法（左邊模擬課表、右邊搜課與右側圖示列）。 */
  body: string;
  /** 手機的說法（底部「搜課／課表／更多」）；沒寫就和桌機相同。 */
  phone?: string;
  picture: 'search' | 'details' | 'add' | 'block' | 'conflict' | 'backup' | 'conditions' | 'record' | 'orb' | 'register';
}

/** 使用導覽（2026-11-01 使用者要求涵蓋每個功能）。內容只寫畫面上真的有的功能；手機與桌機各自講得到的位置，每頁一兩句。 */
export const GUIDE_SLIDES: GuideSlide[] = [
  {
    title: '搜課與多條件搜尋',
    body: '在右邊「課程搜尋」輸入課名、教師、課號或系所。「多條件搜尋」可以限定星期、時段、通識類別、系級；會衝堂的課收在最後。點課表空格，直接列出那段空堂排得進去的課（預設通識）。',
    phone: '在底部「搜課」輸入課名、教師、課號或系所。「多條件搜尋」可以限定星期、時段、通識類別、系級；會衝堂的課收在最後。點課表空格，直接列出那段空堂排得進去的課（預設通識）。',
    picture: 'search',
  },
  { title: '課程詳情與官方資料', body: '點課名展開詳細資料：修課限制、教室、考試與活動，還有課綱、即時餘額與 Dcard、Google 心得搜尋。「向官方確認最新資料」只把課號送到政大公開查詢。', picture: 'details' },
  {
    title: '加入課表、收藏候選',
    body: '按「加入」放進左邊的模擬課表；按愛心收藏到候選，右側圖示列的「候選」可以比較後再加入。匯入全人系統資料後，修過的課會標「已修過」。',
    phone: '按「加入」放進底部「課表」；按愛心收藏到候選，「更多」裡的「候選」可以比較後再加入。匯入全人系統資料後，修過的課會標「已修過」。',
    picture: 'add',
  },
  {
    title: '在課表上調整一門課',
    body: '點課表上的方塊：看老師、教室與課綱，鎖定、標成「已灌檔／已選上」、移出，或用「換一班」換到不衝堂的同名班。',
    phone: '在「課表」點一門課：看老師、教室與課綱，鎖定、標成「已灌檔／已選上」、移出，或用「換一班」換到不衝堂的同名班。「行程」裡的空檔有「找課」，直接找那段時間排得進去的課。',
    picture: 'block',
  },
  { title: '衝堂與選課規則', body: '時間重疊的課變珊瑚紅並寫出是哪兩門；有不衝堂的班時，提示條和提醒裡直接有「換到…那班」。設定年級後，課表上方會寫學分範圍（例如 12–25）；通識上限等規則附選課須知出處，只提醒、不擋你排課。', picture: 'conflict' },
  { title: '備案、比較與復原', body: '「幫我排滿」選想修幾學分，在這台裝置排出 2–3 份方案並排比較（照你的偏好、不衝堂），挑一份，其他自動存成備案。「＋備案」另存目前的課表，可以切換、比較。每次修改 15 秒內可以「復原」；一次改三門以上，或小山要拿掉課之前，會先自動另存一份「自動備案」。', picture: 'backup' },
  {
    title: '條件：身分、資格、偏好',
    body: '課表上方「我的系級」選一次（例如資訊二），就列出本班必修、自動挑不衝堂的班一鍵排入，也決定學分上下限。右側「條件」：加修學系、修課資格，以及想空下來的星期、不要早八與實習天數，搜課會自動套用。身分只有你能改，AI 不會動。',
    phone: '「課表」上方「我的系級」選一次（例如資訊二），就列出本班必修、自動挑不衝堂的班一鍵排入，也決定學分上下限。「更多」裡的「條件」：加修學系、修課資格，以及想空下來的星期、不要早八與實習天數，搜課會自動套用。身分只有你能改，AI 不會動。',
    picture: 'conditions',
  },
  {
    title: '全人系統資料',
    body: '在「條件」或「畢業缺口」匯入全人系統檔案一次：自動帶入系級與年級（可以復原）、標出修過與可能重複修習的課、列出畢業還缺的課，每個缺口都能「排一門進去」。只存在這台瀏覽器、不含分數，不送 AI。',
    phone: '在「更多」裡的「條件」或「畢業缺口」匯入全人系統檔案一次：自動帶入系級與年級（可以復原）、標出修過與可能重複修習的課、列出畢業還缺的課，每個缺口都能「排一門進去」。只存在這台瀏覽器、不含分數，不送 AI。',
    picture: 'record',
  },
  { title: '小山', body: '右下角的小山是 AI 小助手（按住可以拖到任何位置）：說出需求（例如「週三下午加一門通識」），它用你自己的 Gemini 金鑰幫你排，改之前檢查衝堂與學分，改完可以復原。沒有金鑰也能看示範、查課綱。', picture: 'orb' },
  {
    title: '匯出、登記與隱私',
    body: '「匯出與資料」可以預覽並複製課號清單（預設主方案，最上面可以換；本班灌檔的課預設不勾）、存成手機桌布、匯出或清除這台裝置的資料。Campusward 不是政大官方服務，選課以學校系統為準。',
    phone: '「更多」裡的「匯出與資料」可以預覽並複製課號清單（預設主方案，最上面可以換；本班灌檔的課預設不勾）、存成手機桌布、匯出或清除這台裝置的資料。Campusward 不是政大官方服務，選課以學校系統為準。',
    picture: 'register',
  },
];

/** 手機版面（<768px，底部分頁）用手機的說法。 */
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;

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

export function Guide({ open, onClose, phone: phoneProp }: { open: boolean; onClose: () => void; /** 測試用；沒給就依螢幕寬度判斷。 */ phone?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<'steps' | 'legend'>('steps');
  const slide = GUIDE_SLIDES[index]!;
  const [phoneNow, setPhoneNow] = useState(isPhone);
  const phone = phoneProp ?? phoneNow;
  const last = index === GUIDE_SLIDES.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(0);
      setTab('steps');
      setPhoneNow(isPhone());
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
              {/* 政大節次對照：和課表、搜課結果用同一份節次資料（引擎 NCCU_PERIODS）。 */}
              <table className="mt-4 w-full text-sm">
                <caption className="mb-2 text-left font-bold">政大節次與時間</caption>
                <thead className="sr-only">
                  <tr><th scope="col">節次</th><th scope="col">時間</th></tr>
                </thead>
                <tbody className="well grid grid-cols-2 gap-x-4 rounded-2xl px-3 py-2 sm:grid-cols-4">
                  {NCCU_PERIODS.map((period) => (
                    <tr key={period.code} className="flex items-baseline gap-2 py-0.5">
                      <th scope="row" className="w-4 text-left font-bold">{period.code}</th>
                      <td className="tabular text-base-content/85">{formatClock(period.start)}–{formatClock(period.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <p className="mt-2 leading-relaxed text-base-content/85">{phone ? slide.phone ?? slide.body : slide.body}</p>
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
