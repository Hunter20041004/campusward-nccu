import { Undo2 } from 'lucide-react';
import { useEffect } from 'react';

const UNDO_WINDOW_MS = 15_000;

/** 每次修改後 15 秒內可復原（設計 6.1：做錯可以一鍵復原）。 */
export function UndoToast({ label, onUndo, onExpire }: { label: string | null; onUndo: () => void; onExpire: () => void }) {
  useEffect(() => {
    if (!label) return;
    const timer = window.setTimeout(onExpire, UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [label, onExpire]);
  return (
    <div role="status" aria-label="最近的修改" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center pr-24 pl-4 md:bottom-6 md:px-4">
      {label && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-neutral py-2 pl-5 pr-2 text-sm text-neutral-content shadow-lg">
          <span>{label}</span>
          <button type="button" onClick={onUndo} className="btn btn-ghost btn-sm min-h-11 gap-1 text-neutral-content hover:bg-neutral-content/20">
            <Undo2 className="size-4" aria-hidden="true" />
            復原
          </button>
        </div>
      )}
    </div>
  );
}
