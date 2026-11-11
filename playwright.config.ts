import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    channel: process.env.PW_CHANNEL || undefined,
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node node_modules/tsx/dist/cli.mjs tests/e2e-server.ts',
      url: 'http://127.0.0.1:3002/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174',
      cwd: './apps/web',
      env: { VITE_SERVER_URL: 'http://127.0.0.1:3002' },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
