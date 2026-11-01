// 網站的 CSP 不允許 eval（script-src 'self'）：關掉 zod 用 Function() 試探與加速的功能，避免違規紀錄。
import { z } from 'zod';

z.config({ jitless: true });
