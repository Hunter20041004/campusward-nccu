import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { GUIDE_SLIDES, Guide } from './Guide.tsx';

describe('Guide', () => {
  test('walks through the slides and finishes', async () => {
    const onClose = vi.fn();
    render(<Guide open onClose={onClose} />);
    const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: GUIDE_SLIDES[0]!.title })).toBeInTheDocument();
    for (let index = 1; index < GUIDE_SLIDES.length; index += 1) {
      await user.click(screen.getByRole('button', { name: '下一步' }));
      expect(screen.getByRole('heading', { name: GUIDE_SLIDES[index]!.title })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: '開始使用' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('can be skipped at any step', async () => {
    const onClose = vi.fn();
    render(<Guide open onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '略過教學' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('jumps to a slide from the dots', async () => {
    render(<Guide open onClose={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: `第 3 頁：${GUIDE_SLIDES[2]!.title}` }));
    expect(screen.getByRole('heading', { name: GUIDE_SLIDES[2]!.title })).toBeInTheDocument();
  });

  test('teaches every feature', () => {
    expect(GUIDE_SLIDES.map(({ title }) => title)).toEqual([
      '搜課與多條件搜尋', '課程詳情與官方資料', '加入課表、收藏候選', '在課表上調整一門課', '衝堂與選課規則',
      '備案、比較與復原', '條件：身分、資格、偏好', '全人系統資料', 'AI 光球', '匯出、登記與隱私',
    ]);
  });

  test('explains the colours and marks in a legend tab', async () => {
    render(<Guide open onClose={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: '圖例' }));
    const legend = screen.getByRole('tabpanel', { name: '圖例' });
    for (const text of ['必修課', '其他課', '衝堂', '鎖定', '已修過', '收藏到候選', '自動備案']) {
      expect(legend).toHaveTextContent(text);
    }
  });
});

test('switches guide tabs with the arrow keys', async () => {
  render(<Guide open onClose={vi.fn()} />);
  const user = userEvent.setup();
  screen.getByRole('tab', { name: '教學' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: '圖例' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: '圖例' })).toHaveAttribute('aria-selected', 'true');
});

test('keeps the page dots at a full touch size and lets them wrap', () => {
  render(<Guide open onClose={vi.fn()} />);
  const dot = screen.getByRole('button', { name: /^第 1 頁/ });
  expect(dot).toHaveClass('shrink-0', 'size-11');
  expect(dot.parentElement).toHaveClass('flex-wrap');
});
