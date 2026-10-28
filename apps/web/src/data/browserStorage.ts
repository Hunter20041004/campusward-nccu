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
