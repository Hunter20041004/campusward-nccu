// 小山可以拖到畫面任何位置（2026-11-01 使用者要求）：位置以「離右邊、離下面幾像素」記錄，
// 存在這台裝置（清除本機資料時一併清掉），每次都夾在畫面裡。
import type { StorageLike } from '@campusward/engine';

export const ORB_POSITION_KEY = 'campusward:v1:buddy-position';
export const ORB_SIZE = 64;
const MARGIN = 8;
const GAP = 16;
/** 面板上緣至少留給頂列的高度。 */
const TOP_CLEARANCE = 80;

export interface OrbPosition { right: number; bottom: number }
interface View { width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** 夾在畫面裡；bottomInset 是手機底部分頁列的高度。 */
export function clampOrb(position: OrbPosition, view: View, bottomInset = 0): OrbPosition {
  return {
    right: Math.round(clamp(position.right, MARGIN, view.width - ORB_SIZE - MARGIN)),
    bottom: Math.round(clamp(position.bottom, MARGIN + bottomInset, view.height - ORB_SIZE - MARGIN)),
  };
}

export function loadOrbPosition(storage: StorageLike): OrbPosition | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(ORB_POSITION_KEY) ?? '');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { right, bottom } = value as Record<string, unknown>;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10_000;
    return ok(right) && ok(bottom) ? { right, bottom } : null;
  } catch {
    return null;
  }
}

export function saveOrbPosition(storage: StorageLike, position: OrbPosition): void {
  try {
    storage.setItem(ORB_POSITION_KEY, JSON.stringify({ right: Math.round(position.right), bottom: Math.round(position.bottom) }));
  } catch {
    // 瀏覽器擋住儲存時，位置只在這次有效。
  }
}

/** 桌機面板放在小山旁邊：小山在右半邊就開在它左邊，在左半邊就開在右邊；上緣不超出頂列。 */
export function panelPlacement(position: OrbPosition, view: View, panel: View): { right: number; bottom: number } | { left: number; bottom: number } {
  const orbLeft = view.width - position.right - ORB_SIZE;
  const bottom = Math.max(MARGIN, Math.min(position.bottom, view.height - panel.height - TOP_CLEARANCE));
  return orbLeft + ORB_SIZE / 2 > view.width / 2
    ? { right: position.right + ORB_SIZE + GAP, bottom }
    : { left: orbLeft + ORB_SIZE + GAP, bottom };
}
