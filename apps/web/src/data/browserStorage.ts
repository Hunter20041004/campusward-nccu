import type { StorageLike } from '@campusward/engine';

/** localStorage 包一層：無痕模式或被封鎖時不讓畫面崩潰，改用記憶體（重新整理會遺失）。 */
export function browserStorage(): StorageLike & { persistent: boolean } {
  try {
    const probe = '__campusward_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      persistent: true,
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    };
  } catch {
    const memory = new Map<string, string>();
    return { persistent: false, getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } };
  }
}

/** 清除本機資料時一併清掉 Campusward 自己的快取（Cache API）與資料庫（IndexedDB），以及這個分頁記住的資料。 */
export async function clearBrowserCaches(scope: Pick<Window, 'caches' | 'indexedDB' | 'sessionStorage'> | undefined = typeof window !== 'undefined' ? window : undefined) {
  if (!scope) return;
  try {
    scope.sessionStorage.clear();
  } catch {
    // 讀不到就沒有東西要清。
  }
  try {
    const names = scope.caches ? await scope.caches.keys() : [];
    await Promise.all(names.filter((name) => name.startsWith('campusward')).map((name) => scope.caches.delete(name)));
  } catch {
    // 不支援 Cache API 的瀏覽器沒有快取。
  }
  try {
    const databases = typeof scope.indexedDB?.databases === 'function' ? await scope.indexedDB.databases() : [];
    databases.filter(({ name }) => name?.startsWith('campusward')).forEach(({ name }) => scope.indexedDB.deleteDatabase(name!));
  } catch {
    // 同上。
  }
}
