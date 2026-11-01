import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTicker, createXiaoshan } from './xiaoshan.ts';

const eye = (buddy: ReturnType<typeof createXiaoshan>, side: 'L' | 'R') => buddy.el.querySelector(`.eye${side}`)!.getAttribute('d') ?? '';
const pts = (d: string) => d.slice(1, -1).split('L').map((pair) => pair.split(' ').map(Number) as [number, number]);
const centreX = (d: string) => pts(d).reduce((sum, [x]) => sum + x, 0) / pts(d).length;
const archDepth = (d: string) => {
  const p = pts(d), cx = centreX(d);
  const bottom = Math.max(...p.map(([, y]) => y));
  return bottom - Math.max(...p.filter(([x]) => Math.abs(x - cx) < 2).map(([, y]) => y));
};

afterEach(() => vi.useRealTimers());

describe('createXiaoshan', () => {
  test('is announced once as an image, or hidden when decorative', () => {
    expect(createXiaoshan({ size: 56 }).el.getAttribute('aria-label')).toBe('小山');
    const decorative = createXiaoshan({ size: 56, decorative: true }).el;
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
    expect(decorative.hasAttribute('role')).toBe(false);
  });

  test('draws two eyes, and the stream droplets only when there is room for them', () => {
    const big = createXiaoshan({ size: 200 });
    big.render(1);
    expect(eye(big, 'L')).toMatch(/^M.+Z$/);
    expect(eye(big, 'R')).toMatch(/^M.+Z$/);
    expect(big.el.querySelectorAll('.drop')).toHaveLength(2);
    expect(createXiaoshan({ size: 32 }).el.querySelectorAll('.drop')).toHaveLength(0);
  });

  test('ignores unknown moods and keeps its current one', () => {
    const buddy = createXiaoshan({ size: 56, now: () => 0 });
    buddy.setMood('thinking');
    // @ts-expect-error 測試：網站其他地方傳錯字時不會讓動畫停掉
    buddy.setMood('confused');
    expect(buddy.mood).toBe('thinking');
  });

  test('a new reaction takes over from the previous one within a moment', () => {
    let now = 10;
    const buddy = createXiaoshan({ size: 200, now: () => now, random: () => 0.99 });
    buddy.react('yay');
    now = 10.3;
    buddy.render(now);
    expect(archDepth(eye(buddy, 'R'))).toBeGreaterThan(8);
    buddy.react('nod');
    now = 10.5;
    buddy.render(now);
    expect(archDepth(eye(buddy, 'R'))).toBeLessThan(2);
  });

  test('looks toward the pointer', () => {
    const buddy = createXiaoshan({ size: 200, random: () => 0.99 });
    buddy.render(1);
    const before = centreX(eye(buddy, 'L'));
    buddy.lookAt(-2000, 0);
    for (let t = 1; t < 2; t += 0.05) buddy.render(t);
    expect(centreX(eye(buddy, 'L'))).toBeLessThan(before - 5);
  });

  test('with reduced motion it stays put but still shows a reaction for a moment', () => {
    vi.useFakeTimers();
    let now = 5;
    const buddy = createXiaoshan({ size: 200, still: true, now: () => now });
    buddy.render(now);
    const body = buddy.el.querySelector('.body')!.getAttribute('transform');
    const resting = eye(buddy, 'R');
    buddy.react('yay');
    expect(eye(buddy, 'R')).not.toBe(resting);
    now = 6;
    vi.advanceTimersByTime(900);
    expect(eye(buddy, 'R')).toBe(resting);
    expect(buddy.el.querySelector('.body')!.getAttribute('transform')).toBe(body);
  });
});

describe('createTicker', () => {
  test('drives every buddy from one animation frame and stops when none are left', () => {
    const frames: (() => void)[] = [];
    const raf = vi.fn((cb: () => void) => { frames.push(cb); return frames.length; });
    const caf = vi.fn();
    const ticker = createTicker({ raf, caf, now: () => 1, hidden: () => false });
    const a = { render: vi.fn() }, b = { render: vi.fn() };
    ticker.add(a);
    ticker.add(b);
    expect(raf).toHaveBeenCalledTimes(1);
    frames.shift()!();
    expect(a.render).toHaveBeenCalledWith(1);
    expect(b.render).toHaveBeenCalledWith(1);
    ticker.remove(a);
    ticker.remove(b);
    expect(caf).toHaveBeenCalled();
  });

  test('does not draw while the tab is hidden', () => {
    const frames: (() => void)[] = [];
    let hidden = true;
    const ticker = createTicker({ raf: (cb) => { frames.push(cb); return 1; }, caf: () => {}, now: () => 1, hidden: () => hidden });
    const a = { render: vi.fn() };
    ticker.add(a);
    expect(frames).toHaveLength(0);
    hidden = false;
    ticker.wake();
    frames.shift()!();
    expect(a.render).toHaveBeenCalled();
  });
});
