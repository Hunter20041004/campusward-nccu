// Gemini 用戶端（設計 6.2、6.3；計畫 4.1、4.2）。
// 金鑰只放在這個閉包：不進 React 狀態、localStorage、匯出檔、網址、錯誤訊息或 console。
// 學生勾選「這個分頁記住」才寫 sessionStorage（關掉分頁就消失）。

export const KEY_STORAGE = 'campusward:gemini-key';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Gemini 金鑰只含英數、底線與連字號；擋掉貼錯的換行、空白與網址。
const KEY_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export type GeminiErrorKind =
  | 'no-key' | 'invalid-key' | 'permission' | 'quota' | 'bad-request' | 'server' | 'network' | 'blocked' | 'truncated' | 'empty';

const MESSAGES: Record<GeminiErrorKind, string> = {
  'no-key': '還沒有貼上 Gemini 金鑰。',
  'invalid-key': 'Gemini 說這把金鑰無效，請重新複製金鑰再貼一次。',
  permission: '這把金鑰不能使用 Gemini API，請到 Google AI Studio 確認金鑰的權限。',
  quota: '這把金鑰的免費額度暫時用完了，請稍後再試，或明天再用。',
  'bad-request': 'Gemini 看不懂這次的請求，請換個說法再試一次。',
  server: 'Gemini 暫時沒有回應，請稍後再試。',
  network: '連不上 Gemini，請檢查網路。',
  blocked: 'Gemini 的安全過濾擋下了這次回覆，請換個說法。',
  truncated: 'Gemini 的回覆太長被截斷，請把需求拆小一點。',
  empty: 'Gemini 沒有回覆內容，請再試一次。',
};

export class GeminiError extends Error {
  readonly kind: GeminiErrorKind;
  constructor(kind: GeminiErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'GeminiError';
    this.kind = kind;
  }
}

export interface SessionLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GenerateRequest {
  model: string;
  system: string;
  user: string;
  /** 截圖匯入：base64 圖片（不含 data: 前綴）。 */
  image?: { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string };
  maxOutputTokens?: number;
}

export interface GeminiClient {
  hasKey(): boolean;
  /** remember 為 true 時存到這個分頁的 sessionStorage。 */
  setKey(key: string, remember: boolean): void;
  removeKey(): void;
  generate(request: GenerateRequest): Promise<string>;
}

const BLOCKED_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE']);

// 依 error.details[].reason 分類；狀態碼只在沒有 reason 時當備援（舊程式把 400/401 一律當金鑰無效）。
function classify(status: number, body: unknown): GeminiErrorKind {
  const error = (body as { error?: { details?: { reason?: unknown }[] } } | null)?.error;
  const reasons = (error?.details ?? []).map(({ reason }) => String(reason ?? ''));
  if (reasons.includes('API_KEY_INVALID')) return 'invalid-key';
  if (reasons.some((reason) => reason === 'RESOURCE_EXHAUSTED' || reason === 'RATE_LIMIT_EXCEEDED') || status === 429) return 'quota';
  if (reasons.some((reason) => reason.startsWith('API_KEY_') || reason === 'SERVICE_DISABLED' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') || status === 403) {
    return 'permission';
  }
  return status >= 500 ? 'server' : 'bad-request';
}

export function createGeminiClient({ fetchImpl = fetch, session }: { fetchImpl?: typeof fetch; session?: SessionLike | null } = {}): GeminiClient {
  let key = '';
  try {
    key = session?.getItem(KEY_STORAGE) ?? '';
  } catch {
    key = '';
  }
  if (!KEY_PATTERN.test(key)) key = '';

  const forget = () => {
    try {
      session?.removeItem(KEY_STORAGE);
    } catch {
      // 讀不到 sessionStorage 時本來就沒存。
    }
  };

  return {
    hasKey: () => key !== '',
    setKey(next, remember) {
      const trimmed = next.trim();
      if (!KEY_PATTERN.test(trimmed)) throw new GeminiError('invalid-key');
      key = trimmed;
      if (!remember) {
        forget();
        return;
      }
      try {
        session?.setItem(KEY_STORAGE, key);
      } catch {
        // 存不進去就只留在記憶體。
      }
    },
    removeKey() {
      key = '';
      forget();
    },
    async generate({ model, system, user, image, maxOutputTokens = 4096 }) {
      if (!key) throw new GeminiError('no-key');
      let response: Response;
      try {
        response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [...(image ? [{ inlineData: image }] : []), { text: user }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens },
          }),
          referrerPolicy: 'no-referrer',
          credentials: 'omit',
        });
      } catch {
        throw new GeminiError('network');
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) throw new GeminiError(classify(response.status, body));
      const data = body as {
        promptFeedback?: { blockReason?: string };
        candidates?: { finishReason?: string; content?: { parts?: { text?: unknown; thought?: boolean }[] } }[];
      } | null;
      if (data?.promptFeedback?.blockReason) throw new GeminiError('blocked');
      const candidate = data?.candidates?.[0];
      const finish = candidate?.finishReason ?? '';
      if (BLOCKED_FINISH.has(finish)) throw new GeminiError('blocked');
      if (finish === 'MAX_TOKENS') throw new GeminiError('truncated');
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('');
      if (!text.trim()) throw new GeminiError('empty');
      return text;
    },
  };
}
