import { defineConfig, devices } from '@playwright/test';

// 自己開著的開發伺服器常佔用 5174：可用 E2E_PORT 換一個埠跑測試。
const PORT = Number(process.env.E2E_PORT ?? 5174);
// 正式建置＋安全標頭（public/_headers）：CSP 與連線網域測試在這裡跑。
const PREVIEW_PORT = 5175;
const env = { CAMPUSWARD_DATA_DIR: 'e2e/fixtures/data' };

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: /production\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testIgnore: /production\.spec/, use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
    { name: 'production', testMatch: /production\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${PREVIEW_PORT}` } },
  ],
  webServer: [
    {
      command: `npm run dev -w @campusward/web -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      env,
    },
    {
      command: `npm run build -w @campusward/web && npm run preview -w @campusward/web -- --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env,
    },
  ],
});
