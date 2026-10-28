// 型別測試：tsc -p packages/engine/tsconfig.json 會檢查本檔。
// 每個 @ts-expect-error 底下的全域若變得可用（例如 @types/node 被自動載入），tsc 會報「未使用的 @ts-expect-error」而失敗。

// @ts-expect-error 引擎不得直接使用 fetch，網路須經參數注入
void fetch;
// @ts-expect-error 引擎不得使用 process
void process;
// @ts-expect-error 引擎不得使用 Buffer
void Buffer;
// @ts-expect-error 引擎不得使用 window
void window;
// @ts-expect-error 引擎不得使用 localStorage，儲存須經參數注入
void localStorage;
// @ts-expect-error 引擎不得使用 document
void document;

export const allowedUrl = new URL('https://es.nccu.edu.tw/course/').hostname;
export const allowedEncoder = new TextEncoder().encode('課').length;
