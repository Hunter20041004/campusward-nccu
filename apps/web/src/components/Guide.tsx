import { ArrowLeft, ArrowRight, CalendarCheck, ClipboardCopy, Layers, Search, TriangleAlert, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OrbMark } from './OrbMark.tsx';

export interface GuideSlide {
  title: string;
  body: string;
  picture: 'search' | 'conflict' | 'backup' | 'orb' | 'register';
}

/** 第一次進站的使用導覽（2026-11-01 使用者決定）。內容只寫畫面上真的有的功能。 */
export const GUIDE_SLIDES: GuideSlide[] = [
  { title: '搜課、加入課表', body: '在左邊「課程搜尋」輸入課名、教師或課號；按「多條件搜尋」可以只看某幾天、某個時段或通識類別。看中的課按「加入」放進右邊的模擬課表，按愛心先放進候選。', picture: 'search' },
  { title: '衝堂與選課規則', body: '時間重疊的課會變成珊瑚紅，提醒寫出是哪兩門。學分上下限、通識分發上限等選課須知規則，會附上條文出處提醒你；規則只提醒、不阻擋。', picture: 'conflict' },
  { title: '備案與一鍵復原', body: '「＋備案」把目前的課表另存一份，方便比較。每次修改後 15 秒內可以按「復原」；大改動前會自動另存一份備案。', picture: 'backup' },
  { title: 'AI 光球', body: '在右側圖示列打開 AI，用你自己的 Gemini 金鑰，說出需求（例如「週三下午加一門通識」）就直接幫你排；改之前會先檢查衝堂、鎖定的課與學分。沒有金鑰也能看示範、查課綱。', picture: 'orb' },
  { title: '排好後去登記', body: '在「匯出與資料」複製課號清單，依序貼到學校選課系統登記；也可以存成手機桌布。Campusward 不是政大官方服務，選課結果以學校系統為準。', picture: 'register' },
];

function Picture({ kind }: { kind: GuideSlide['picture'] }) {
  const icon = {
    search: <Search className="size-10" aria-hidden="true" />,
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
  const slide = GUIDE_SLIDES[index]!;
  const last = index === GUIDE_SLIDES.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(0);
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
          <p className="text-sm font-bold text-mist-ink">使用導覽 {index + 1} / {GUIDE_SLIDES.length}</p>
          <div className="mt-3">
            <Picture kind={slide.picture} />
          </div>
          <h2 id="guide-title" className="mt-5 text-xl font-bold">{slide.title}</h2>
          <p className="mt-2 leading-relaxed text-base-content/85">{slide.body}</p>
          <div className="mt-4 flex justify-center gap-1" role="group" aria-label="導覽頁面">
            {GUIDE_SLIDES.map((item, dot) => (
              <button
                key={item.title}
                type="button"
                aria-label={`第 ${dot + 1} 頁：${item.title}`}
                aria-current={dot === index ? 'step' : undefined}
                onClick={() => setIndex(dot)}
                className="flex size-11 items-center justify-center rounded-full"
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
    </dialog>
  );
}
