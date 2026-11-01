import { Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBuddyHub } from '../buddy/BuddyContext.tsx';
import { clampOrb, ORB_SIZE, panelPlacement, type OrbPosition } from '../buddy/orbPosition.ts';
import { Xiaoshan } from '../buddy/Xiaoshan.tsx';

/**
 * 小山（2026-11-01 使用者要求，原名「AI 光球」，同日改名統一叫小山）：右下角浮動按鈕，任何畫面都能叫出；
 * 面板關掉時只隱藏，AI 結果與輸入保留。面板關著時右下角那隻跟著你的操作反應，打開後換面板標題那隻；
 * 有值得注意的事（例如衝堂）時，在旁邊冒一句提醒，可以按掉（參考 Claude Duet 的主動提醒）。
 * 提醒幾秒後收成按鈕上的小點，不一直擋住畫面；其他面板或選單打開時（nudgeHidden）先藏起來。
 * 按住可以拖到畫面任何位置（鍵盤：Alt＋方向鍵），面板與提醒會跟著出現在小山旁邊；位置由 App 記在這台裝置。
 */
const DRAG_THRESHOLD = 6;
const KEY_STEP = 24;
const isPhone = () => typeof matchMedia === 'function' && !matchMedia('(min-width: 768px)').matches;
/** 手機底部分頁列的高度：小山不要壓在分頁上。 */
const bottomInset = () => (isPhone() ? 72 : 0);
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
export const NUDGE_FOLD_MS = 8000;

