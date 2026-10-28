export const DAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** 搜課的時段篩選 → 政大節次代碼。 */
export const DAYPARTS = [
  { id: 'morning', label: '早上', periods: ['A', 'B', '1', '2', '3', '4'] },
  { id: 'noon', label: '中午', periods: ['C'] },
  { id: 'afternoon', label: '下午', periods: ['D', '5', '6', '7', '8'] },
  { id: 'evening', label: '晚上', periods: ['E', 'F', 'G', 'H'] },
] as const;

export const formatCredits = (credits: number) => `${Number.isInteger(credits) ? credits : credits.toFixed(1)} 學分`;
