import { describe, expect, test } from 'vitest';
import { BASE_EYE, bodyAt, createBlinker, eyePath, eyesAt, MOODS, screenFloat } from './motion.ts';

const points = (d: string) => d.slice(1, -1).split('L').map((pair) => pair.split(' ').map(Number) as [number, number]);

describe('eye shapes', () => {
  test('an eye is one closed outline', () => {
    const d = eyePath(BASE_EYE, 1);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(points(d)).toHaveLength(64);
  });

  test('a smile carves the middle of the bottom into an arch', () => {
    const middleBottom = (d: string) => Math.max(...points(d).filter(([x]) => Math.abs(x - 119) < 3).map(([, y]) => y));
    expect(middleBottom(eyePath({ ...BASE_EYE, smile: 0.42, rot: 0 }, 1))).toBeLessThan(middleBottom(eyePath({ ...BASE_EYE, rot: 0 }, 1)) - 10);
  });

  test('worried eyes droop on the outer side, not the inner side (reads as concerned, not angry)', () => {
    const right = points(eyePath({ ...BASE_EYE, tilt: 0.3, rot: 0 }, 1));
    const top = (inner: boolean) => Math.min(...right.filter(([x]) => (inner ? x < 119 : x > 119)).map(([, y]) => y));
    expect(top(false)).toBeGreaterThan(top(true) + 3);
  });
});

describe('moods', () => {
  test('every mood has at least one pose and an orbit speed', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      expect(mood.poses.length, name).toBeGreaterThan(0);
      expect(mood.speed, name).toBeGreaterThan(0);
    }
  });

  test('thinking looks up and sleepy closes the eyes', () => {
    const [thinking] = eyesAt('thinking', 0, 0);
    const [sleepy] = eyesAt('sleepy', 0, 0);
    expect(thinking!.dy).toBeLessThan(-8);
    expect(sleepy!.lid).toBeGreaterThan(0.6);
  });

  test('poses morph smoothly instead of jumping', () => {
    const before = eyesAt('idle', 3.19, 3.19)[0]!;
    const after = eyesAt('idle', 3.21, 3.21)[0]!;
    expect(Math.abs(after.dx - before.dx)).toBeLessThan(1);
  });
});

describe('body float', () => {
  test.each([32, 56, 200])('floats at least 3px on screen at %ipx so it never looks frozen', (size) => {
    expect(screenFloat(size)).toBeGreaterThanOrEqual(3);
  });

  test('stays calmer while worried or sleepy', () => {
    const range = (mood: 'idle' | 'sleepy') => {
      const ys = Array.from({ length: 400 }, (_, i) => bodyAt(mood, i * 0.05, i * 0.05, 56).ty);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(range('sleepy')).toBeLessThan(range('idle'));
  });
});

describe('blinking', () => {
  test('keeps blinking however long the page stays open', () => {
    const blinker = createBlinker(() => 0.5);
    const blinksBetween = (from: number, to: number) => {
      let count = 0;
      let closed = false;
      for (let t = from; t < to; t += 0.02) {
        const shut = blinker(t) > 0.5;
        if (shut && !closed) count += 1;
        closed = shut;
      }
      return count;
    };
    expect(blinksBetween(0, 30)).toBeGreaterThan(3);
    expect(blinksBetween(3600, 3630)).toBeGreaterThan(3);
  });

  test('blinks at irregular intervals between 2.6 and 5.8 seconds', () => {
    let r = 0;
    const values = [0.1, 0.9, 0.5, 0.3, 0.7];
    const blinker = createBlinker(() => values[r++ % values.length]!);
    const starts: number[] = [];
    let closed = false;
    for (let t = 0; t < 40; t += 0.01) {
      const shut = blinker(t) > 0.5;
      if (shut && !closed) starts.push(t);
      closed = shut;
    }
    const gaps = starts.slice(1).map((t, i) => t - starts[i]!).filter((gap) => gap > 0.5);
    expect(new Set(gaps.map((gap) => gap.toFixed(1))).size).toBeGreaterThan(1);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(2.55);
      expect(gap).toBeLessThanOrEqual(5.85);
    }
  });
});
