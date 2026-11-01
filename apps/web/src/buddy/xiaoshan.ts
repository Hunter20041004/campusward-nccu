// 把小山畫進 SVG（造型見 docs/design 的小助手一節）：霧藍玻璃質感的指南山雙峰、兩隻深色眼睛、
// 醉夢溪化成兩顆在山腳地面繞行的薄荷色水珠。所有小山共用一個 requestAnimationFrame（createTicker）。
import {
  bodyAt, bump, createBlinker, ease, eyeOf, eyePath, eyesAt, lerpEye, MOODS, REACTION_LENGTH, REACTION_STILL,
  type BodyPose, type BuddyMood, type BuddyReaction, type EyeShape,
} from './motion.ts';

const BODY = 'M12 166 C24 160 28 146 36 130 C46 108 54 88 70 80 C82 75 90 80 98 85 C106 74 118 64 134 66 C152 68 164 100 172 130 C178 148 182 160 192 166 C150 172 50 172 12 166 Z';
const RIM = 'M12 166 C24 160 28 146 36 130 C46 108 54 88 70 80 C82 75 90 80 98 85 C106 74 118 64 134 66 C152 68 164 100 172 130';
const TAU = Math.PI * 2;
const GAZE_MOODS = new Set<BuddyMood>(['idle', 'listening', 'talking']);
const BODY_KEYS = ['tx', 'ty', 'rot', 'sx', 'sy', 'groundTy'] as const;
const NS = 'http://www.w3.org/2000/svg';

export interface XiaoshanOptions {
  size: number;
  /** 讓同一頁的幾隻小山眨眼、水珠位置錯開。 */
  seed?: number;
  /** 旁邊已有文字說明時用：整個圖對報讀器隱藏。 */
  decorative?: boolean;
  /** 減少動態：不動，只換靜態表情。 */
  still?: boolean;
  now?: () => number;
  random?: () => number;
}

export interface Xiaoshan {
  readonly el: SVGSVGElement;
  readonly mood: BuddyMood;
  render: (t: number) => void;
  setMood: (mood: BuddyMood) => void;
  react: (kind: BuddyReaction) => void;
  /** 打字時每個字輕輕點一下（會累積再慢慢消退）。 */
  poke: () => void;
  lookAt: (clientX: number, clientY: number) => void;
  lookAway: () => void;
  setStill: (still: boolean) => void;
  destroy: () => void;
}

let uid = 0;

