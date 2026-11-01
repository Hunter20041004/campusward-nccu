import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
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
  expect(screen.getByRole('region', { name: '小山' })).toHaveTextContent('內容');
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

test('the nudge folds into a small dot on the button after a few seconds, and opening from the dot works', async () => {
  vi.useFakeTimers();
  try {
    const onOpen = vi.fn();
    render(<FloatingOrb open={false} onOpen={onOpen} onClose={vi.fn()} nudge="有 1 個衝堂，要我幫忙看看嗎？">內容</FloatingOrb>);
    expect(screen.getByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.queryByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' })).toBeNull();
    const orb = screen.getByRole('button', { name: '小山' });
    expect(orb.querySelector('[data-nudge-dot]')).not.toBeNull();
    expect(orb).toHaveAccessibleDescription('有 1 個衝堂，要我幫忙看看嗎？');
    fireEvent.click(orb);
    expect(onOpen).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test('the nudge stays hidden while something else is open on top', () => {
  render(<FloatingOrb open={false} onOpen={vi.fn()} onClose={vi.fn()} nudge="提醒" nudgeHidden>內容</FloatingOrb>);
  // 泡泡不出現（不擋住上面的東西）；提醒收成按鈕上的小點，報讀器仍念得到。
  expect(screen.queryByRole('button', { name: '提醒' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '小山' })).toHaveAccessibleDescription('提醒');
});

test('the nudge does not pop up again after another menu covered it (phones open 更多 on every page switch)', () => {
  const props = { open: false, onOpen: vi.fn(), onClose: vi.fn(), nudge: '有 1 個衝堂，要我幫忙看看嗎？' };
  const { rerender } = render(<FloatingOrb {...props}>內容</FloatingOrb>);
  expect(screen.getByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' })).toBeInTheDocument();
  rerender(<FloatingOrb {...props} nudgeHidden>內容</FloatingOrb>);
  rerender(<FloatingOrb {...props} nudgeHidden={false}>內容</FloatingOrb>);
  expect(screen.queryByRole('button', { name: '有 1 個衝堂，要我幫忙看看嗎？' })).not.toBeInTheDocument();
});

describe('dragging 小山 anywhere', () => {
  const base = { open: false, onOpen: vi.fn(), onClose: vi.fn() };

  test('dragging moves the button and does not open the panel; a tap still opens it', () => {
    const onOpen = vi.fn();
    const onPosition = vi.fn();
    render(<FloatingOrb {...base} onOpen={onOpen} onPosition={onPosition}>內容</FloatingOrb>);
    const orb = screen.getByRole('button', { name: '小山' });
    fireEvent.pointerDown(orb, { clientX: 1000, clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(orb, { clientX: 800, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(orb, { clientX: 800, clientY: 400, pointerId: 1 });
    fireEvent.click(orb);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({ right: expect.any(Number), bottom: expect.any(Number) }));
    expect(orb.style.right).not.toBe('');
    fireEvent.pointerDown(orb, { clientX: 800, clientY: 400, pointerId: 2 });
    fireEvent.pointerMove(orb, { clientX: 802, clientY: 401, pointerId: 2 });
    fireEvent.pointerUp(orb, { clientX: 802, clientY: 401, pointerId: 2 });
    fireEvent.click(orb);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('starts where it was left last time', () => {
    render(<FloatingOrb {...base} position={{ right: 300, bottom: 200 }}>內容</FloatingOrb>);
    const orb = screen.getByRole('button', { name: '小山' });
    expect(orb.style.right).toBe('300px');
    expect(orb.style.bottom).toBe('200px');
  });

  test('can be moved with the keyboard (Alt + arrow keys)', () => {
    const onPosition = vi.fn();
    render(<FloatingOrb {...base} position={{ right: 300, bottom: 200 }} onPosition={onPosition}>內容</FloatingOrb>);
    const orb = screen.getByRole('button', { name: '小山' });
    fireEvent.keyDown(orb, { key: 'ArrowLeft', altKey: true });
    expect(onPosition).toHaveBeenLastCalledWith({ right: 324, bottom: 200 });
    fireEvent.keyDown(orb, { key: 'ArrowUp', altKey: true });
    expect(onPosition).toHaveBeenLastCalledWith({ right: 324, bottom: 224 });
  });

  test('tells people it can be dragged', () => {
    render(<FloatingOrb {...base}>內容</FloatingOrb>);
    expect(screen.getByRole('button', { name: '小山' })).toHaveAttribute('title', expect.stringMatching(/拖/));
  });
});
