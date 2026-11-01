import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../test/memoryStorage.ts';
import { createBuddyHub, QUIET_KEY, SLEEP_AFTER_MS } from './hub.ts';
import type { BuddyMood, BuddyReaction } from './motion.ts';

function fakeBuddy() {
  const calls: string[] = [];
  let mood: BuddyMood = 'idle';
  return {
    calls,
    get mood() { return mood; },
    setMood: vi.fn((next: BuddyMood) => { mood = next; calls.push(`mood:${next}`); }),
    react: vi.fn((kind: BuddyReaction) => { calls.push(`react:${kind}`); }),
    poke: vi.fn(),
    lookAt: vi.fn(),
    lookAway: vi.fn(),
    setStill: vi.fn(),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const storage = memoryStorage();
  const hub = createBuddyHub({ storage, now: () => Date.now() });
  const orb = fakeBuddy(), panel = fakeBuddy();
  hub.attach('orb', orb);
  hub.attach('panel', panel);
  return { hub, orb, panel, storage };
}

describe('only one buddy reacts at a time', () => {
  test('the orb reacts while the panel is closed, the panel buddy once it opens', () => {
    const { hub, orb, panel } = setup();
    hub.changed('remove');
    expect(orb.react).toHaveBeenCalledWith('nod');
    expect(panel.react).not.toHaveBeenCalled();
    hub.setPanelOpen(true);
    hub.changed('remove');
    expect(panel.calls).toContain('react:nod');
  });

  test('opening the panel says hello and closing it glances from the orb', () => {
    const { hub, orb, panel } = setup();
    hub.setPanelOpen(true);
    expect(panel.react).toHaveBeenCalledWith('wake');
    vi.advanceTimersByTime(500);
    expect(panel.react).toHaveBeenCalledWith('nod');
    hub.setPanelOpen(false);
    expect(orb.react).toHaveBeenCalledWith('glance');
  });
});

describe('course changes', () => {
  test('adding a course is a happy hop once, then only nods for 20 seconds', () => {
    const { hub, orb } = setup();
    hub.changed('add');
    hub.changed('add');
    expect(orb.react.mock.calls.map(([kind]) => kind)).toEqual(['yay', 'nod']);
    vi.advanceTimersByTime(20_001);
    hub.changed('add');
    expect(orb.react).toHaveBeenLastCalledWith('yay');
  });

  test('adding a course that clashes only nods', () => {
    const { hub, orb } = setup();
    hub.changed('add', { conflict: true });
    expect(orb.react).toHaveBeenCalledWith('nod');
  });

  test('undo glances back and candidates nod', () => {
    const { hub, orb } = setup();
    hub.changed('undo');
    hub.changed('candidate');
    expect(orb.react.mock.calls.map(([kind]) => kind)).toEqual(['glance', 'nod']);
  });
});

describe('typing', () => {
  test('listens only while the student is typing and looks at the box', () => {
    const { hub, orb } = setup();
    hub.typing({ left: 0, top: 0, width: 100, height: 20 });
    expect(orb.mood).toBe('listening');
    expect(orb.lookAt).toHaveBeenCalledWith(50, 10);
    expect(orb.poke).toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(orb.mood).toBe('idle');
  });

  test('keeps thinking while the AI works, typing only gives a small nod', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    hub.typing({ left: 0, top: 0, width: 100, height: 20 });
    expect(orb.mood).toBe('thinking');
    expect(orb.poke).toHaveBeenCalled();
  });

  test('pointer moves are ignored while listening so the eyes stay on the box', () => {
    const { hub, orb } = setup();
    hub.typing({ left: 0, top: 0, width: 100, height: 20 });
    orb.lookAt.mockClear();
    hub.pointer(500, 500);
    expect(orb.lookAt).not.toHaveBeenCalled();
  });
});

describe('dozing', () => {
  test('falls asleep after a long quiet spell and wakes on any activity', () => {
    const { hub, orb } = setup();
    vi.advanceTimersByTime(SLEEP_AFTER_MS + 2000);
    expect(orb.mood).toBe('sleepy');
    hub.activity();
    expect(orb.mood).toBe('idle');
    expect(orb.react).toHaveBeenCalledWith('wake');
  });

  test('stays awake while the AI is working', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    vi.advanceTimersByTime(SLEEP_AFTER_MS / 2);
    hub.aiResult('answered', 10);
    vi.advanceTimersByTime(SLEEP_AFTER_MS / 2 + 3000);
    expect(orb.mood).not.toBe('sleepy');
  });
});

describe('asking the AI', () => {
  test('thinks, talks for a moment when the answer arrives, then nods', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    expect(orb.mood).toBe('thinking');
    hub.aiResult('answered', 20);
    expect(orb.mood).toBe('talking');
    vi.advanceTimersByTime(2000);
    expect(orb.mood).toBe('idle');
    expect(orb.react).toHaveBeenLastCalledWith('nod');
  });

  test('an applied change is one happy hop however many courses changed', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    hub.aiResult('applied', 5);
    vi.advanceTimersByTime(2000);
    expect(orb.react.mock.calls.map(([kind]) => kind)).toEqual(['yay']);
  });

  test('when a confirmation is needed it keeps looking at the button until answered', () => {
    const { hub, orb } = setup();
    const target = () => ({ left: 10, top: 10, width: 20, height: 20 });
    hub.aiStart();
    hub.aiResult('confirm', 5, target);
    vi.advanceTimersByTime(2000);
    expect(orb.lookAt).toHaveBeenLastCalledWith(20, 20);
    orb.poke.mockClear();
    vi.advanceTimersByTime(4000);
    expect(orb.poke).toHaveBeenCalled();
    hub.aiConfirmDone();
    orb.poke.mockClear();
    vi.advanceTimersByTime(8000);
    expect(orb.poke).not.toHaveBeenCalled();
  });

  test('a failure or a blocked change looks worried briefly, then recovers', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    hub.aiResult('failed', 0);
    expect(orb.mood).toBe('worried');
    vi.advanceTimersByTime(1600);
    expect(orb.mood).toBe('idle');
  });

  test('gives up thinking after 30 seconds so it never gets stuck', () => {
    const { hub, orb } = setup();
    hub.aiStart();
    vi.advanceTimersByTime(30_001);
    expect(orb.mood).toBe('idle');
  });
});

describe('quiet mode', () => {
  test('is remembered on this device and freezes every buddy', () => {
    const { hub, orb, panel, storage } = setup();
    hub.setQuiet(true);
    expect(orb.setStill).toHaveBeenCalledWith(true);
    expect(panel.setStill).toHaveBeenCalledWith(true);
    expect(storage.getItem(QUIET_KEY)).toBe('1');
    expect(createBuddyHub({ storage, now: () => Date.now() }).quiet).toBe(true);
  });

  test('works when the browser blocks storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    const hub = createBuddyHub({ storage: broken, now: () => Date.now() });
    expect(hub.quiet).toBe(false);
    expect(() => hub.setQuiet(true)).not.toThrow();
    expect(hub.quiet).toBe(true);
  });
});
