import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { UndoToast } from './UndoToast.tsx';

test('shows an extra action next to 復原 when one is given', async () => {
  const onClick = vi.fn();
  render(<UndoToast label="已加入「民法概要」，與「臺灣政治」衝堂" onUndo={vi.fn()} onExpire={vi.fn()} action={{ label: '換到週一 D56 那班', description: '把「民法概要」換到週一 D56 那班', onClick }} />);
  const toast = screen.getByRole('status', { name: '最近的修改' });
  await userEvent.setup().click(within(toast).getByRole('button', { name: '把「民法概要」換到週一 D56 那班' }));
  expect(onClick).toHaveBeenCalled();
  expect(within(toast).getByRole('button', { name: '復原' })).toBeInTheDocument();
});

test('only 復原 without an action', () => {
  render(<UndoToast label="已加入「統計學」" onUndo={vi.fn()} onExpire={vi.fn()} />);
  expect(within(screen.getByRole('status', { name: '最近的修改' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['復原']);
});
