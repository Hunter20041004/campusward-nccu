import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { OrbBuddy, type BuddyMood } from './OrbBuddy.tsx';

/**
 * AI 光球（2026-11-01 使用者要求）：右下角浮動按鈕，任何畫面都能叫出；面板關掉時只隱藏，AI 結果與輸入保留。
 * 光球是有表情的小助手（OrbBuddy）；有值得注意的事（例如衝堂）時，在旁邊冒一句提醒，可以按掉（參考 Claude Duet 的主動提醒）。
 */
export function FloatingOrb({ open, onOpen, onClose, mood = 'idle', nudge, onDismissNudge, children }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  mood?: BuddyMood;
  nudge?: string | null;
  onDismissNudge?: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const close = () => {
    onClose();
    button.current?.focus();
  };
  return (
    <>
      <section
        ref={panel}
        id="ai-orb-panel"
        aria-label="AI 光球"
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
        className="relief fixed inset-x-3 top-20 bottom-36 z-30 flex-col overflow-hidden outline-none md:inset-x-auto md:top-auto md:right-24 md:bottom-6 md:h-[min(42rem,calc(100dvh-9rem))] md:w-[28rem] [&:not([hidden])]:flex"
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 className="flex flex-1 items-center gap-2 text-lg font-bold text-mist-ink"><OrbBuddy size={36} mood={mood} />AI 光球</h2>
          <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="關閉 AI 光球" onClick={close}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </section>
      {nudge && !open && (
        <div role="status" className="raised fixed right-5 bottom-40 z-30 flex max-w-64 items-start gap-1 rounded-2xl rounded-br-sm py-2 pr-1 pl-3 text-sm md:right-26 md:bottom-12">
          <button type="button" className="min-h-11 flex-1 text-left font-bold" onClick={onOpen}>{nudge}</button>
          <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="不用了，關掉提醒" onClick={onDismissNudge}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        ref={button}
        type="button"
        aria-label="AI 光球"
        aria-expanded={open}
        aria-controls="ai-orb-panel"
        onClick={open ? close : onOpen}
        className={`btn fixed right-5 bottom-20 z-30 size-16 rounded-full p-0 md:right-6 md:bottom-6 ${open ? 'tab-selected' : ''}`}
      >
        <OrbBuddy size={52} mood={mood} />
      </button>
    </>
  );
}