export function createXiaoshan({ size, seed = 0, decorative = false, still: startStill = false, now = () => performance.now() / 1000, random }: XiaoshanOptions): Xiaoshan {
  const id = `xs${++uid}`;
  let state = (uid * 7919 + seed * 104729) % 233280;
  const rnd = random ?? (() => (state = (state * 9301 + 49297) % 233280) / 233280);
  const eyeScale = size <= 40 ? 1.25 : size <= 64 ? 1.12 : 1;
  const showDrops = size > 40, arc = size > 64 ? 0.6 : 0.35, offset = Math.PI / 2 + seed * 0.7;
  const svg = document.createElementNS(NS, 'svg');
  // 框住山體、跳躍空間與水珠軌道（上方留 30 給跳躍），放進圓形按鈕時才會置中。
  svg.setAttribute('viewBox', '-10 34 220 154');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * 154) / 220)));
  svg.setAttribute('overflow', 'visible');
  if (decorative) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); }
  else { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '小山'); }
  svg.innerHTML = `<defs>
<linearGradient id="${id}b" x1=".15" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#DCE5FD"/><stop offset=".35" stop-color="#A9BBEA"/><stop offset=".75" stop-color="#6C80C4"/><stop offset="1" stop-color="#4B5DA3"/></linearGradient>
<radialGradient id="${id}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}i" cx=".5" cy=".85" r=".6"><stop offset="0" stop-color="#EEF2FF" stop-opacity=".5"/><stop offset="1" stop-color="#EEF2FF" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".6" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}t0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5FD3C4" stop-opacity=".85"/><stop offset="1" stop-color="#5FD3C4" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}t1" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5FD3C4" stop-opacity=".85"/><stop offset="1" stop-color="#5FD3C4" stop-opacity="0"/></linearGradient>
<filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
<clipPath id="${id}c"><path d="${BODY}"/></clipPath>
</defs>
<g class="back"></g>
<ellipse class="shadow" cx="102" cy="168" rx="86" ry="8" fill="url(#${id}s)"/>
<g class="body">
<path d="${BODY}" fill="url(#${id}b)" fill-opacity=".93" stroke="#3A4C8F" stroke-opacity=".3" stroke-width="1"/>
<g clip-path="url(#${id}c)">
<ellipse cx="100" cy="160" rx="70" ry="24" fill="url(#${id}i)"/>
<path d="M172 130 C178 148 182 160 192 166 C150 172 50 172 12 166" fill="none" stroke="#3A4C8F" stroke-width="10" opacity=".22" filter="url(#${id}f)"/>
<path d="${RIM}" fill="none" stroke="url(#${id}r)" stroke-width="3.5"/>
<ellipse cx="58" cy="100" rx="24" ry="11" transform="rotate(-45 58 100)" fill="url(#${id}h)" filter="url(#${id}f)"/>
<ellipse cx="54" cy="100" rx="6.5" ry="2.8" transform="rotate(-50 54 100)" fill="#fff" opacity=".9"/>
</g>
<g clip-path="url(#${id}c)"><g class="eyes"><path class="eyeL" fill="#141B33"/><path class="eyeR" fill="#141B33"/></g></g>
</g>
<g class="front"></g>`;
  const q = <T extends Element>(selector: string) => svg.querySelector<T>(selector)!;
  const eyesG = q('.eyes'), body = q('.body'), shadow = q('.shadow'), back = q('.back'), front = q('.front'), eL = q('.eyeL'), eR = q('.eyeR');
  const drops = showDrops ? [0, 1].map((i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'drop');
    g.innerHTML = `<path fill="url(#${id}t${i})"/><ellipse fill="#3FB5A8" stroke="#2A8C83" stroke-opacity=".5" stroke-width=".6"/><circle fill="#fff" opacity=".85"/>`;
    back.append(g);
    const [trail, head, shine] = [...g.children] as [SVGPathElement, SVGEllipseElement, SVGCircleElement];
    return { g, trail, head, shine, grad: q(`#${id}t${i}`), side: -1 };
  }) : [];

  let mood: BuddyMood = 'idle', switchAt = now(), lastT = now(), phase = 0, speedNow = MOODS.idle.speed;
  let fromBody: BodyPose | null = null, fromEyes: [EyeShape, EyeShape] | null = null;
  let reactions: { kind: BuddyReaction; at: number; endAt?: number }[] = [];
  let poke = 0, lastPoke = -9, pointer: { x: number; y: number } | null = null;
  let gazeTarget = { x: 0, y: 0 };
  const gaze = { x: 0, y: 0 };
  let still = startStill, stillTimer: ReturnType<typeof setTimeout> | undefined;
  const blink = createBlinker(rnd);
  const cache = { l: '', r: '' };

  const basePose = (t: number) => {
    const lt = t - switchAt;
    let b = bodyAt(mood, t, lt, size);
    let eyes = eyesAt(mood, t, lt);
    if (fromBody && lt < 0.4) {
      const k = ease(lt / 0.4), from = fromBody;
      b = { ...b };
      for (const key of BODY_KEYS) b[key] = from[key] + (b[key] - from[key]) * k;
    }
    if (fromEyes && lt < 0.32) { const from = fromEyes; eyes = [lerpEye(from[0], eyes[0], ease(lt / 0.32)), lerpEye(from[1], eyes[1], ease(lt / 0.32))]; }
    return { b, eyes };
  };
  const orbit = (ang: number, b: BodyPose) => [100 + b.tx * 0.6 + 96 * Math.cos(ang), 167 + b.groundTy + 9 * Math.sin(ang)] as const;

  function draw(b: BodyPose & { lift: number }, eyes: EyeShape[], t: number, dt: number, frozen: boolean) {
    body.setAttribute('transform', `translate(${b.tx.toFixed(2)} ${b.ty.toFixed(2)}) rotate(${b.rot.toFixed(2)} 100 130) translate(100 168) scale(${b.sx} ${b.sy}) translate(-100 -168)`);
    shadow.setAttribute('transform', `translate(${(b.tx * 0.6).toFixed(2)} 0) translate(102 168) scale(${(1 - b.lift / 40).toFixed(3)} 1) translate(-102 -168)`);
    shadow.setAttribute('opacity', Math.max(0.3, 1 - b.lift / 14).toFixed(3));
    const dl = eyePath(eyes[0]!, -1), dr = eyePath(eyes[1]!, 1);
    if (dl !== cache.l) eL.setAttribute('d', (cache.l = dl));
    if (dr !== cache.r) eR.setAttribute('d', (cache.r = dr));
    const driftX = frozen ? 0 : (1.2 * Math.sin((TAU * t) / 5.3) + 0.6 * Math.sin((TAU * t) / 2.1) - b.rot * 0.8) * eyeScale;
    const driftY = frozen ? 0 : 0.8 * Math.sin((TAU * t) / 6.7) * eyeScale;
    eyesG.setAttribute('transform', `translate(${driftX.toFixed(2)} ${driftY.toFixed(2)})`);
    speedNow += (MOODS[mood].speed - speedNow) * Math.min(1, dt * 3);
    phase += dt * speedNow;
    drops.forEach((d, i) => {
      const ang = frozen ? [2.2, -0.6][i]! : phase + offset + i * Math.PI;
      const depth = (Math.sin(ang) + 1) / 2;
      const r = size > 64 ? 3.8 + 2.4 * depth : 8;
      const [hx, hy] = orbit(ang, b);
      const tangent = (Math.atan2(9 * Math.cos(ang), -96 * Math.sin(ang)) * 180) / Math.PI;
      d.g.setAttribute('opacity', (0.65 + 0.35 * depth).toFixed(2));
      d.head.setAttribute('cx', hx.toFixed(2)); d.head.setAttribute('cy', hy.toFixed(2));
      d.head.setAttribute('rx', (1.4 * r).toFixed(2)); d.head.setAttribute('ry', r.toFixed(2));
      d.head.setAttribute('transform', `rotate(${tangent.toFixed(1)} ${hx.toFixed(2)} ${hy.toFixed(2)})`);
      d.shine.setAttribute('cx', (hx - 0.3 * r).toFixed(2)); d.shine.setAttribute('cy', (hy - 0.35 * r).toFixed(2)); d.shine.setAttribute('r', (0.35 * r).toFixed(2));
      const left: string[] = [], right: string[] = [];
      for (let k = 0; k <= 14; k++) {
        const a = ang - (arc * k) / 14, [x, y] = orbit(a, b);
        const tx = -96 * Math.sin(a), ty = 9 * Math.cos(a), len = Math.hypot(tx, ty) || 1, w = r * Math.pow(1 - k / 14, 1.5);
        left.push(`${(x - (ty / len) * w).toFixed(1)} ${(y + (tx / len) * w).toFixed(1)}`);
        right.unshift(`${(x + (ty / len) * w).toFixed(1)} ${(y - (tx / len) * w).toFixed(1)}`);
      }
      d.trail.setAttribute('d', `M${[...left, ...right].join('L')}Z`);
      const [ex, ey] = orbit(ang - arc, b);
      d.grad.setAttribute('x1', hx.toFixed(1)); d.grad.setAttribute('y1', hy.toFixed(1)); d.grad.setAttribute('x2', ex.toFixed(1)); d.grad.setAttribute('y2', ey.toFixed(1));
      const side = Math.sin(ang) > 0 ? 1 : -1;
      if (side !== d.side) { (side > 0 ? front : back).append(d.g); d.side = side; }
    });
  }

  function renderStill(t: number) {
    const reaction = reactions.find((r) => t - r.at < 0.8);
    const pose = { ...MOODS[mood].poses[0], ...(reaction ? REACTION_STILL[reaction.kind] : {}) };
    const eyes = ([-1, 1] as const).map((side) => {
      const e = eyeOf(pose, side);
      e.w *= eyeScale; e.h *= eyeScale; e.dx *= eyeScale; e.dy *= eyeScale;
      return e;
    });
    draw({ tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, groundTy: 0, lift: 0 }, eyes, t, 0, true);
  }

  function render(t: number) {
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    if (still) { renderStill(t); return; }
    const pose = basePose(t);
    const b = { ...pose.b, lift: 0 };
    const eyes = pose.eyes;
    if (pointer) {
      // 游標位置只在這一格讀一次版面
      const r = svg.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height * 0.6), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      gazeTarget = { x: (dx / d) * k, y: (dy / d) * k };
      pointer = null;
    }
    const target = GAZE_MOODS.has(mood) ? gazeTarget : { x: 0, y: 0 };
    gaze.x += (target.x - gaze.x) * Math.min(1, dt * 8);
    gaze.y += (target.y - gaze.y) * Math.min(1, dt * 8);
    let gazeKeep = 1, glanceDx = 0;
    reactions = reactions.filter((r) => t - r.at < REACTION_LENGTH[r.kind] && (r.endAt === undefined || t < r.endAt));
    for (const r of reactions) {
      const p = (t - r.at) / REACTION_LENGTH[r.kind], fade = r.endAt === undefined ? 1 : Math.max(0, (r.endAt - t) / 0.12);
      if (r.kind === 'yay') {
        const w = bump(p, 0.12, 0.22) * fade;
        for (const e of eyes) { e.smile += (0.42 - e.smile) * w; e.lid *= 1 - w; e.tilt *= 1 - w; e.w += (26 - e.w) * w; e.h += (32 - e.h) * w; }
        if (p < 0.45) { const hop = 9 * Math.sin((Math.PI * p) / 0.45) * fade; b.ty -= hop; b.lift += hop; }
      } else if (r.kind === 'nod') {
        const k = Math.sin(Math.PI * p) * fade;
        for (const e of eyes) { e.h *= 1 - 0.45 * k; e.dy += 4 * k; }
        b.ty += 4 * k; b.rot += 2 * k;
      } else if (r.kind === 'glance') {
        const w = bump(p, 0.2, 0.35) * fade;
        gazeKeep *= 1 - w; glanceDx += 12 * w;
      } else {
        const w = bump(p, 0.1, 0.5) * fade;
        for (const e of eyes) { e.w *= 1 + 0.1 * w; e.h *= 1 + 0.16 * w; }
        if (p < 0.4) { const hop = 5 * Math.sin((Math.PI * p) / 0.4) * fade; b.ty -= hop; b.lift += hop; }
      }
    }
    poke *= Math.exp(-dt * 9);
    b.ty += 2 * poke;
    const shut = mood === 'sleepy' || mood === 'happy' ? 0 : blink(t);
    for (const e of eyes) {
      e.h *= 1 - 0.12 * poke;
      if (mood === 'sleepy') e.lid = Math.min(0.8, e.lid + 0.06 * Math.sin((TAU * t) / 3.4));
      if (mood === 'talking') { e.dy -= 2.5 * Math.abs(Math.sin(t * 8)); e.h *= 0.93 + 0.07 * Math.abs(Math.sin(t * 8 + 1)); }
      e.dx = Math.max(-16, Math.min(16, e.dx + gaze.x * 11 * gazeKeep + glanceDx));
      e.dy = Math.max(-16, Math.min(16, e.dy + gaze.y * 7 * gazeKeep));
      e.h *= 1 - shut;
      e.w *= eyeScale; e.h *= eyeScale; e.dx *= eyeScale; e.dy *= eyeScale;
    }
    draw(b, eyes, t, dt, false);
  }

  return {
    el: svg,
    get mood() { return mood; },
    render,
    setMood(next) {
      if (!(next in MOODS) || next === mood) return;
      const t = now(), pose = basePose(t);
      fromBody = pose.b; fromEyes = pose.eyes; mood = next; switchAt = t;
      if (still) render(t);
    },
    react(kind) {
      if (!(kind in REACTION_LENGTH)) return;
      const t = now();
      for (const r of reactions) r.endAt ??= t + 0.12;
      reactions.push({ kind, at: t });
      if (still) {
        render(t);
        clearTimeout(stillTimer);
        stillTimer = setTimeout(() => render(now()), 820);
      }
    },
    poke() {
      const t = now();
      if (t - lastPoke < 0.25) return;
      lastPoke = t;
      poke = Math.min(1, poke + 0.5);
    },
    lookAt(x, y) { pointer = { x, y }; },
    lookAway() { pointer = null; gazeTarget = { x: 0, y: 0 }; },
    setStill(next) { still = next; render(now()); },
    destroy() { clearTimeout(stillTimer); },
  };
}

