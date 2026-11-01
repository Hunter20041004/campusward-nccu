import { createGeminiClient, type SessionLike } from './gemini.ts';

function sessionStore(): SessionLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** 整個網站共用一個用戶端；金鑰只在它的閉包裡。 */
export const gemini = createGeminiClient({ fetchImpl: (input, init) => fetch(input, init), session: sessionStore() });
