// 小山的動作數學（2026-11-01 使用者要求參考 Grok Bot：兩個顏色、只靠眼睛形狀和身體動作表達）。
// 這裡只有純函式，不碰畫面；xiaoshan.ts 負責把結果畫到 SVG。

export type BuddyMood = 'idle' | 'listening' | 'thinking' | 'talking' | 'sleepy' | 'happy' | 'worried';
export type BuddyReaction = 'yay' | 'nod' | 'glance' | 'wake';

export interface EyeShape {
  /** 眼睛中心離臉中線的距離。 */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 外側往上斜的角度（度）。 */
  rot: number;
  /** 上眼皮蓋住的比例。 */
  lid: number;
  /** 上眼皮外側多蓋的比例：正值是外側下垂（擔心）。 */
  tilt: number;
  /** 下緣往上挖成弧形的比例（笑眼）。 */
  smile: number;
  dx: number;
  dy: number;
}

type Pose = Partial<EyeShape> & { L?: Partial<EyeShape>; R?: Partial<EyeShape> };

export const BASE_EYE: EyeShape = { cx: 19, cy: 120, w: 25, h: 39, rot: 5, lid: 0, tilt: 0, smile: 0, dx: 0, dy: 0 };

/** 每種狀態的眼睛姿勢序列：每 every 秒換下一個；speed 是醉夢溪水珠繞山的速度（弧度／秒）。 */
export const MOODS: Record<BuddyMood, { every: number; speed: number; poses: Pose[] }> = {
  idle: { every: 3.2, speed: 0.35, poses: [{}, { dx: -8, dy: 2 }, { dx: 8, dy: -3 }, { dx: 0, dy: 3 }] },
  listening: { every: 99, speed: 0.5, poses: [{ w: 27, h: 45, dy: -3 }] },
  thinking: { every: 1.8, speed: 0.9, poses: [{ dx: 11, dy: -11, w: 22, h: 34, R: { h: 37 } }, { dx: 13, dy: -12, w: 22, h: 34, L: { h: 30 } }, { dx: -11, dy: -11, w: 22, h: 34 }] },
  talking: { every: 99, speed: 0.6, poses: [{ w: 25, h: 37 }] },
  sleepy: { every: 99, speed: 0.08, poses: [{ lid: 0.7, dy: 8, w: 24, h: 30 }] },
  happy: { every: 2.4, speed: 1.4, poses: [{ smile: 0.42, w: 26, h: 32, dy: -2 }, { smile: 0.45, w: 26, h: 33, dy: -3, dx: 3 }, { smile: 0.4, w: 26, h: 32, dx: -3, dy: -2 }] },
  worried: { every: 3, speed: 0.22, poses: [{ w: 23, h: 38, tilt: 0.3, dy: -2 }, { w: 23, h: 39, tilt: 0.32, dy: -3, dx: -4 }, { w: 23, h: 38, tilt: 0.3, dy: -2, dx: 4 }] },
};

/** 一次性反應的長度（秒）。 */
export const REACTION_LENGTH: Record<BuddyReaction, number> = { yay: 0.9, nod: 0.45, glance: 0.6, wake: 0.55 };
/** 減少動態時，反應改成這些靜態眼形顯示一下。 */
export const REACTION_STILL: Record<BuddyReaction, Partial<EyeShape>> = { yay: { smile: 0.42, w: 26, h: 32 }, nod: { lid: 0.4 }, glance: { dx: 12 }, wake: { w: 27, h: 44 } };

