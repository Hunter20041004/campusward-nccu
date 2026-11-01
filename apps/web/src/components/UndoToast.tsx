import { ArrowLeftRight, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import type { ClashFix } from './ClashFix.ts';

const UNDO_WINDOW_MS = 15_000;

/** 每次修改後 15 秒內可復原（設計 6.1：做錯可以一鍵復原）。 */
/** action：加了會衝堂的課時，旁邊直接放「換到不衝堂的班」（易用性審查第 4 名）。 */
export function UndoToast({ label, onUndo, onExpire, action }: { label: string | null; onUndo: () => void; onExpire: () => void; action?: ClashFix | null }) {
  useEffect(() => {
    if (!label) return;
    const timer = window.setTimeout(onExpire, UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [label, onExpire]);
  return (
    <div role="status" aria-label="最近的修改" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center pr-24 pl-4 md:bottom-6 md:px-4">
      {label && (
        // 有換班按鈕時字比較多：窄螢幕讓說明自己一行，按鈕排在下面，不擠成一直條。
        <div className={`pointer-events-auto flex items-center bg-neutral py-2 pl-5 pr-2 text-sm text-neutral-content shadow-lg ${action ? 'flex-wrap gap-x-3 gap-y-0.5 rounded-2xl' : 'gap-3 rounded-full'}`}>
          <span className={action ? 'min-w-0 basis-full py-1 sm:basis-auto' : ''}>{label}</span>
          {action && (
            <button type="button" aria-label={action.description} onClick={action.onClick} className="btn btn-ghost btn-sm min-h-11 gap-1 text-neutral-content underline underline-offset-4 hover:bg-neutral-content/20">
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              {action.label}
            </button>
          )}
          <button type="button" onClick={onUndo} className="btn btn-ghost btn-sm min-h-11 gap-1 text-neutral-content hover:bg-neutral-content/20">
            <Undo2 className="size-4" aria-hidden="true" />
            復原
          </button>
        </div>
      )}
    </div>
  );
}
