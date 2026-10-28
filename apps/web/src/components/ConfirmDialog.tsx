import { useEffect, useRef } from 'react';

/** 只用在會刪除資料的確認（例如蓋掉最舊的自動備案、清除本機資料）。 */
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      {open && (
        <div className="modal-box">
          <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
          <p className="mt-2 text-sm">{message}</p>
          <div className="modal-action">
            <button type="button" className="btn min-h-11 border border-base-300 bg-base-100" onClick={onCancel}>取消</button>
            <button type="button" className="btn min-h-11 border-coral-ink bg-error text-error-content" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