const TAU = Math.PI * 2;
const EYE_KEYS = Object.keys(BASE_EYE) as (keyof EyeShape)[];
export const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const bump = (p: number, rise: number, fall: number) => (p < rise ? p / rise : p > 1 - fall ? (1 - p) / fall : 1);
export const lerpEye = (a: EyeShape, b: EyeShape, k: number): EyeShape => {
  const out = { ...b };
  for (const key of EYE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
};
export const eyeOf = (pose: Pose, side: -1 | 1): EyeShape => {
  const { L, R, ...shared } = pose;
  return { ...BASE_EYE, ...shared, ...(side < 0 ? L : R) };
};

/** 一隻眼睛的外框：圓角膠囊，再依眼皮、下垂、笑眼切掉一部分。side：-1 左眼、1 右眼。 */
export function eyePath(p: EyeShape, side: -1 | 1): string {
  const N = 64, a = p.w / 2, b = p.h / 2, n = 2.6, pts: string[] = [];
  const r = (p.rot * -side * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r);
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU, c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let y = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const outer = ((x * side) / a + 1) / 2;
    const lidY = -b + p.h * (p.lid + p.tilt * outer);
    const smileY = b - p.smile * p.h * (1 - (x / a) ** 2);
    if (y > smileY) y = smileY;
    if (y < lidY) y = lidY;
    pts.push(`${(x * cr - y * sr + 100 + p.cx * side + p.dx).toFixed(1)} ${(x * sr + y * cr + p.cy + p.dy).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** 某狀態在時間 t（狀態開始後 lt 秒）的雙眼：照姿勢序列換，換的時候放大一點再收回。 */
export function eyesAt(mood: BuddyMood, _t: number, elapsed: number): [EyeShape, EyeShape] {
  const { every, poses } = MOODS[mood];
  const lt = Math.max(0, elapsed);
  const seg = Math.floor(lt / every), local = lt - seg * every;
  const cur = poses[seg % poses.length]!, prev = poses[(seg + poses.length - 1) % poses.length]!;
  const morph = seg === 0 ? 1 : Math.min(1, local / 0.72);
  const k = ease(morph), pulse = seg === 0 ? 0 : Math.sin(Math.PI * morph);
  const kPos = k + (k > 0.5 ? 0.08 * Math.sin(Math.PI * k) : 0);
  const squint = Math.pow(pulse, 4) * 0.18;
  const eye = (side: -1 | 1) => {
    const a = eyeOf(prev, side), b = eyeOf(cur, side);
    const e = lerpEye(a, b, k);
    e.dx = a.dx + (b.dx - a.dx) * kPos;
    e.dy = a.dy + (b.dy - a.dy) * kPos;
    e.w *= 1 + 0.05 * pulse;
    e.h *= (1 + 0.05 * pulse) * (1 - squint);
    return e;
  };
  return [eye(-1), eye(1)];
}

export interface BodyPose { tx: number; ty: number; rot: number; sx: number; sy: number; groundTy: number }

/** 漂浮幅度（viewBox 單位）：小尺寸放大，讓畫面上至少有幾個像素的起伏。 */
const floatAmp = (size: number) => Math.max(3, Math.min(12, (3.5 * 220) / size));
/** 畫面上的上下起伏（像素，峰到峰）。 */
export const screenFloat = (size: number) => (2 * floatAmp(size) * size) / 220;

/** 身體漂浮：三種週期不同的晃動疊在一起（18.29、7.835、13.71 秒，和 Grok Bot 相同），不會機械地重複。 */
export function bodyAt(mood: BuddyMood, t: number, lt: number, size: number): BodyPose {
  let amp = floatAmp(size);
  if (mood === 'worried') amp *= 0.6;
  if (mood === 'sleepy') amp *= 0.4;
  let tx = amp * Math.sin((TAU * t) / 18.29 - 3.07);
  const ty = amp * Math.sin((TAU * t) / 7.835 - 0.83);
  let rot = 1.2 * Math.sin((TAU * t) / 13.71 + 2.27);
  let sx = 1, sy = 1, bob = 0;
  if (mood === 'sleepy') { rot *= 0.4; sy = 0.985; bob = 1.5 * Math.sin((TAU * t) / 3.4); }
  if (mood === 'thinking') rot = -1.5 + 0.8 * Math.sin(t * 1.6);
  if (mood === 'worried') {
    sx = 1.015; sy = 0.975;
    const ls = lt % 5;
    if (ls < 0.35) tx += 1.2 * Math.sin(ls * 60) * Math.exp(-ls * 8);
  }
  if (mood === 'talking') bob = -1.2 * Math.abs(Math.sin(t * 8));
  return { tx, ty: ty + bob, rot, sx, sy, groundTy: ty };
}

/** 眨眼：每次眨完才排下一次（2.6～5.8 秒，偶爾連眨兩下），頁面開多久都會一直眨。回傳闔眼程度 0～1。 */
export function createBlinker(random: () => number) {
  let next = 1.2 + random() * 2, start = -9, double = false;
  return (t: number) => {
    if (t >= next) {
      start = next;
      next = double ? t + 0.22 : t + 2.6 + 3.2 * random();
      double = !double && random() < 0.15;
    }
    if (t - start > 30) { start = -9; if (next < t) next = t + 2.6 * random(); }
    const k = (t - start) / 0.14;
    return k >= 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
  };
}
