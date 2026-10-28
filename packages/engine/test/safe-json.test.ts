import { expect, test } from 'vitest';
import { parseUntrustedJson } from '../src/safeJson.ts';

// 程式碼審查修正：匯入用的安全 JSON 解析集中一處（storage、studentExport 共用）。
test('parses ordinary JSON', () => {
  expect(parseUntrustedJson('{"a":[1]}', 100)).toEqual({ ok: true, value: { a: [1] } });
});

test.each([
  ['too large', ' '.repeat(11), 'TOO_LARGE'],
  ['invalid JSON', '{bad', 'INVALID_JSON'],
  ['a nested __proto__ key', '{"a":{"__proto__":{"polluted":true}}}', 'PROTOTYPE_KEY'],
])('rejects %s', (_, raw, code) => {
  expect(parseUntrustedJson(raw, 10 + (code === 'TOO_LARGE' ? 0 : 100))).toEqual({ ok: false, code });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