interface TickerDeps { raf: (cb: () => void) => number; caf: (handle: number) => void; now: () => number; hidden: () => boolean }

/** 所有小山共用的一個動畫迴圈：沒有小山或分頁在背景時就停。 */
export function createTicker({ raf, caf, now, hidden }: TickerDeps) {
  const items = new Set<{ render: (t: number) => void }>();
  let handle = 0, scheduled = false;
  const frame = () => {
    scheduled = false;
    const t = now();
    items.forEach((item) => item.render(t));
    schedule();
  };
  const schedule = () => {
    if (scheduled || !items.size || hidden()) return;
    scheduled = true;
    handle = raf(frame);
  };
  return {
    add(item: { render: (t: number) => void }) { items.add(item); schedule(); },
    remove(item: { render: (t: number) => void }) {
      items.delete(item);
      if (!items.size && scheduled) { caf(handle); scheduled = false; }
    },
    /** 分頁回到前景時叫一下。 */
    wake: schedule,
  };
}

let shared: ReturnType<typeof createTicker> | null = null;
export function sharedTicker() {
  if (!shared) {
    const ticker = createTicker({
      raf: (cb) => requestAnimationFrame(cb),
      caf: (handle) => cancelAnimationFrame(handle),
      now: () => performance.now() / 1000,
      hidden: () => document.hidden,
    });
    document.addEventListener('visibilitychange', ticker.wake);
    shared = ticker;
  }
  return shared;
}
