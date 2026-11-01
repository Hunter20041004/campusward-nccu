import { createContext, useContext, useEffect, useState } from 'react';
import { browserStorage } from '../data/browserStorage.ts';
import { createBuddyHub, type BuddyHub } from './hub.ts';

const BuddyContext = createContext<BuddyHub | null>(null);

/** 拿到小山的事件中樞；沒有包在 BuddyProvider 裡時回傳 null（元件單獨測試時）。 */
export const useBuddyHub = () => useContext(BuddyContext);

const TEXT_TYPES = new Set(['text', 'search', '']);
/** 會讓小山「聽你打字」的輸入框：一般文字框與多行文字框，不含金鑰框。 */
const isTextBox = (target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement =>
  (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_TYPES.has(target.getAttribute('type') ?? '')))
  && !target.classList.contains('key-mask');

/**
 * 在整個頁面聽常發生的事（游標、點擊、捲動、按鍵、打字），轉給小山的事件中樞。
 * 只看「有沒有發生」和輸入框的位置，不讀打了什麼字。
 */
export function BuddyProvider({ hub: given, children }: { hub?: BuddyHub; children: React.ReactNode }) {
  const [hub] = useState(() => given ?? createBuddyHub({ storage: browserStorage() }));
  useEffect(() => {
    const options = { capture: true, passive: true } as const;
    const activity = () => hub.activity();
    let frame = 0, last: PointerEvent | null = null;
    const move = (event: PointerEvent) => {
      last = event;
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (last) hub.pointer(last.clientX, last.clientY); });
    };
    const typed = (event: Event) => {
      if ((event as InputEvent).isComposing || !isTextBox(event.target)) return;
      hub.typing(event.target.getBoundingClientRect());
    };
    const activityEvents = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart', 'focusin'] as const;
    activityEvents.forEach((type) => document.addEventListener(type, activity, options));
    document.addEventListener('pointermove', move, options);
    document.addEventListener('input', typed, options);
    document.addEventListener('compositionend', typed, options);
    return () => {
      activityEvents.forEach((type) => document.removeEventListener(type, activity, options));
      document.removeEventListener('pointermove', move, options);
      document.removeEventListener('input', typed, options);
      document.removeEventListener('compositionend', typed, options);
      cancelAnimationFrame(frame);
    };
  }, [hub]);
  useEffect(() => () => { if (!given) hub.destroy(); }, [given, hub]);
  return <BuddyContext value={hub}>{children}</BuddyContext>;
}
