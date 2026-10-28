import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PrivacyPage } from './PrivacyPage.tsx';

test('lists every domain the app talks to and what stays on the device', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { level: 1, name: '隱私說明' })).toBeInTheDocument();
  expect(screen.getByText(/es\.nccu\.edu\.tw/)).toBeInTheDocument();
  expect(screen.getByText(/generativelanguage\.googleapis\.com/)).toBeInTheDocument();
  expect(screen.getByText(/修課紀錄與成績不會送給 AI/)).toBeInTheDocument();
  expect(screen.getByText(/不是政大官方服務/)).toBeInTheDocument();
});
