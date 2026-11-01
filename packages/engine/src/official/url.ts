/** 政大官方網域；子網域一併允許。 */
export const NCCU_HOSTS: readonly string[] = Object.freeze(['nccu.edu.tw']);

/**
 * 全站唯一的外部連結出口：只放行 https、主機在白名單（或其子網域）、不含帳密的網址。
 * 保留 query，因為政大課綱網址靠它定位。不合格回傳空字串。
 */
export function safeExternalUrl(value: unknown, allowedHosts: readonly string[]): string {
  const text = String(value ?? '').trim();
  if (!/^https:\/\//i.test(text)) return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
  return allowed ? url.href : '';
}

export function trustedNccuUrl(value: unknown): string {
  return safeExternalUrl(value, NCCU_HOSTS);
}

/** 課程詳情可以外連的心得搜尋網站（只開新分頁，不抓取、不儲存）。 */
export const REVIEW_HOSTS: readonly string[] = Object.freeze(['dcard.tw', 'google.com']);

/** 用課名＋教師組 Dcard 政大板與 Google 的搜尋網址；只帶這兩個欄位，並經 safeExternalUrl 檢查。 */
export function reviewSearchUrls({ title, teacher }: { title: string; teacher?: string }): { dcard: string; google: string } {
  const words = [title, teacher].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ');
  const dcard = `https://www.dcard.tw/search?query=${encodeURIComponent(words)}&forum=nccu`;
  const google = `https://www.google.com/search?q=${encodeURIComponent(`政大 ${words} 心得`)}`;
  return { dcard: safeExternalUrl(dcard, REVIEW_HOSTS), google: safeExternalUrl(google, REVIEW_HOSTS) };
}
