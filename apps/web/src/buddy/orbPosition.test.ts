import { describe, expect, test } from 'vitest';
import { memoryStorage } from '../test/memoryStorage.ts';
import { clampOrb, loadOrbPosition, ORB_POSITION_KEY, panelPlacement, saveOrbPosition } from './orbPosition.ts';

const view = { width: 1366, height: 860 };

describe('clampOrb', () => {
  test('keeps the button fully on screen with a margin', () => {
    expect(clampOrb({ right: -50, bottom: -20 }, view)).toEqual({ right: 8, bottom: 8 });
    expect(clampOrb({ right: 5000, bottom: 5000 }, view)).toEqual({ right: 1366 - 64 - 8, bottom: 860 - 64 - 8 });
    expect(clampOrb({ right: 300, bottom: 200 }, view)).toEqual({ right: 300, bottom: 200 });
  });

  test('keeps clear of the phone tab bar at the bottom', () => {
    expect(clampOrb({ right: 20, bottom: 10 }, { width: 390, height: 844 }, 72)).toEqual({ right: 20, bottom: 80 });
  });
});

describe('saved position', () => {
  test('is remembered on this device', () => {
    const storage = memoryStorage();
    saveOrbPosition(storage, { right: 120, bottom: 300 });
    expect(loadOrbPosition(storage)).toEqual({ right: 120, bottom: 300 });
    expect(storage.getItem(ORB_POSITION_KEY)).toBe('{"right":120,"bottom":300}');
  });

  test('ignores anything that is not a sensible position', () => {
    for (const value of ['', 'nope', '{"right":"x","bottom":1}', '{"right":1}', '{"right":1e9,"bottom":1}', '[1,2]']) {
      expect(loadOrbPosition(memoryStorage({ [ORB_POSITION_KEY]: value }))).toBeNull();
    }
  });

  test('survives a browser that blocks storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadOrbPosition(broken)).toBeNull();
    expect(() => saveOrbPosition(broken, { right: 1, bottom: 1 })).not.toThrow();
  });
});

describe('panelPlacement', () => {
  const panel = { width: 448, height: 600 };

  test('opens to the left of the button when the button is on the right half', () => {
    expect(panelPlacement({ right: 24, bottom: 24 }, view, panel)).toEqual({ right: 24 + 64 + 16, bottom: 24 });
  });

  test('opens to the right of the button when the button is on the left half', () => {
    const placed = panelPlacement({ right: 1200, bottom: 24 }, view, panel);
    expect(placed).toEqual({ left: 1366 - 1200 - 64 + 64 + 16, bottom: 24 });
  });

  test('never runs off the top of the screen', () => {
    const placed = panelPlacement({ right: 24, bottom: 700 }, view, panel);
    expect(placed.bottom).toBe(860 - 600 - 80);
  });
});
