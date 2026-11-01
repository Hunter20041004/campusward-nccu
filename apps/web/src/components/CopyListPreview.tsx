import { candidateScheduleSummary, findConflicts, totalCredits, type ScheduleEntry } from '@campusward/engine';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DAY_LABELS, formatCredits } from './labels.ts';

export interface CopyListPreviewProps {
  planName: string;
  entries: readonly ScheduleEntry[];
  /** 依身分的學分上下限；沒設定年級時不檢查。 */
  limits: { minimum: number; maximum: number } | null;
  onCopy: (codes: string[]) => void;
  /** 回課表處理衝堂或學分。 */
  onBack: () => void;
  onClose: () => void;
}

/** 要到官方選課系統登記的課號：依課表順序，略過已灌檔／已選上與手動課程（預覽的預設勾選）。 */
export function registrationCodes(entries: readonly ScheduleEntry[]): string[] {
  return entries.filter(({ course, item }) => course.code && item.status === 'planned').map(({ course }) => course.code!);
}

const STATUS_LABELS = { registered: '已灌檔', enrolled: '已選上' } as const;

/**
 * 複製課號清單前的預覽：哪個方案、每門課、可勾選；有衝堂或學分超出範圍先提醒（稽核 #9）。
 * 和匯入預覽一樣在原地展開（DESIGN：彈窗只用在刪除資料的確認）；打開時焦點移到標題，Esc 關閉。
 */
export function CopyListPreview({ planName, entries, limits, onCopy, onBack, onClose }: CopyListPreviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = entries.filter(({ course }) => course.code);
  const manual = entries.length - rows.length;
  // 已灌檔、已選上的課不用再登記，預設不勾。
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => {
    const codes = new Set(registrationCodes(entries));
    return new Set(rows.filter(({ course }) => codes.has(course.code!)).map(({ course }) => course.key));
  });
  useEffect(() => heading.current?.focus(), []);

  const titleOf = (key: string) => entries.find(({ course }) => course.key === key)?.course.title ?? key;
  const credits = totalCredits(entries);
  const warnings = [
    ...findConflicts(entries).map(({ courseKeys }) => `「${titleOf(courseKeys[0] ?? '')}」與「${titleOf(courseKeys[1] ?? '')}」衝堂`),
    ...(limits && credits < limits.minimum ? [`共 ${credits} 學分，低於學分下限 ${limits.minimum} 學分`] : []),
    ...(limits && credits > limits.maximum ? [`共 ${credits} 學分，超過學分上限 ${limits.maximum} 學分`] : []),
  ];
  const chosen = rows.filter(({ course }) => ticked.has(course.key)).map(({ course }) => course.code!);
  const toggle = (key: string) => setTicked((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <section
      aria-labelledby="copy-list-title"
      className="well mt-3 space-y-3 rounded-2xl p-3"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
    >
      <h3 id="copy-list-title" ref={heading} tabIndex={-1} className="text-base font-bold text-mist-ink outline-none">複製課號清單：{planName}</h3>
      {warnings.length > 0 && (
        <div role="alert" className="course-conflict space-y-2 rounded-2xl p-3 text-sm">
          <p className="flex items-start gap-1.5 font-bold">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            登記前先確認：
          </p>
          <ul className="list-disc space-y-0.5 pl-6">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <p className="text-xs">到選課系統才被擋會比較麻煩，可以先回課表調整。</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm min-h-11" onClick={onBack}>回課表處理</button>
            <button type="button" className="btn btn-sm min-h-11" disabled={!chosen.length} onClick={() => onCopy(chosen)}>仍要複製</button>
          </div>
        </div>
      )}
      <p className="text-sm">勾選要登記的課，依課表順序複製；已灌檔、已選上的課預設不勾。</p>
      <ul aria-label="要複製的課" className="divide-y divide-base-300">
        {rows.map(({ course, item }) => (
          <li key={course.key}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
              <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={ticked.has(course.key)} onChange={() => toggle(course.key)} />
              <span className="min-w-0 flex-1">
                <span className="tabular">{course.code}</span>・<strong>{course.title}</strong>・{candidateScheduleSummary(course, DAY_LABELS, item.attendance, { clock: true })}・{formatCredits(course.credits)}
                {item.status !== 'planned' && <span className="chip ml-1.5">{STATUS_LABELS[item.status]}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {manual > 0 && <p className="text-xs text-base-content/75">{manual} 門手動加入的課沒有課號，不會複製。</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={onClose}>取消</button>
        {warnings.length === 0 && (
          <button type="button" className="btn btn-primary btn-sm min-h-11" disabled={!chosen.length} onClick={() => onCopy(chosen)}>
            複製 {chosen.length} 個課號
          </button>
        )}
      </div>
    </section>
  );
}
