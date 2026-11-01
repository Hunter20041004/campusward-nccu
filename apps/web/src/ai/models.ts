// 模型名稱集中在這裡（設計 6.2）。2026-11-01 依 Gemini API 價目與版本說明頁：兩者都有免費額度。
// 不使用中國來源模型（models.test.ts 檢查）。
export const MODELS = Object.freeze({
  /** AI 光球：產生變更方案。 */
  orb: 'gemini-3.8-flash',
  /** 輕量備援：額度用完時學生可改用。 */
  light: 'gemini-3.5-flash-lite',
});

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
