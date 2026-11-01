import { useEffect, useRef } from 'react';
import { useBuddyHub } from './BuddyContext.tsx';
import type { BuddyLike, BuddyRole } from './hub.ts';
import type { BuddyMood } from './motion.ts';
import { createXiaoshan, sharedTicker } from './xiaoshan.ts';

const reducedMotion = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof requestAnimationFrame === 'function' && !reducedMotion();

/**
 * 小山。有 role 的（右下角按鈕、面板標題）交給事件中樞驅動；沒有 role 的（結果卡、今日重點旁的小頭像）
 * 只顯示 mood 指定的靜態表情。系統開了「減少動態」或使用者按了「讓小山安靜」就不動。
 * 旁邊都有文字說明，所以一律對報讀器隱藏，不重複唸「小山」。
 */
export function Xiaoshan({ size, role, mood = 'idle', seed = 0, className = '' }: { size: number; role?: BuddyRole; mood?: BuddyMood; seed?: number; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const hub = useBuddyHub();
  const engine = useRef<ReturnType<typeof createXiaoshan> | null>(null);

  useEffect(() => {
    const animated = Boolean(role) && canAnimate();
    const buddy = createXiaoshan({ size, seed, decorative: true, still: !animated });
    engine.current = buddy;
    host.current?.append(buddy.el);
    buddy.render(performance.now() / 1000);
    const ticker = animated ? sharedTicker() : null;
    let quiet = hub?.quiet ?? false;
    const sync = () => {
      const still = !animated || quiet;
      buddy.setStill(still);
      if (ticker) { if (still) ticker.remove(buddy); else ticker.add(buddy); }
    };
    const adapter: BuddyLike = {
      get mood() { return buddy.mood; },
      setMood: buddy.setMood,
      react: buddy.react,
      poke: buddy.poke,
      lookAt: buddy.lookAt,
      lookAway: buddy.lookAway,
      setStill: (next) => { quiet = next; sync(); },
    };
    if (role && hub) hub.attach(role, adapter);
    else sync();
    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMotion = () => { quiet = hub?.quiet ?? false; if (motion?.matches) { ticker?.remove(buddy); buddy.setStill(true); } else sync(); };
    motion?.addEventListener('change', onMotion);
    return () => {
      motion?.removeEventListener('change', onMotion);
      if (role && hub) hub.detach(role, adapter);
      ticker?.remove(buddy);
      buddy.destroy();
      buddy.el.remove();
      engine.current = null;
    };
  }, [hub, role, seed, size]);

  useEffect(() => {
    if (!role) engine.current?.setMood(mood);
  }, [mood, role]);

  return <span ref={host} className={`inline-flex shrink-0 ${className}`} />;
}
