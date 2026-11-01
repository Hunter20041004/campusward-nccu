// 小山的事件中樞（2026-11-01 使用者要求：反應要跟著常發生的事，不是排好了、有衝堂這種少見結果）。
// 決定「現在誰在反應」：面板關著是右下角光球，開著是面板裡那隻；結果卡等小頭像只顯示靜態表情。
import type { StorageLike } from '@campusward/engine';
import type { BuddyMood, BuddyReaction } from './motion.ts';

export const QUIET_KEY = 'campusward:v1:buddy-quiet';
/** 多久沒操作就打瞌睡。 */
export const SLEEP_AFTER_MS = 100_000;
const LISTEN_MS = 1500;
const YAY_COOLDOWN_MS = 20_000;
const THINK_LIMIT_MS = 30_000;
const WORRY_MS = 1500;

export interface BuddyLike {
  readonly mood: BuddyMood;
  setMood: (mood: BuddyMood) => void;
  react: (kind: BuddyReaction) => void;
  poke: () => void;
  lookAt: (x: number, y: number) => void;
  lookAway: () => void;
  setStill: (still: boolean) => void;
}

interface Box { left: number; top: number; width: number; height: number }
export type BuddyRole = 'orb' | 'panel';
export type CourseChange = 'add' | 'remove' | 'candidate' | 'undo';
export type AiResultKind = 'answered' | 'applied' | 'confirm' | 'rejected' | 'failed';

export interface BuddyHub {
  readonly quiet: boolean;
  attach: (role: BuddyRole, buddy: BuddyLike) => void;
  detach: (role: BuddyRole, buddy: BuddyLike) => void;
  setPanelOpen: (open: boolean) => void;
  activity: () => void;
  pointer: (x: number, y: number) => void;
  typing: (box: Box) => void;
  changed: (kind: CourseChange, detail?: { conflict?: boolean }) => void;
  aiStart: () => void;
  /** AI 回覆到了：先「講」一下（依文字長度 0.6～2 秒），再依結果反應。confirm 時持續看著 target 回傳的按鈕。 */
  aiResult: (kind: AiResultKind, textLength: number, target?: () => Box | undefined) => void;
  aiConfirmDone: () => void;
  aiCancel: () => void;
  setQuiet: (quiet: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
}

const readQuiet = (storage: StorageLike) => {
  try { return storage.getItem(QUIET_KEY) === '1'; } catch { return false; }
};

export function createBuddyHub({ storage, now = () => Date.now() }: { storage: StorageLike; now?: () => number }): BuddyHub {
  const buddies: Partial<Record<BuddyRole, BuddyLike>> = {};
  const listeners = new Set<() => void>();
  let panelOpen = false, busy = false, quiet = readQuiet(storage);
  let lastActive = now(), lastYay = -Infinity;
  let listenTimer: ReturnType<typeof setTimeout> | undefined, thinkTimer: ReturnType<typeof setTimeout> | undefined;
  let afterTimer: ReturnType<typeof setTimeout> | undefined, confirmTimer: ReturnType<typeof setInterval> | undefined;
  const active = () => buddies[panelOpen ? 'panel' : 'orb'];
  const setMood = (mood: BuddyMood) => active()?.setMood(mood);
  const react = (kind: BuddyReaction) => active()?.react(kind);
  const centre = (box: Box) => [box.left + box.width / 2, box.top + box.height / 2] as const;

  const sleepCheck = setInterval(() => {
    const buddy = active();
    if (!busy && buddy?.mood === 'idle' && now() - lastActive > SLEEP_AFTER_MS) buddy.setMood('sleepy');
  }, 1000);

  const stopConfirm = () => { clearInterval(confirmTimer); confirmTimer = undefined; };
  const settle = () => { busy = false; clearTimeout(thinkTimer); lastActive = now(); };

  const hub: BuddyHub = {
    get quiet() { return quiet; },
    attach(role, buddy) {
      buddies[role] = buddy;
      buddy.setStill(quiet);
    },
    detach(role, buddy) {
      if (buddies[role] === buddy) delete buddies[role];
    },
    setPanelOpen(open) {
      if (open === panelOpen) return;
      panelOpen = open;
      lastActive = now();
      if (open) {
        buddies.orb?.setMood('idle');
        buddies.panel?.setMood(busy ? 'thinking' : 'idle');
        buddies.panel?.react('wake');
        setTimeout(() => { if (panelOpen) buddies.panel?.react('nod'); }, 450);
      } else {
        buddies.panel?.setMood('idle');
        buddies.orb?.setMood(busy ? 'thinking' : 'idle');
        buddies.orb?.react('glance');
      }
    },
    activity() {
      lastActive = now();
      const buddy = active();
      if (buddy?.mood === 'sleepy') { buddy.setMood('idle'); buddy.react('wake'); }
    },
    pointer(x, y) {
      hub.activity();
      const buddy = active();
      if (buddy && buddy.mood !== 'listening' && !confirmTimer) buddy.lookAt(x, y);
    },
    typing(box) {
      hub.activity();
      const buddy = active();
      if (!buddy) return;
      buddy.poke();
      if (busy) return;
      buddy.setMood('listening');
      buddy.lookAt(...centre(box));
      clearTimeout(listenTimer);
      listenTimer = setTimeout(() => {
        if (active()?.mood === 'listening') { setMood('idle'); active()?.lookAway(); }
      }, LISTEN_MS);
    },
    changed(kind, detail = {}) {
      lastActive = now();
      if (kind === 'undo') { react('glance'); return; }
      if (kind === 'add' && !detail.conflict && now() - lastYay > YAY_COOLDOWN_MS) {
        lastYay = now();
        react('yay');
        return;
      }
      react('nod');
    },
    aiStart() {
      busy = true;
      stopConfirm();
      clearTimeout(afterTimer);
      clearTimeout(listenTimer);
      setMood('thinking');
      active()?.lookAway();
      clearTimeout(thinkTimer);
      thinkTimer = setTimeout(() => { busy = false; setMood('idle'); }, THINK_LIMIT_MS);
    },
    aiResult(kind, textLength, target) {
      settle();
      clearTimeout(afterTimer);
      if (kind === 'failed' || kind === 'rejected') {
        setMood('worried');
        afterTimer = setTimeout(() => setMood('idle'), WORRY_MS);
        return;
      }
      setMood('talking');
      active()?.lookAway();
      afterTimer = setTimeout(() => {
        setMood('idle');
        lastActive = now();
        if (kind === 'applied') { lastYay = now(); react('yay'); return; }
        if (kind === 'answered') { react('nod'); return; }
        const look = () => {
          const box = target?.();
          const buddy = active();
          if (!box || !buddy) return;
          buddy.lookAt(...centre(box));
          buddy.poke();
        };
        look();
        stopConfirm();
        confirmTimer = setInterval(look, 4000);
      }, Math.min(2000, 600 + textLength * 30));
    },
    aiConfirmDone() {
      stopConfirm();
      active()?.lookAway();
    },
    aiCancel() {
      settle();
      stopConfirm();
      clearTimeout(afterTimer);
      setMood('idle');
    },
    setQuiet(next) {
      quiet = next;
      try { storage.setItem(QUIET_KEY, next ? '1' : '0'); } catch { /* 瀏覽器擋住儲存時，只在這次有效 */ }
      Object.values(buddies).forEach((buddy) => buddy?.setStill(next));
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      clearInterval(sleepCheck);
      stopConfirm();
      [listenTimer, thinkTimer, afterTimer].forEach((timer) => clearTimeout(timer));
    },
  };
  return hub;
}
