import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { FloatingOrb } from './FloatingOrb.tsx';
import { BuddyProvider } from '../buddy/BuddyContext.tsx';
import { createBuddyHub } from '../buddy/hub.ts';
import { memoryStorage } from '../test/memoryStorage.ts';

test('shows a dismissible nudge next to the closed orb and opens the assistant from it', async () => {
  const onOpen = vi.fn();
  const onDismissNudge = vi.fn();
  render(<FloatingOrb open={false} onOpen={onOpen} onClose={vi.fn()} nudge="有 1 個衝堂，要我幫忙看看嗎？" onDismissNudge={onDismissNudge}>內容</FloatingOrb>);
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

test('lets the student make the buddy hold still, and remembers it', async () => {
  const hub = createBuddyHub({ storage: memoryStorage() });
  render(<BuddyProvider hub={hub}><FloatingOrb open onOpen={vi.fn()} onClose={vi.fn()}>內容</FloatingOrb></BuddyProvider>);
  const user = userEvent.setup();
  const toggle = screen.getByRole('button', { name: '讓小山安靜' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await user.click(toggle);
  expect(hub.quiet).toBe(true);
  expect(screen.getByRole('button', { name: '讓小山安靜' })).toHaveAttribute('aria-pressed', 'true');
  hub.destroy();
});

test('Escape while picking a character with the input method does not close the panel', () => {
  const onClose = vi.fn();
  render(<FloatingOrb open onOpen={vi.fn()} onClose={onClose}><input aria-label="輸入" /></FloatingOrb>);
  fireEvent.keyDown(screen.getByLabelText('輸入'), { key: 'Escape', isComposing: true });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText('輸入'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
