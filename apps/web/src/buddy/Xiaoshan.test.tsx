import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { memoryStorage } from '../test/memoryStorage.ts';
import { BuddyProvider } from './BuddyContext.tsx';
import { createBuddyHub } from './hub.ts';
import { Xiaoshan } from './Xiaoshan.tsx';

test('draws a decorative buddy that screen readers skip', () => {
  const { container } = render(<Xiaoshan size={32} mood="worried" />);
  const svg = container.querySelector('svg')!;
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg.querySelector('.eyeL')!.getAttribute('d')).toMatch(/^M/);
});

test('a buddy with a role reports to the hub and leaves when unmounted', () => {
  const hub = createBuddyHub({ storage: memoryStorage() });
  const attach = vi.spyOn(hub, 'attach');
  const detach = vi.spyOn(hub, 'detach');
  const { unmount } = render(<BuddyProvider hub={hub}><Xiaoshan size={52} role="orb" /></BuddyProvider>);
  expect(attach).toHaveBeenCalledWith('orb', expect.anything());
  unmount();
  expect(detach).toHaveBeenCalledWith('orb', expect.anything());
  hub.destroy();
});

test('typing in any text box on the page makes the buddy listen, except the key box', async () => {
  const hub = createBuddyHub({ storage: memoryStorage() });
  const typing = vi.spyOn(hub, 'typing');
  render(
    <BuddyProvider hub={hub}>
      <input aria-label="搜課" />
      <input aria-label="Gemini 金鑰" className="key-mask" />
      <input aria-label="勾選" type="checkbox" />
    </BuddyProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('搜課'), '統');
  expect(typing).toHaveBeenCalled();
  typing.mockClear();
  await user.type(screen.getByLabelText('Gemini 金鑰'), 'A');
  await user.click(screen.getByLabelText('勾選'));
  expect(typing).not.toHaveBeenCalled();
  hub.destroy();
});

test('any click or key counts as activity so the buddy does not doze while you browse', async () => {
  const hub = createBuddyHub({ storage: memoryStorage() });
  const activity = vi.spyOn(hub, 'activity');
  render(<BuddyProvider hub={hub}><button type="button">按鈕</button></BuddyProvider>);
  await userEvent.setup().click(screen.getByRole('button', { name: '按鈕' }));
  expect(activity).toHaveBeenCalled();
  hub.destroy();
});
