/** 衝堂的本機解法（換到不衝堂的班）：提示條、規則提醒、小山共用同一顆按鈕。 */
export interface ClashFix {
  /** 按鈕上看得到的字，例「換到週一 D56 那班」「換一班（3）」。 */
  label: string;
  /** 完整說法（按鈕名稱），例「把「民法概要」換到週一 D56 那班」。 */
  description: string;
  onClick: () => void;
}
