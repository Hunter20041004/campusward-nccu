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

  test('covers searching, the timetable, backups and undo, the AI orb and registering', () => {
    expect(GUIDE_SLIDES.map(({ title }) => title)).toEqual(['搜課、加入課表', '衝堂與選課規則', '備案與一鍵復原', 'AI 光球', '排好後去登記']);
  });
});
