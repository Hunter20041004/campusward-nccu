import type { ScheduleEntry } from '@campusward/engine';
import { expect, test } from 'vitest';
import { wallpaperLayout, WALLPAPER_SIZE } from './wallpaper.ts';

const entry = (key: string, title: string, meetings: { day: number; start: number; end: number }[], attendance: 'sync' | 'async' = 'sync'): ScheduleEntry => ({
  course: { key, title, credits: 3, itemType: 'course', events: [], eligibility: {}, meetings: meetings.map((m) => ({ ...m, label: '' })), delivery: { mode: 'in-person', asyncAllowed: attendance === 'async', defaultAttendance: attendance } },
  item: { key, attendance, status: 'planned', locked: false },
});

test('lays out weekday columns and a block for each weekly meeting', () => {
  const layout = wallpaperLayout([entry('a', '統計學', [{ day: 1, start: 550, end: 720 }]), entry('b', '週六課', [{ day: 6, start: 550, end: 720 }])], '115-1');
  expect(layout.width).toBe(WALLPAPER_SIZE.width);
  expect(layout.days).toEqual(['一', '二', '三', '四', '五', '六']);
  expect(layout.blocks).toHaveLength(2);
  const [first] = layout.blocks;
  expect(first).toMatchObject({ title: '統計學', codes: '234' });
  expect(first!.x).toBeLessThan(layout.blocks[1]!.x);
  expect(first!.height).toBeGreaterThan(0);
  expect(layout.title).toBe('115-1 課表');
});

test('keeps blocks inside the safe area below the phone clock', () => {
  const layout = wallpaperLayout([entry('a', '早八', [{ day: 1, start: 490, end: 540 }]), entry('b', '晚課', [{ day: 5, start: 1110, end: 1260 }])], '115-1');
  for (const block of layout.blocks) {
    expect(block.y).toBeGreaterThanOrEqual(layout.gridTop);
    expect(block.y + block.height).toBeLessThanOrEqual(WALLPAPER_SIZE.height - 120);
  }
});

test('lists asynchronous and unscheduled courses under the grid', () => {
  const layout = wallpaperLayout([entry('a', '遠距課', [{ day: 2, start: 550, end: 720 }], 'async'), entry('b', '彈性課', [])], '115-1');
  expect(layout.blocks).toHaveLength(0);
  expect(layout.footnotes).toEqual(['遠距課（非同步）', '彈性課（時間未定）']);
});
