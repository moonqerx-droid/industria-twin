import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const PAGES = ["/dashboard", "/process", "/scenarios", "/compare", "/factory", "/documentation", "/account"];

test("ключевые страницы без горизонтальной прокрутки страницы", async ({ page }) => {
  await login(page, "engineer");
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `горизонтальная прокрутка на ${path}`).toBeLessThanOrEqual(1);
    // На мобильных браузер расширяет layout viewport под широкий контент — тогда innerWidth > ширины экрана.
    const widened = await page.evaluate(() => {
      const vv = window.visualViewport;
      return vv ? document.documentElement.clientWidth - vv.width * vv.scale : 0;
    });
    expect(widened, `контент шире экрана на ${path}`).toBeLessThanOrEqual(1);
  }
});

test("навигация доступна и 3D-тур сохраняет маршрут и показатели", async ({ page, isMobile }) => {
  await login(page, "viewer", "/factory");
  const nav = page.getByRole("navigation", { name: isMobile ? "Навигация" : /навигация/i }).first();
  await expect(nav).toBeVisible();
  await expect(page.getByRole("list", { name: "Остановки маршрута" })).toBeVisible();
  await page.getByRole("button", { name: "C1 Сборка" }).click();
  await expect(page.getByTestId("station-panel")).toHaveAttribute("data-station-id", "st-assembly");
});
