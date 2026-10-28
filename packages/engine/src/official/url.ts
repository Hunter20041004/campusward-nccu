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
