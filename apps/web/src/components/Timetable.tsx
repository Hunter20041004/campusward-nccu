import { FileUp, Search } from 'lucide-react';

export function Timetable({ onStartSearch, onImport }: { onStartSearch: () => void; onImport: () => void }) {
  return (
    <section aria-labelledby="timetable-heading" className="relief flex min-h-[28rem] flex-col rounded-box">
      <h2 id="timetable-heading" className="border-b border-base-300 px-4 py-3 text-base font-semibold">課表</h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
        <div>
          <p className="text-lg font-semibold">還沒有排任何課</p>
          <p className="mt-1 max-w-[34ch] text-sm text-base-content/80">搜到想修的課就能加進課表，衝堂與選課規則會自動提醒。</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary min-h-11 gap-2" onClick={onStartSearch}>
            <Search className="size-4" aria-hidden="true" />
            從搜課開始
          </button>
          <button type="button" className="btn btn-ghost min-h-11 gap-2 border border-base-300" onClick={onImport}>
            <FileUp className="size-4" aria-hidden="true" />
            匯入舊站資料
          </button>
        </div>
      </div>
    </section>
  );
}
