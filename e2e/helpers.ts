import { expect, type Page } from "@playwright/test";

export const ACCOUNTS = {
  admin: { login: "admin", password: "Admin#Twin2026" },
  engineer: { login: "engineer", password: "Engineer#Twin2026" },
  viewer: { login: "viewer", password: "Viewer#Twin2026" },
} as const;

export async function login(page: Page, role: keyof typeof ACCOUNTS, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Логин").fill(ACCOUNTS[role].login);
  await page.getByLabel("Пароль").fill(ACCOUNTS[role].password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.locator("main")).toBeVisible();
}
