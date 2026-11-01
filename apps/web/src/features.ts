// 功能開關（設計第 3 節）：每個主要功能可以單獨關閉；未達品質門檻的功能先關掉再上線。
// 建置時可用環境變數 VITE_CAMPUSWARD_DISABLE=qa,career 關閉（逗號分隔），不必改程式。

export const FEATURE_NAMES = ['orb', 'demo', 'qa', 'career', 'screenshot', 'graduation', 'liveCheck'] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Readonly<Record<FeatureName, boolean>>;

export function featuresFrom(disabled: string | undefined): Features {
  const off = new Set((disabled ?? '').split(',').map((name) => name.trim()));
  return Object.freeze(Object.fromEntries(FEATURE_NAMES.map((name) => [name, !off.has(name)])) as Record<FeatureName, boolean>);
}

export const FEATURES = featuresFrom(import.meta.env.VITE_CAMPUSWARD_DISABLE as string | undefined);
