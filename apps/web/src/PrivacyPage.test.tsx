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

test('explains how to get a Gemini key and what the terms say', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { name: 'Gemini 金鑰怎麼申請' }).closest('section')).toHaveAttribute('id', 'gemini');
  expect(screen.getByText(/not for consumer use/)).toBeInTheDocument();
  expect(screen.getByText(/關掉分頁就清除/)).toBeInTheDocument();
});

test('says where the imported student record is kept and how to delete it', () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/整理後的資料存在這台瀏覽器/)).toHaveTextContent('不送給 AI、不放進匯出檔');
  expect(screen.getByText(/整理後的資料存在這台瀏覽器/)).toHaveTextContent('清除修課資料');
});
