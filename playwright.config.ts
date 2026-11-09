import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke-тесты. Перед запуском: npm run build.
 * Тесты поднимают production-сервер на порту 3100 с отдельной БД prisma/e2e.db.
 */
const PORT = 3100;
const env = {
  DATABASE_URL: "file:./e2e.db",
  SESSION_SECRET: "e2e-secret-only-for-local-playwright-0123456789",
  PORT: String(PORT),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "ru-RU" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true }, testMatch: /responsive/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive/ },
  ],
});
