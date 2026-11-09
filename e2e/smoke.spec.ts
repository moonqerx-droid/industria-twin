import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Доступ", () => {
  test("незалогиненный пользователь перенаправляется на вход", async ({ page }) => {
    await page.goto("/process");
    await expect(page).toHaveURL(/\/login\?next=%2Fprocess/);
    await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  });

  test("неверный пароль показывает ошибку", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Логин").fill("engineer");
    await page.getByLabel("Пароль").fill("неверный");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" })).toBeVisible();
  });
});

test("дашборд показывает рассчитанные KPI и узкое место", async ({ page }) => {
  await login(page, "engineer");
  await expect(page.getByRole("heading", { name: "Дашборд производства" })).toBeVisible();
  await expect(page.getByText("Выпуск за горизонт")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Узкое место:/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /Состояние производственных участков/ }).locator("tbody tr")).toHaveCount(6);
});

test("выбор участка на мнемосхеме открывает панель и переход в 3D сохраняет выбор", async ({ page }) => {
  await login(page, "viewer", "/process");
  await page.locator('svg [data-node-id="pn-testing"]').click();
  const panel = page.getByTestId("station-panel");
  await expect(panel).toHaveAttribute("data-station-id", "st-testing");
  await expect(page).toHaveURL(/station=st-testing/);
  await panel.getByRole("link", { name: "Показать в 3D" }).click();
  await expect(page).toHaveURL(/\/factory\?station=st-testing/);
  await expect(page.getByTestId("station-panel")).toHaveAttribute("data-station-id", "st-testing");
  await expect(page.getByTestId("poi-card")).toHaveAttribute("data-poi-id", "poi-testing");
});

test("инженер создаёт сценарий, добавляет ресурс, запускает и сравнивает", async ({ page }) => {
  await login(page, "engineer", "/scenarios");
  await page.getByRole("button", { name: "Новый сценарий на основе базового" }).click();
  await expect(page.getByTestId("scenario-name")).toHaveValue("Новый сценарий");
  await page.getByTestId("scenario-name").fill("E2E: третий сборочный пост");
  const assembly = page.locator('[data-station-id="st-assembly"]');
  await assembly.getByRole("button", { name: /увеличить/ }).click();
  await expect(page.getByTestId("capacity-st-assembly")).toHaveText("3");
  await page.getByTestId("run-scenario").click();
  await expect(page.getByRole("status").filter({ hasText: "Моделирование выполнено" })).toBeVisible();
  await expect(page.getByTestId("run-result")).toBeVisible();
  await page.getByRole("link", { name: "Сравнить с базовым" }).click();
  await expect(page).toHaveURL(/\/compare\?baseline=.+&runs=.+/);
  await expect(page.getByTestId("compare-table")).toContainText("E2E: третий сборочный пост");
  await expect(page.getByText("Сборка: вместимость", { exact: true })).toBeVisible();
});

test("наблюдатель не видит действий изменения сценария", async ({ page }) => {
  await login(page, "viewer", "/scenarios");
  await expect(page.getByText("Роль «Наблюдатель»: только просмотр").or(page.getByText(/Базовый сценарий — точка отсчёта/))).toBeVisible();
  await expect(page.getByTestId("run-scenario")).toHaveCount(0);
});

test("3D-тур: сцена загружается, маршрут и воспроизведение работают", async ({ page }) => {
  await login(page, "viewer", "/factory");
  const viewport = page.getByTestId("factory-viewport");
  await expect(viewport.locator("canvas, [data-testid=factory-plan-2d]").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-stop")).toContainText("Склад комплектующих");
  await expect(page.getByTestId("poi-card")).toHaveAttribute("data-poi-id", "poi-receiving");
  await page.getByRole("tab", { name: "Воспроизведение прогона" }).click();
  const controls = page.getByTestId("replay-controls");
  await expect(controls.getByRole("slider", { name: "Модельное время" })).toBeVisible();
  await controls.getByRole("slider", { name: "Модельное время" }).fill("60");
  await expect(viewport).toContainText("Модельное время 05:00");
});

test("без WebGL показывается план цеха с теми же участками", async ({ page }) => {
  await page.addInitScript(() => {
    // Имитация браузера без WebGL: контексты webgl/webgl2 недоступны, 2D работает.
    const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...a: unknown[]) => unknown;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return orig.call(this, type, ...args);
      },
    });
  });
  await login(page, "viewer", "/factory");
  await expect(page.getByTestId("factory-plan-2d")).toBeVisible();
  await expect(page.getByText("WebGL недоступен")).toBeVisible();
  await page.getByTestId("factory-plan-2d").locator('[data-station-id="st-assembly"]').click();
  await expect(page.getByTestId("station-panel")).toHaveAttribute("data-station-id", "st-assembly");
});

test("администратор видит раздел администрирования", async ({ page }) => {
  await login(page, "admin", "/admin");
  await expect(page.getByRole("heading", { name: "Администрирование" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "engineer", exact: true })).toBeVisible();
});
