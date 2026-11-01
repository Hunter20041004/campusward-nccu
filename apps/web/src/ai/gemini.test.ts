import { describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../test/memoryStorage.ts';
import { createGeminiClient, GeminiError, KEY_STORAGE } from './gemini.ts';

const KEY = 'AIzaSyTEST-not-a-real-key-000000000000';
const ok = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }), { status: 200 });
const failure = (status: number, reason?: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  error: { code: status, message: `upstream says ${KEY}`, status: 'X', details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] : [], ...extra },
}), { status });

function client(response: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const session = memoryStorage();
  const gemini = createGeminiClient({ fetchImpl, session });
  gemini.setKey(KEY, false);
  return { gemini, fetchImpl, session };
}
const kindOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'none';
  } catch (error) {
    expect(error).toBeInstanceOf(GeminiError);
    expect(String((error as Error).message)).not.toContain(KEY);
    return (error as GeminiError).kind;
  }
};
const call = { model: 'gemini-3.8-flash', system: '規則', user: '{}' } as const;

describe('Gemini client', () => {
  test('sends the key only in the x-goog-api-key header and asks for JSON', async () => {
    const { gemini, fetchImpl } = client(ok('{"actions":[]}'));
    expect(await gemini.generate(call)).toBe('{"actions":[]}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('key=');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe(KEY);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(body).toMatchObject({ systemInstruction: { parts: [{ text: '規則' }] }, generationConfig: { responseMimeType: 'application/json' } });
  });

  test.each([
    [failure(400, 'API_KEY_INVALID'), 'invalid-key'],
    [failure(400), 'bad-request'],
    [failure(401), 'bad-request'],
    [failure(403, 'API_KEY_SERVICE_BLOCKED'), 'permission'],
    [failure(429, 'RATE_LIMIT_EXCEEDED'), 'quota'],
    [failure(400, 'RESOURCE_EXHAUSTED'), 'quota'],
    [failure(503), 'server'],
    [new TypeError('Failed to fetch'), 'network'],
    [ok('', 'SAFETY'), 'blocked'],
    [new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }), 'blocked'],
    [ok('{"actions":', 'MAX_TOKENS'), 'truncated'],
    [ok(''), 'empty'],
  ])('classifies %# by the error reason, not the status alone', async (response, kind) => {
    expect(await kindOf(client(response).gemini.generate(call))).toBe(kind);
  });

  test('keeps the key in memory only unless the student asks to remember it for this tab', () => {
    const { gemini, session } = client(ok(''));
    expect(gemini.hasKey()).toBe(true);
    expect(JSON.stringify(session.values)).not.toContain(KEY);
    gemini.setKey(KEY, true);
    expect(session.values[KEY_STORAGE]).toBe(KEY);
    gemini.removeKey();
    expect(gemini.hasKey()).toBe(false);
    expect(session.values[KEY_STORAGE]).toBeUndefined();
  });

  test('restores a remembered key in the same tab', () => {
    const gemini = createGeminiClient({ fetchImpl: vi.fn(), session: memoryStorage({ [KEY_STORAGE]: KEY }) });
    expect(gemini.hasKey()).toBe(true);
  });

  test('refuses to call without a key', async () => {
    const fetchImpl = vi.fn();
    const gemini = createGeminiClient({ fetchImpl, session: memoryStorage() });
    expect(await kindOf(gemini.generate(call))).toBe('no-key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects a key with characters that cannot be a Gemini key', () => {
    const gemini = createGeminiClient({ fetchImpl: vi.fn(), session: memoryStorage() });
    expect(() => gemini.setKey('not a key\n', false)).toThrow(GeminiError);
    expect(gemini.hasKey()).toBe(false);
  });
});

test('sends a screenshot as inline data before the text', async () => {
  const fetchImpl = vi.fn(async () => ok('{"recognizedCourses":[]}'));
  const gemini = createGeminiClient({ fetchImpl, session: memoryStorage() });
  gemini.setKey(KEY, false);
  await gemini.generate({ ...call, image: { mimeType: 'image/png', data: 'AAAA' } });
  const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { contents: { parts: unknown[] }[] };
  expect(body.contents[0]!.parts).toEqual([{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: '{}' }]);
});

test.each([
  [new Response(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'models/x is not found' } }), { status: 404 })],
  [new Response(JSON.stringify({ error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported' } }), { status: 400 })],
])('does not ask the student to rephrase when the model cannot be used', async (response) => {
  const fetchImpl = vi.fn(async () => response);
  const gemini = createGeminiClient({ fetchImpl, session: memoryStorage() });
  gemini.setKey(KEY, false);
  await expect(gemini.generate(call)).rejects.toMatchObject({ kind: 'unavailable' });
});
