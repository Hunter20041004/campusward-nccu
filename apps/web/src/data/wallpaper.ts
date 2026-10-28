// 手機桌布課表：先算版面（可測試），再用 canvas 繪製並下載 PNG。
import { NCCU_PERIODS, buildScheduleAgenda, occupiedMeetings, periodsForRange, type ScheduleEntry } from '@campusward/engine';

export const WALLPAPER_SIZE = { width: 1170, height: 2532 } as const;
const DAY_CHARS = ['', '一', '二', '三', '四', '五', '六', '日'];
const MARGIN = 60;
const TOP = 760; // 留給手機鎖定畫面的時鐘
const BOTTOM = 120;

export interface WallpaperBlock { title: string; codes: string; x: number; y: number; width: number; height: number }
export interface WallpaperLayout {
  width: number;
  height: number;
  title: string;
  days: string[];
  periods: string[];
  gridTop: number;
  columnWidth: number;
  rowHeight: number;
  blocks: WallpaperBlock[];
  footnotes: string[];
}

export function wallpaperLayout(entries: readonly ScheduleEntry[], termLabel: string): WallpaperLayout {
  const used = entries.flatMap((entry) => occupiedMeetings(entry).map((meeting) => ({ entry, meeting })));
  const indexes = used.flatMap(({ meeting }) => periodsForRange(meeting.start, meeting.end).map(({ code }) => NCCU_PERIODS.findIndex((period) => period.code === code)));
  const first = Math.min(NCCU_PERIODS.findIndex(({ code }) => code === '1'), ...indexes);
  const last = Math.max(NCCU_PERIODS.findIndex(({ code }) => code === '8'), ...indexes);
  const periods = NCCU_PERIODS.slice(first, last + 1).map(({ code }) => code);
  const dayNumbers = [1, 2, 3, 4, 5, ...[6, 7].filter((day) => used.some(({ meeting }) => meeting.day === day))];
  const labelWidth = 70;
  const columnWidth = (WALLPAPER_SIZE.width - MARGIN * 2 - labelWidth) / dayNumbers.length;
  const headerHeight = 60;
  const footnotes = buildScheduleAgenda(entries).flexible.map(({ title, reason }) => `${title}（${reason}）`);
  const available = WALLPAPER_SIZE.height - TOP - BOTTOM - headerHeight - (footnotes.length ? footnotes.length * 48 + 30 : 0);
  const rowHeight = Math.min(110, available / periods.length);
  const gridTop = TOP + headerHeight;
  const blocks = used.flatMap(({ entry, meeting }) => {
    const slots = periodsForRange(meeting.start, meeting.end).filter(({ code }) => periods.includes(code));
    if (!slots.length) return [];
    const row = periods.indexOf(slots[0]!.code);
    return [{
      title: entry.course.title,
      codes: slots.map(({ code }) => code).join(''),
      x: MARGIN + labelWidth + dayNumbers.indexOf(meeting.day) * columnWidth + 4,
      y: gridTop + row * rowHeight + 4,
      width: columnWidth - 8,
      height: slots.length * rowHeight - 8,
    }];
  });
  return {
    width: WALLPAPER_SIZE.width,
    height: WALLPAPER_SIZE.height,
    title: `${termLabel} 課表`,
    days: dayNumbers.map((day) => DAY_CHARS[day]!),
    periods,
    gridTop,
    columnWidth,
    rowHeight,
    blocks,
    footnotes,
  };
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (context.measureText(line + char).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) break;
    } else line += char;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

/** 用設計色票繪製並回傳 PNG。 */
export async function renderWallpaper(layout: WallpaperLayout): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  await document.fonts?.ready;
  const font = (size: number, weight = 500) => `${weight} ${size}px Outfit, "Noto Sans TC", sans-serif`;
  context.fillStyle = '#eef0f3';
  context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = '#2b3448';
  context.font = font(44, 600);
  context.fillText(layout.title, MARGIN, layout.gridTop - 90);
  context.font = font(30);
  layout.days.forEach((day, index) => {
    context.fillText(day, MARGIN + 70 + index * layout.columnWidth + layout.columnWidth / 2 - 15, layout.gridTop - 18);
  });
  layout.periods.forEach((code, index) => {
    const y = layout.gridTop + index * layout.rowHeight;
    context.fillStyle = '#d7dbe3';
    context.fillRect(MARGIN, y, layout.width - MARGIN * 2, 2);
    context.fillStyle = '#5a6478';
    context.font = font(26);
    context.fillText(code, MARGIN + 18, y + layout.rowHeight / 2 + 9);
  });
  for (const block of layout.blocks) {
    context.fillStyle = '#c9d3e8';
    context.beginPath();
    context.roundRect(block.x, block.y, block.width, block.height, 16);
    context.fill();
    context.fillStyle = '#25324d';
    context.font = font(28, 600);
    wrap(context, block.title, block.width - 20, Math.max(1, Math.floor((block.height - 50) / 36))).forEach((line, index) => {
      context.fillText(line, block.x + 10, block.y + 38 + index * 36);
    });
    context.font = font(24);
    context.fillText(block.codes, block.x + 10, block.y + block.height - 14);
  }
  context.fillStyle = '#2b3448';
  context.font = font(28);
  layout.footnotes.forEach((note, index) => {
    context.fillText(note, MARGIN, layout.gridTop + layout.periods.length * layout.rowHeight + 60 + index * 48);
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png'));
}
