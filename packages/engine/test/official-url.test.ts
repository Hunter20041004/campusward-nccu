import { describe, expect, test } from 'vitest';
import { NCCU_HOSTS, reviewSearchUrls, safeExternalUrl, trustedNccuUrl } from '../src/official/url.ts';
import { officialSyllabusState } from '../src/official/syllabus.ts';

// 移植自舊專案 tests/nccu-url.test.mjs
test('allows only HTTPS URLs on NCCU hosts', () => {
  expect(trustedNccuUrl('https://newdoc.nccu.edu.tw/teaschm/x/example.html')).toBe('https://newdoc.nccu.edu.tw/teaschm/x/example.html');
  expect(trustedNccuUrl('http://newdoc.nccu.edu.tw/example.html')).toBe('');
  expect(trustedNccuUrl('javascript:alert(1)')).toBe('');
  expect(trustedNccuUrl('https://nccu.edu.tw.example.com/example.html')).toBe('');
});

// 新增（計畫 1.3）：全站唯一的外部連結出口
describe('safeExternalUrl', () => {
  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://newdoc.nccu.edu.tw/a.html',
    'https://evil.example.com/a',
    'https://newdoc.nccu.edu.tw@evil.example.com/a',
    'https://user:pass@newdoc.nccu.edu.tw/a',
    '//newdoc.nccu.edu.tw/a',
    '',
    'not a url',
  ])('rejects %s', (url) => {
    expect(safeExternalUrl(url, NCCU_HOSTS)).toBe('');
  });

  test('keeps the query string official syllabus links depend on', () => {
    const url = 'https://newdoc.nccu.edu.tw/teaschm/x/schmPrv.jsp-yy=1&smt=1&num=900123&gop=00&s=1.html?view=ABC';
    expect(safeExternalUrl(url, NCCU_HOSTS)).toBe(url);
  });

  test('accepts subdomains of an allowed host but not lookalikes', () => {
    expect(safeExternalUrl('https://selectcourse.nccu.edu.tw/remain', NCCU_HOSTS)).toBe('https://selectcourse.nccu.edu.tw/remain');
    expect(safeExternalUrl('https://evilnccu.edu.tw/a', NCCU_HOSTS)).toBe('');
  });
});

// 移植自舊專案 tests/syllabus-state.test.mjs
test('marks a trusted official syllabus URL available', () => {
  expect(officialSyllabusState({
    sourceUrl: 'https://newdoc.nccu.edu.tw/teaschm/x/example.html',
    lookupStatus: 'success',
    checkedAt: '2026-07-17T18:00:00.000Z',
  })).toEqual({
    status: 'available',
    url: 'https://newdoc.nccu.edu.tw/teaschm/x/example.html',
    checkedAt: '2026-07-17T18:00:00.000Z',
  });
});

test('marks a successful lookup without a URL as not uploaded', () => {
  expect(officialSyllabusState({ sourceUrl: '', lookupStatus: 'success', checkedAt: '2026-07-17T18:00:00.000Z' }))
    .toEqual({ status: 'not_uploaded', url: '', checkedAt: '2026-07-17T18:00:00.000Z' });
});

test('keeps a failed official lookup unverified', () => {
  expect(officialSyllabusState({ sourceUrl: '', lookupStatus: 'error', checkedAt: null }))
    .toEqual({ status: 'unverified', url: '', checkedAt: null });
});

describe('reviewSearchUrls', () => {
  // 引擎型別不含 DOM 的 URLSearchParams：自己取查詢參數。
  const param = (url: string, name: string) => {
    const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
    return match ? decodeURIComponent(match[1]!.replace(/\+/g, ' ')) : null;
  };
  test('builds Dcard and Google search links from the title and teacher only', () => {
    const urls = reviewSearchUrls({ title: '統計學 (一)', teacher: '王合成' });
    expect(param(urls.dcard, 'query')).toBe('統計學 (一) 王合成');
    expect(new URL(urls.dcard).hostname).toBe('www.dcard.tw');
    expect(param(urls.google, 'q')).toBe('政大 統計學 (一) 王合成 心得');
    expect(new URL(urls.google).hostname).toBe('www.google.com');
  });

  test('leaves out a missing teacher and encodes characters that could break the address', () => {
    const urls = reviewSearchUrls({ title: 'A&B #1', teacher: '' });
    expect(param(urls.dcard, 'query')).toBe('A&B #1');
    expect(urls.dcard).not.toContain('#1');
  });
});
