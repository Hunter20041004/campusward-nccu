import { exportTransfer, previewImport, type ImportPreview, type ScheduleEntry, type StoredData } from '@campusward/engine';
import { ClipboardCopy, Download, FileUp, Image, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

export interface DataPanelProps {
  entries: readonly ScheduleEntry[];
  data: StoredData;
  /** 目前學期；舊站資料一律歸到這個學期。 */
  term: string;
  onReplace: (data: StoredData) => void;
  onClear: () => void;
  onWallpaper: () => void;
  now?: () => Date;
}

/** 要到官方選課系統登記的課號：依課表順序，略過已灌檔／已選上與手動課程。 */
export function registrationCodes(entries: readonly ScheduleEntry[]): string[] {
  return entries.filter(({ course, item }) => course.code && item.status === 'planned').map(({ course }) => course.code!);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const action = 'btn btn-sm min-h-11 gap-1.5 border border-base-300 bg-base-100';

export function DataPanel({ entries, data, term, onReplace, onClear, onWallpaper, now = () => new Date() }: DataPanelProps) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Extract<ImportPreview, { valid: true }> | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const copyCodes = async () => {
    const codes = registrationCodes(entries);
    if (!codes.length) {
      setMessage('課表上沒有要登記的課。');
      return;
    }
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setMessage(`已複製 ${codes.length} 個課號，依課表順序排列，可到選課系統批量登記。`);
    } catch {
      setMessage(`無法自動複製，請手動複製：${codes.join(' ')}`);
    }
  };

  const exportData = () => {
    const stamp = now().toISOString();
    download(`campusward-${stamp.slice(0, 10)}.json`, exportTransfer(data, stamp));
    setMessage('已匯出資料檔（不含任何金鑰）。');
  };

  const readImport = async (file: File | undefined) => {
    setPreview(null);
    setImportError('');
    if (!file) return;
    const result = previewImport(await file.text(), data, { legacyTerm: term });
    if (result.valid) setPreview(result);
    else setImportError(result.error.message);
  };

  return (
    <section aria-labelledby="data-heading" className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 id="data-heading" className="text-sm font-semibold">匯出與資料</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={action} onClick={copyCodes}>
          <ClipboardCopy className="size-4" aria-hidden="true" />複製課號清單
        </button>
        <button type="button" className={action} onClick={onWallpaper}>
          <Image className="size-4" aria-hidden="true" />手機桌布
        </button>
        <button type="button" className={action} onClick={exportData}>
          <Download className="size-4" aria-hidden="true" />匯出資料
        </button>
        <label className={`${action} cursor-pointer`}>
          <FileUp className="size-4" aria-hidden="true" />
          <span>匯入資料</span>
          <input type="file" accept="application/json,.json" className="sr-only" aria-label="匯入資料" onChange={(event) => { void readImport(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        <button type="button" className={`${action} text-coral-ink`} onClick={() => setConfirmClear(true)}>
          <Trash2 className="size-4" aria-hidden="true" />清除本機資料
        </button>
        <a href="/privacy" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-mist-ink underline underline-offset-4">
          <ShieldCheck className="size-4" aria-hidden="true" />隱私說明
        </a>
      </div>

      <p role="status" aria-label="資料操作結果" aria-live="polite" className="mt-2 text-sm empty:hidden">{message}</p>
      {importError && <p role="alert" className="mt-2 text-sm text-coral-ink">{importError}</p>}

      {preview && (
        <section aria-label="匯入預覽" className="mt-3 rounded-field border border-primary/40 bg-primary/10 p-3 text-sm">
          <p>
            檔案含 {preview.summary.terms.length} 個學期、{preview.summary.scheduled} 門排入的課、{preview.summary.manualCourses} 門手動課程
            {preview.summary.skippedCourses > 0 && `；${preview.summary.skippedCourses} 門舊資料無法對應，會略過`}。
          </p>
          <p className="mt-1">會取代這台裝置上的課表與設定；匯入前會自動備份目前的資料，匯入後可以從備份還原。</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm min-h-11" onClick={() => { onReplace(preview.data); setPreview(null); setMessage('已匯入，原本的資料已備份。'); }}>確認匯入</button>
            <button type="button" className="btn btn-ghost btn-sm min-h-11 border border-base-300" onClick={() => setPreview(null)}>取消</button>
          </div>
        </section>
      )}

      {confirmClear && (
        <div role="group" aria-label="確認清除" className="mt-3 rounded-field border border-coral-ink/50 bg-error/10 p-3 text-sm">
          <p>會刪除這台裝置上的所有課表、備案與設定，無法復原。建議先匯出資料。</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-sm min-h-11 border-coral-ink bg-error text-error-content" onClick={() => { onClear(); setConfirmClear(false); setMessage('已清除本機資料。'); }}>確認清除</button>
            <button type="button" className="btn btn-ghost btn-sm min-h-11 border border-base-300" onClick={() => setConfirmClear(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
