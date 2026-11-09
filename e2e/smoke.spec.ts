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
  await expect(page.getByText("Выпуск за горизонт", { exact: true })).toBeVisible();
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
  await expect(page.locator('[data-testid="user-admin"] tr[data-login="engineer"]')).toBeVisible();
});

test("советник по ресурсам: рекомендация → сценарий → парное сравнение с выводом", async ({ page }) => {
  await login(page, "engineer");
  const advisor = page.getByTestId("resource-advisor");
  await expect(advisor.locator("tbody tr")).toHaveCount(7);
  await expect(advisor.getByText(/Рекомендация:/)).toBeVisible();
  await advisor.getByRole("button", { name: "Проверить и сравнить" }).first().click();
  await expect(page).toHaveURL(/\/compare\?baseline=.+&runs=/, { timeout: 30_000 });
  await expect(page.getByTestId("executive-verdict")).toBeVisible();
  await expect(page.getByText(/парное сравнение \(общие случайные числа\)/).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-csv").click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("наблюдатель видит советника без кнопок изменения", async ({ page }) => {
  await login(page, "viewer");
  const advisor = page.getByTestId("resource-advisor");
  await expect(advisor.locator("tbody tr")).toHaveCount(7);
  await expect(advisor.getByRole("button", { name: "Проверить и сравнить" })).toHaveCount(0);
});

test("кейс точки интереса в 3D-туре ведёт к сравнению", async ({ page }) => {
  await login(page, "viewer", "/factory?station=st-machining");
  const card = page.getByTestId("poi-case");
  await expect(card).toBeVisible();
  await expect(card).toContainText("ТОиР");
  await card.getByRole("link", { name: /Открыть сравнение/ }).click();
  await expect(page).toHaveURL(/\/compare\?baseline=.+&runs=.+&station=st-machining/);
  await expect(page.getByTestId("executive-verdict")).toBeVisible();
});

test("кривая пропускной способности показывает запас мощности и таблицу значений", async ({ page }) => {
  await login(page, "viewer");
  const curve = page.getByTestId("capacity-curve");
  await expect(curve.locator("figure")).toHaveCount(2, { timeout: 30_000 });
  await expect(curve.getByText(/установившейся мощности|Запас мощности/).first()).toBeVisible();
  await curve.getByText("Таблица значений").click();
  await expect(curve.locator("tbody tr")).toHaveCount(10);
});

test("маршруты для разных аудиторий переключаются и сохраняются в URL", async ({ page }) => {
  await login(page, "viewer", "/factory");
  await page.getByTestId("tour-select").selectOption("tour-onboarding");
  await expect(page.getByRole("heading", { name: "Первый день в цехе" })).toBeVisible();
  await expect(page).toHaveURL(/tour=tour-onboarding/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Первый день в цехе" })).toBeVisible();
});

test("импорт CSV участков создаёт новый сценарий; ошибки показываются с номером строки", async ({ page }) => {
  await login(page, "engineer", "/scenarios");
  await expect(page.getByTestId("scenario-exchange")).toHaveAttribute("data-ready", "true");
  const input = page.getByTestId("import-file");
  await input.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("code;capacity\nZ9;1\n") });
  await expect(page.getByTestId("import-errors")).toContainText("Строка 2: неизвестный участок");
  await input.setInputFiles({ name: "fakt.csv", mimeType: "text/csv", buffer: Buffer.from("code;capacity\nC1;3\n") });
  await expect(page).toHaveURL(/\/scenarios\?id=/);
  await expect(page.getByTestId("scenario-name")).toHaveValue("Импорт CSV: fakt.csv");
  await expect(page.getByTestId("capacity-st-assembly")).toHaveText("3");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-stations-csv").click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("администратор создаёт пользователя, действие попадает в журнал аудита", async ({ page }) => {
  await login(page, "admin", "/admin");
  const form = page.getByRole("form", { name: "Новый пользователь" });
  await form.getByLabel("Логин").fill("e2e.user");
  await form.getByLabel("Псевдоним (без ФИО)").fill("Проверка E2E");
  await form.getByLabel("Пароль").fill("E2e#Password2026");
  await form.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByRole("status")).toContainText("Пользователь e2e.user создан");
  await expect(page.locator('[data-testid="user-admin"] tr[data-login="e2e.user"]')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("audit-log")).toContainText("Создание пользователя");
});

test("страница учётной записи: смена пароля проверяет текущий пароль", async ({ page }) => {
  await login(page, "viewer", "/account");
  await expect(page.getByRole("heading", { name: "Учётная запись" })).toBeVisible();
  const form = page.getByRole("form", { name: "Смена пароля" });
  await form.getByLabel("Текущий пароль").fill("wrong-password-1");
  await form.getByLabel("Новый пароль", { exact: true }).fill("Brand#NewPass2026");
  await form.getByLabel("Повторите новый пароль").fill("Brand#NewPass2026");
  await form.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Текущий пароль указан неверно" })).toBeVisible();
});
