import { exportTransfer, previewImport, type ImportPreview, type ScheduleEntry, type StoredData } from '@campusward/engine';
import { ClipboardCopy, Download, FileUp, History, Image, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { CopyListPreview } from './CopyListPreview.tsx';

export interface DataPanelProps {
  entries: readonly ScheduleEntry[];
  data: StoredData;
  /** 目前學期；舊站資料一律歸到這個學期。 */
  term: string;
  onReplace: (data: StoredData) => void;
  onClear: () => void;
  onWallpaper: () => void;
  canRestoreImport: boolean;
  onRestoreImport: () => void;
  /** 目前方案的名稱（複製預覽寫出是哪個方案）。 */
  planName: string;
  /** 依身分的學分上下限；沒設定年級時是 null。 */
  limits: { minimum: number; maximum: number } | null;
  /** 預覽裡按「回課表處理」。 */
  onBackToTimetable: () => void;
  /** 複製課號預覽開關：讓小山的提醒泡泡先讓開。 */
  onCopyPreview?: (open: boolean) => void;
  now?: () => Date;
}

export { registrationCodes } from './CopyListPreview.tsx';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const action = 'btn btn-sm min-h-11 gap-1.5';

export function DataPanel({ entries, data, term, onReplace, onClear, onWallpaper, canRestoreImport, onRestoreImport, planName, limits, onBackToTimetable, onCopyPreview, now = () => new Date() }: DataPanelProps) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Extract<ImportPreview, { valid: true }> | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const [copyOpen, setCopyOpenState] = useState(false);
  const setCopyOpen = (open: boolean) => {
    setCopyOpenState(open);
    onCopyPreview?.(open);
  };
  const copyButton = useRef<HTMLButtonElement>(null);
  const closeCopy = () => {
    setCopyOpen(false);
    setTimeout(() => copyButton.current?.focus(), 0);
  };
  const openCopy = () => {
    if (copyOpen) {
      setCopyOpen(false);
      return;
    }
    if (!entries.some(({ course }) => course.code)) {
      setMessage('課表上沒有要登記的課。');
      return;
    }
    setCopyOpen(true);
  };
  const copyCodes = async (codes: string[]) => {
    closeCopy();
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setMessage(`已複製 ${codes.length} 個課號（${planName}），依課表順序排列，可到選課系統批量登記。`);
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
    <section aria-labelledby="data-heading">
      <h2 id="data-heading" className="sr-only">匯出與資料</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <button ref={copyButton} type="button" className={action} aria-expanded={copyOpen} onClick={openCopy}>
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
        {canRestoreImport && (
          <button type="button" className={action} onClick={() => { onRestoreImport(); setMessage('已還原到匯入前的資料。'); }}>
            <History className="size-4" aria-hidden="true" />還原匯入前的資料
          </button>
        )}
        <button type="button" className={`${action} text-coral-ink`} onClick={() => setConfirmClear(true)}>
          <Trash2 className="size-4" aria-hidden="true" />清除本機資料
        </button>
        <a href="/privacy" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-mist-ink underline underline-offset-4">
          <ShieldCheck className="size-4" aria-hidden="true" />隱私說明
        </a>
      </div>

      {copyOpen && (
        <CopyListPreview
        planName={planName}
        entries={entries}
        limits={limits}
        onCopy={(codes) => { void copyCodes(codes); }}
        onBack={() => { setCopyOpen(false); onBackToTimetable(); }}
        onClose={closeCopy}
        />
      )}

      <p role="status" aria-label="資料操作結果" aria-live="polite" className="mt-2 text-sm empty:hidden">{message}</p>
      {importError && <p role="alert" className="mt-2 text-sm text-coral-ink">{importError}</p>}

      {preview && (
        <section aria-label="匯入預覽" className="well mt-3 rounded-2xl p-3 text-sm">
          <p>
            檔案含 {preview.summary.terms.length} 個學期、{preview.summary.scheduled} 門排入的課、{preview.summary.manualCourses} 門手動課程
            {preview.summary.skippedCourses > 0 && `；${preview.summary.skippedCourses} 門舊資料無法對應，會略過`}。
          </p>
          <p className="mt-1">會取代這台裝置上的課表與設定。匯入前會保留目前的資料，之後可以按「還原匯入前的資料」回到現在的狀態。</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm min-h-11" onClick={() => { onReplace(preview.data); setPreview(null); setMessage('已匯入，原本的資料已備份。'); }}>確認匯入</button>
            <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => setPreview(null)}>取消</button>
          </div>
        </section>
      )}

      {confirmClear && (
        <div role="group" aria-label="確認清除" className="course-conflict mt-3 rounded-2xl p-3 text-sm">
          <p>會刪除這台裝置上的所有課表、備案、設定、保留的備份與 Gemini 金鑰，無法復原。建議先匯出資料。</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-danger btn-sm min-h-11" onClick={() => { onClear(); setConfirmClear(false); setMessage('已清除本機資料。'); }}>確認清除</button>
            <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => setConfirmClear(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
