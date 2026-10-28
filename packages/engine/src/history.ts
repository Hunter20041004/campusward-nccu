// 一鍵復原：保留最近一次快照，時限內可還原。移植自舊 planner-undo（含剔除私人欄位）。

// 舊版的 preferences 是給 AI 的自由文字；新版 PlannerState.preferences 是排課偏好，必須保留，所以不在清單中。
const PRIVATE_KEYS = new Set(['apiKey', 'profileText', 'futureDirection', 'semesterGoals', 'screenshot', 'image']);

function safeClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(safeClone) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(key))
      .map(([key, nested]) => [key, safeClone(nested)]),
  ) as T;
}

export interface UndoPeek {
  available: boolean;
  label?: string;
  remainingMs?: number;
}

export function createUndo<T>({ now, ttlMs = 15_000 }: { now: () => number; ttlMs?: number }) {
  let entry: { snapshot: T; label: string; expiresAt: number } | null = null;

  const current = () => {
    if (!entry || now() > entry.expiresAt) {
      entry = null;
      return null;
    }
    return entry;
  };

  return {
    capture(snapshot: T, label: string): void {
      entry = { snapshot: safeClone(snapshot), label, expiresAt: now() + ttlMs };
    },
    peek(): UndoPeek {
      const available = current();
      return available
        ? { available: true, label: available.label, remainingMs: Math.max(0, available.expiresAt - now()) }
        : { available: false };
    },
    restore(): T | null {
      const available = current();
      if (!available) return null;
      entry = null;
      return safeClone(available.snapshot);
    },
    clear(): void {
      entry = null;
    },
  };
}
