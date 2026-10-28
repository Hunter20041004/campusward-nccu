// 引擎只允許使用 ES2023 與以下兩個跨平台全域；其餘（fetch、window、process…）一律注入。
declare class URL {
  constructor(url: string, base?: string | URL);
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly search: string;
  readonly username: string;
  readonly password: string;
  toString(): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
