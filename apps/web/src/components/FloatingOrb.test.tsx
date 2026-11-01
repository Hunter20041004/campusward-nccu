import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { FloatingOrb } from './FloatingOrb.tsx';

test('shows a dismissible nudge next to the closed orb and opens the assistant from it', async () => {
  const onOpen = vi.fn();
  const onDismissNudge = vi.fn();
  render(<FloatingOrb open={false} onOpen={onOpen} onClose={vi.fn()} mood="worried" nudge="有 1 個衝堂，要我幫忙看看嗎？" onDismissNudge={onDismissNudge}>內容</FloatingOrb>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' }));
  expect(onOpen).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '不用了，關掉提醒' }));
  expect(onDismissNudge).toHaveBeenCalled();
});

test('hides the nudge while the assistant is open', () => {
  render(<FloatingOrb open onOpen={vi.fn()} onClose={vi.fn()} nudge="提醒">內容</FloatingOrb>);
  expect(screen.queryByText('提醒')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'AI 光球' })).toHaveTextContent('內容');
});
