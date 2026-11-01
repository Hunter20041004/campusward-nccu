import { expect, test } from 'vitest';
import { MODELS } from './models.ts';

// 移植自舊 model-supply-chain 測試：只用 Google Gemini 模型，不用中國來源模型。
test('uses only Google Gemini models', () => {
  for (const model of Object.values(MODELS)) {
    expect(model).toMatch(/^gemini-[0-9a-z.-]+$/);
    expect(model).not.toMatch(/deepseek|qwen|glm|kimi|moonshot|baichuan|yi-|ernie|hunyuan|doubao|minimax/i);
  }
});
