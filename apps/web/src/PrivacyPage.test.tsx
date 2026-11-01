import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PrivacyPage } from './PrivacyPage.tsx';

test('lists every domain the app talks to and what stays on the device', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { level: 1, name: '隱私說明' })).toBeInTheDocument();
  expect(screen.getAllByText(/es\.nccu\.edu\.tw/).length).toBeGreaterThan(0);
  expect(screen.getByText(/generativelanguage\.googleapis\.com/)).toBeInTheDocument();
  expect(screen.getByText(/修課紀錄與成績不會送給 AI/)).toBeInTheDocument();
  expect(screen.getByText(/不是政大官方服務/)).toBeInTheDocument();
});

// 獨立審查修正（2026-11-01）：說明頁只寫程式真的做的事，不漏寫會送出的資料。
test('says the browser does not contact NCCU while browsing', () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/瀏覽時不會把你的任何資料送到政大/)).toBeInTheDocument();
  expect(screen.queryByText(/確認單門課的最新資料時，會把課號送到政大/)).toBeNull();
});

test('mentions screenshots, the age confirmation, the host, and shared computers', () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/截圖匯入會把你選的圖片送給 Google/)).toBeInTheDocument();
  expect(screen.getByText(/第一次使用 AI 前，會請你確認已年滿 18 歲/)).toBeInTheDocument();
  expect(screen.getByText(/Cloudflare/)).toBeInTheDocument();
  expect(screen.getByText(/共用電腦/)).toBeInTheDocument();
});