export function FloatingOrb({ open, onOpen, onClose, nudge, onNudge, onDismissNudge, nudgeHidden = false, position = null, onPosition, children }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  nudge?: string | null;
  /** 按提醒泡泡時做的事；沒給就打開小山。 */
  onNudge?: () => void;
  onDismissNudge?: () => void;
  /** 課卡面板、手機「更多」選單等打開時為 true：泡泡不蓋住它們。 */
  nudgeHidden?: boolean;
  /** 上次拖到的位置（離右邊、離下面幾像素）；沒有就用預設的右下角。 */
  position?: OrbPosition | null;
  onPosition?: (position: OrbPosition) => void;
  children: React.ReactNode;
}) {
  const [folded, setFolded] = useState<string | null>(null);
  useEffect(() => {
    if (!nudge || open || folded === nudge) return;
    // 被別的選單蓋住過就直接收成小點（手機每次換頁都會開「更多」，不收的話會一直重新彈出來）。
    if (nudgeHidden) { setFolded(nudge); return; }
    const timer = setTimeout(() => setFolded(nudge), NUDGE_FOLD_MS);
    return () => clearTimeout(timer);
  }, [folded, nudge, nudgeHidden, open]);
  const showBubble = Boolean(nudge) && !open && !nudgeHidden && folded !== nudge;
  const showDot = Boolean(nudge) && !open && folded === nudge;
  const panel = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hub = useBuddyHub();
  const quiet = useSyncExternalStore(hub?.subscribe ?? (() => () => {}), () => hub?.quiet ?? false);
  useEffect(() => {
    if (open) panel.current?.focus();
    hub?.setPanelOpen(open);
  }, [hub, open]);
  const close = () => {
    onClose();
    button.current?.focus();
  };

  // ── 拖曳 ──
  const [pos, setPos] = useState<OrbPosition | null>(position);
  useEffect(() => setPos(position), [position]);
  const [, relayout] = useState(0);
  useEffect(() => {
    // 視窗變小時把小山夾回畫面裡。
    const onResize = () => { setPos((current) => (current ? clampOrb(current, viewport(), bottomInset()) : current)); relayout((n) => n + 1); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const drag = useRef<{ x: number; y: number; start: OrbPosition; moved: boolean } | null>(null);
  const latest = useRef<OrbPosition | null>(null);
  const swallowClick = useRef(false);
  const currentPosition = (): OrbPosition => {
    if (pos) return pos;
    const rect = button.current?.getBoundingClientRect();
    const view = viewport();
    return clampOrb({ right: view.width - (rect?.right ?? 0), bottom: view.height - (rect?.bottom ?? 0) }, view, bottomInset());
  };
  const moveTo = (next: OrbPosition) => {
    const clamped = clampOrb(next, viewport(), bottomInset());
    latest.current = clamped;
    setPos(clamped);
    return clamped;
  };
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== undefined && event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, start: currentPosition(), moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.moved = true;
    moveTo({ right: state.start.right - dx, bottom: state.start.bottom - dy });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!state?.moved) return;
    // 拖完放開時瀏覽器還會送一次 click：這次不要打開面板。
    swallowClick.current = true;
    if (latest.current) onPosition?.(latest.current);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
    const step = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] }[event.key];
    if (!step) return;
    event.preventDefault();
    const start = currentPosition();
    onPosition?.(moveTo({ right: start.right + step[0]!, bottom: start.bottom + step[1]! }));
  };
  const onButtonClick = () => {
    if (swallowClick.current) { swallowClick.current = false; return; }
    if (open) close(); else onOpen();
  };
  // 面板與提醒跟著小山：桌機面板開在小山旁邊；手機面板仍是整片，提醒放在小山正上方。
  const view = typeof window === 'undefined' ? { width: 0, height: 0 } : viewport();
  const panelStyle: React.CSSProperties | undefined = pos && !isPhone()
    ? (() => {
        const placed = panelPlacement(pos, view, { width: 448, height: Math.min(672, view.height - 144) });
        return 'left' in placed ? { left: placed.left, right: 'auto', bottom: placed.bottom } : { right: placed.right, bottom: placed.bottom };
      })()
    : undefined;
  const orbOnLeft = pos ? view.width - pos.right - ORB_SIZE / 2 < view.width / 2 : false;
  const bubbleStyle: React.CSSProperties | undefined = pos
    ? (orbOnLeft ? { left: view.width - pos.right - ORB_SIZE, right: 'auto', bottom: pos.bottom + ORB_SIZE + 8 } : { right: pos.right, bottom: pos.bottom + ORB_SIZE + 8 })
    : undefined;
  return (
    <>
      <section
        ref={panel}
        id="ai-orb-panel"
        aria-label="小山"
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(event) => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) close(); }}
        style={panelStyle}
        className="relief fixed inset-x-3 top-20 bottom-36 z-30 flex-col overflow-hidden outline-none md:inset-x-auto md:top-auto md:right-24 md:bottom-6 md:h-[min(42rem,calc(100dvh-9rem))] md:w-[28rem] [&:not([hidden])]:flex"
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 className="flex flex-1 items-center gap-2 text-lg font-bold text-mist-ink"><Xiaoshan size={40} role="panel" seed={1} />小山</h2>
          {hub && (
            // 小山一直在動，讀課綱時可能分心：可以讓它停下來（只存在這台裝置）。
            <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="讓小山安靜" aria-pressed={quiet} title={quiet ? '讓小山動起來' : '讓小山安靜'} onClick={() => hub.setQuiet(!quiet)}>
              {quiet ? <Play className="size-5" aria-hidden="true" /> : <Pause className="size-5" aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="關閉小山" onClick={close}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-3">{children}</div>
      </section>
      {showBubble && (
        <div role="status" style={bubbleStyle} className="raised fixed right-5 bottom-40 z-30 flex max-w-64 items-start gap-1 rounded-2xl rounded-br-sm py-2 pr-1 pl-3 text-sm md:right-26 md:bottom-12">
          <button type="button" className="min-h-11 flex-1 text-left font-bold" onClick={onNudge ?? onOpen}>{nudge}</button>
          <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="不用了，關掉提醒" onClick={onDismissNudge}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        ref={button}
        type="button"
        aria-label="小山"
        aria-expanded={open}
        aria-controls="ai-orb-panel"
        aria-describedby={showDot ? 'ai-orb-nudge' : undefined}
        title="小山（按住可以拖到任何位置；鍵盤用 Alt＋方向鍵）"
        style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
        onClick={onButtonClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
        className={`btn fixed right-5 bottom-20 z-30 size-16 touch-none rounded-full p-0 select-none md:right-6 md:bottom-6 ${open ? 'tab-selected' : ''}`}
      >
        <Xiaoshan size={52} role="orb" seed={2} />
        {showDot && (
          <>
            <span data-nudge-dot aria-hidden="true" className="absolute top-1 right-1 size-3.5 rounded-full border-2 border-base-100 bg-coral-ink" />
            <span id="ai-orb-nudge" className="sr-only">{nudge}</span>
          </>
        )}
      </button>
    </>
  );
}
