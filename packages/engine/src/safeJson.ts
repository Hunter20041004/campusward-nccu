// 匯入不可信檔案用的 JSON 解析：先限制大小，出現 __proto__ 鍵就整份拒絕（驗證程式庫會默默略過它）。

export type UntrustedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: 'TOO_LARGE' | 'INVALID_JSON' | 'PROTOTYPE_KEY' };

class PrototypeKeyError extends Error {}

export function parseUntrustedJson(raw: string, maxLength: number): UntrustedJsonResult {
  if (raw.length > maxLength) return { ok: false, code: 'TOO_LARGE' };
  try {
    return {
      ok: true,
      value: JSON.parse(raw, (key, value: unknown) => {
        if (key === '__proto__') throw new PrototypeKeyError();
        return value;
      }) as unknown,
    };
  } catch (error) {
    return { ok: false, code: error instanceof PrototypeKeyError ? 'PROTOTYPE_KEY' : 'INVALID_JSON' };
  }
}
