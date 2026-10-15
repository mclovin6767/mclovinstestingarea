import { defineConfig, devices } from '@playwright/test';

// Smoke e2e for the frontend only. The backend API is mocked per-test via route interception, so
// these run with no backend/Supabase and are deterministic. The built app is served by `next
// start`; build with a placeholder absolute NEXT_PUBLIC_API_URL ending in `/api` first.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
