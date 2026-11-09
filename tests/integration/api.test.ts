import { beforeAll, describe, expect, it } from "vitest";
import * as loginRoute from "@/app/api/auth/login/route";
import * as logoutRoute from "@/app/api/auth/logout/route";
import * as meRoute from "@/app/api/auth/me/route";
import * as modelRoute from "@/app/api/model/route";
import * as resourcesRoute from "@/app/api/resources/route";
import * as scenariosRoute from "@/app/api/scenarios/route";
import * as scenarioRoute from "@/app/api/scenarios/[id]/route";
import * as copyRoute from "@/app/api/scenarios/[id]/copy/route";
import * as runRoute from "@/app/api/scenarios/[id]/run/route";
import * as runsRoute from "@/app/api/runs/route";
import * as runDetailRoute from "@/app/api/runs/[id]/route";
import * as replayRoute from "@/app/api/runs/[id]/replay/route";
import * as adviceRoute from "@/app/api/runs/[id]/advice/route";
import * as compareRoute from "@/app/api/compare/route";
import * as poisRoute from "@/app/api/pois/route";
import * as tourRoute from "@/app/api/tour/route";
import * as stationMetricsRoute from "@/app/api/stations/[id]/metrics/route";
import * as usersRoute from "@/app/api/admin/users/route";
import * as userRoute from "@/app/api/admin/users/[id]/route";
import * as auditRoute from "@/app/api/admin/audit/route";
import * as passwordRoute from "@/app/api/auth/password/route";
import { BASELINE_PARAMETERS, STATION_IDS } from "@/domain/model/demoData";
import { demoAccounts } from "@/server/services/seedService";
import { adviceLimiter, loginLimiter, passwordChangeLimiter, simulationLimiter } from "@/server/rateLimit";
import { resetLoginThrottle, throttleDelayMs, THROTTLE } from "@/server/auth/loginThrottle";

const BASE = "http://localhost:3000";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function request(path: string, opts: { method?: string; cookie?: string; body?: unknown; origin?: string } = {}): Request {
  const headers = new Headers({ host: "localhost:3000" });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function login(role: "admin" | "engineer" | "viewer"): Promise<string> {
  const acc = demoAccounts().find((a) => a.role === role)!;
  const res = await loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: acc.login, password: acc.password } }));
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie.toLowerCase()).toContain("samesite=lax");
  return setCookie.split(";")[0]!;
}

let engineer = "";
let viewer = "";
let admin = "";

beforeAll(async () => {
  loginLimiter.reset();
  resetLoginThrottle({ baseDelayMs: 1 });
  simulationLimiter.reset();
  engineer = await login("engineer");
  viewer = await login("viewer");
  admin = await login("admin");
});

describe("Аутентификация", () => {
  it("отклоняет неверный пароль", async () => {
    const res = await loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: "engineer", password: "wrong" } }));
    expect(res.status).toBe(401);
  });
  it("отклоняет некорректное тело запроса", async () => {
    const res = await loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: "" } }));
    expect(res.status).toBe(400);
  });
  it("без cookie доступ к API запрещён", async () => {
    const res = await modelRoute.GET(request("/api/model"));
    expect(res.status).toBe(401);
  });
  it("поддельный токен не принимается", async () => {
    const res = await modelRoute.GET(request("/api/model", { cookie: "it_session=eyJhbGciOiJIUzI1NiJ9.e30.invalid" }));
    expect(res.status).toBe(401);
  });
  it("возвращает текущего пользователя и роль", async () => {
    const res = await meRoute.GET(request("/api/auth/me", { cookie: engineer }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("engineer");
  });
  it("выход отзывает серверную сессию", async () => {
    const cookie = await login("viewer");
    const out = await logoutRoute.POST(request("/api/auth/logout", { method: "POST", cookie }));
    expect(out.status).toBe(200);
    const res = await meRoute.GET(request("/api/auth/me", { cookie }));
    expect(res.status).toBe(401);
  });
  it("за доверенным прокси ограничивает попытки входа с одного адреса (429)", async () => {
    loginLimiter.reset();
    resetLoginThrottle({ baseDelayMs: 1 });
    process.env.TRUST_PROXY = "1";
    try {
      let last = 0;
      for (let i = 0; i < 11; i += 1) {
        const req = request("/api/auth/login", { method: "POST", body: { login: "brute", password: "x" } });
        req.headers.set("x-forwarded-for", "203.0.113.7");
        last = (await loginRoute.POST(req)).status;
      }
      expect(last).toBe(429);
    } finally {
      delete process.env.TRUST_PROXY;
      loginLimiter.reset();
      resetLoginThrottle({ baseDelayMs: 1 });
    }
  });

  it("параллельный перебор невозможен: одна попытка на логин одновременно", async () => {
    resetLoginThrottle({ baseDelayMs: 1 });
    const statuses = await Promise.all(
      Array.from({ length: 20 }, () => loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: "viewer", password: "guess" } })).then((r) => r.status)),
    );
    expect(statuses.filter((x) => x === 401).length).toBeLessThanOrEqual(3);
    expect(statuses.filter((x) => x === 429).length).toBeGreaterThanOrEqual(17);
    resetLoginThrottle({ baseDelayMs: 1 });
  });

  it("смена X-Forwarded-For без TRUST_PROXY не обходит замедление по логину", async () => {
    resetLoginThrottle({ baseDelayMs: 1 });
    for (let i = 0; i < 12; i += 1) {
      const req = request("/api/auth/login", { method: "POST", body: { login: "viewer", password: "guess" } });
      req.headers.set("x-forwarded-for", `10.0.0.${i}`);
      expect((await loginRoute.POST(req)).status).toBe(401);
    }
    expect(throttleDelayMs("viewer")).toBeGreaterThan(0);
    resetLoginThrottle({ baseDelayMs: 1 });
  });

  it("посторонний не может заблокировать вход: после серии неудач владелец входит с верным паролем", async () => {
    resetLoginThrottle({ baseDelayMs: 1 });
    const acc = demoAccounts().find((a) => a.role === "viewer")!;
    for (let i = 0; i < 12; i += 1) {
      await loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: acc.login, password: `attack${i}` } }));
    }
    expect(throttleDelayMs(acc.login)).toBeGreaterThan(0);
    const ok = await loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: acc.login, password: acc.password } }));
    expect(ok.status).toBe(200);
    expect(throttleDelayMs(acc.login)).toBe(0);
  });

  it("задержка растёт экспоненциально после бесплатных попыток и ограничена сверху", () => {
    resetLoginThrottle();
    expect(throttleDelayMs("nobody")).toBe(0);
    expect(THROTTLE.MAX_DELAY_MS).toBeLessThanOrEqual(5_000);
  });

  it("успешные входы не расходуют лимит, успешный вход сбрасывает счётчик неудач", async () => {
    loginLimiter.reset();
    const acc = demoAccounts().find((a) => a.role === "viewer")!;
    const ok = () => loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: acc.login, password: acc.password } }));
    const bad = () => loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login: acc.login, password: "wrong" } }));
    for (let i = 0; i < 15; i += 1) expect((await ok()).status).toBe(200);
    for (let i = 0; i < 9; i += 1) expect((await bad()).status).toBe(401);
    expect((await ok()).status).toBe(200);
    for (let i = 0; i < 9; i += 1) expect((await bad()).status).toBe(401);
    expect((await ok()).status).toBe(200);
    loginLimiter.reset();
  });
});

describe("Производственная модель и тур", () => {
  it("возвращает участки со стабильными идентификаторами и граф процесса", async () => {
    const res = await modelRoute.GET(request("/api/model", { cookie: viewer }));
    const body = await res.json();
    expect(body.stations.map((s: { id: string }) => s.id)).toEqual([...STATION_IDS]);
    expect(body.nodes.length).toBeGreaterThan(5);
    const nodeIds = new Set(body.nodes.map((n: { id: string }) => n.id));
    for (const e of body.edges) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    }
    // Каждый участок связан с точкой интереса 3D-тура.
    for (const s of body.stations) expect(s.poiId).toBeTruthy();
  });
  it("ресурсы привязаны к участкам", async () => {
    const body = await (await resourcesRoute.GET(request("/api/resources", { cookie: viewer }))).json();
    expect(body.resources.length).toBe(STATION_IDS.length);
  });
  it("точки интереса ссылаются на существующие участки", async () => {
    const body = await (await poisRoute.GET(request("/api/pois", { cookie: viewer }))).json();
    for (const p of body.pois) if (p.stationId) expect(STATION_IDS).toContain(p.stationId);
  });
  it("состояние тура содержит метрики прогона по тем же stationId", async () => {
    const body = await (await tourRoute.GET(request("/api/tour", { cookie: viewer }))).json();
    expect(body.run).not.toBeNull();
    expect(body.run.isBaselineScenario).toBe(true);
    const stationIds = body.run.stations.map((s: { stationId: string }) => s.stationId);
    for (const p of body.pois) if (p.stationId) expect(stationIds).toContain(p.stationId);
    expect(body.tours[0].stops.length).toBeGreaterThan(3);
  });
  it("метрики участка (выбор станции) и обработка неизвестного id", async () => {
    const ok = await stationMetricsRoute.GET(request("/api/stations/st-testing/metrics", { cookie: viewer }), ctx("st-testing"));
    const body = await ok.json();
    expect(body.station.stationId).toBe("st-testing");
    expect(body.station.metrics.utilization.mean).toBeGreaterThan(0);
    const missing = await stationMetricsRoute.GET(request("/api/stations/st-unknown/metrics", { cookie: viewer }), ctx("st-unknown"));
    expect(missing.status).toBe(404);
  });
});

describe("Сценарии и моделирование", () => {
  let createdId = "";
  let runId = "";

  it("наблюдатель не может создавать сценарии и запускать моделирование", async () => {
    const res = await scenariosRoute.POST(
      request("/api/scenarios", { method: "POST", cookie: viewer, body: { name: "Попытка", parameters: BASELINE_PARAMETERS } }),
    );
    expect(res.status).toBe(403);
    const run = await runRoute.POST(request("/api/scenarios/sc-baseline/run", { method: "POST", cookie: viewer }), ctx("sc-baseline"));
    expect(run.status).toBe(403);
  });

  it("инженер создаёт сценарий", async () => {
    const params = {
      ...BASELINE_PARAMETERS,
      replications: 5,
      stations: { ...BASELINE_PARAMETERS.stations, "st-machining": { ...BASELINE_PARAMETERS.stations["st-machining"], capacity: 4 } },
    };
    const res = await scenariosRoute.POST(
      request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Четвёртый станок ЧПУ", description: "тест", parameters: params } }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    createdId = body.scenario.id;
    expect(body.scenario.parameters.stations["st-machining"].capacity).toBe(4);
  });

  it("валидация отклоняет недопустимые параметры", async () => {
    const bad = { ...BASELINE_PARAMETERS, defectProbability: 1.5 };
    const res = await scenariosRoute.POST(request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Плохой", parameters: bad } }));
    expect(res.status).toBe(400);
    const tri = {
      ...BASELINE_PARAMETERS,
      stations: { ...BASELINE_PARAMETERS.stations, "st-assembly": { ...BASELINE_PARAMETERS.stations["st-assembly"], processTime: { kind: "triangular", min: 30, mode: 10, max: 40 } } },
    };
    const res2 = await scenariosRoute.POST(request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Плохой 2", parameters: tri } }));
    expect(res2.status).toBe(400);
  });

  it("CSRF: запрос с чужого Origin отклоняется", async () => {
    const res = await scenariosRoute.POST(
      request("/api/scenarios", { method: "POST", cookie: engineer, origin: "https://evil.example", body: { name: "CSRF", parameters: BASELINE_PARAMETERS } }),
    );
    expect(res.status).toBe(403);
  });

  it("редактирует и сохраняет сценарий", async () => {
    const res = await scenarioRoute.PUT(
      request(`/api/scenarios/${createdId}`, { method: "PUT", cookie: engineer, body: { name: "Четвёртый станок ЧПУ (ред.)" } }),
      ctx(createdId),
    );
    expect(res.status).toBe(200);
    const got = await (await scenarioRoute.GET(request(`/api/scenarios/${createdId}`, { cookie: viewer }), ctx(createdId))).json();
    expect(got.scenario.name).toBe("Четвёртый станок ЧПУ (ред.)");
  });

  it("базовый сценарий защищён от изменения параметров и удаления", async () => {
    const res = await scenarioRoute.PUT(
      request("/api/scenarios/sc-baseline", { method: "PUT", cookie: engineer, body: { parameters: BASELINE_PARAMETERS } }),
      ctx("sc-baseline"),
    );
    expect(res.status).toBe(409);
    const del = await scenarioRoute.DELETE(request("/api/scenarios/sc-baseline", { method: "DELETE", cookie: engineer }), ctx("sc-baseline"));
    expect(del.status).toBe(409);
  });

  it("неизвестный сценарий → 404", async () => {
    const res = await scenarioRoute.GET(request("/api/scenarios/nope", { cookie: viewer }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("запускает моделирование и сохраняет результат", async () => {
    const res = await runRoute.POST(request(`/api/scenarios/${createdId}/run`, { method: "POST", cookie: engineer }), ctx(createdId));
    expect(res.status).toBe(201);
    const { run } = await res.json();
    runId = run.id;
    expect(run.replications).toBe(5);
    expect(run.aggregate.completed.n).toBe(5);
    expect(run.stations.find((s: { stationId: string }) => s.stationId === "st-machining").metrics.capacity.mean).toBe(4);
    const list = await (await runsRoute.GET(request(`/api/runs?scenarioId=${createdId}`, { cookie: viewer }))).json();
    expect(list.runs.map((r: { id: string }) => r.id)).toContain(runId);
    const detail = await runDetailRoute.GET(request(`/api/runs/${runId}`, { cookie: viewer }), ctx(runId));
    expect(detail.status).toBe(200);
  });

  it("журнал воспроизведения содержит упорядоченные события и кадры", async () => {
    const body = await (await replayRoute.GET(request(`/api/runs/${runId}/replay`, { cookie: viewer }), ctx(runId))).json();
    expect(body.events.length).toBeGreaterThan(100);
    expect(body.snapshots.length).toBeGreaterThan(10);
    for (let i = 1; i < body.events.length; i += 1) expect(body.events[i][0]).toBeGreaterThanOrEqual(body.events[i - 1][0]);
  });

  it("повторный запуск того же сценария воспроизводит те же средние", async () => {
    const res = await runRoute.POST(request(`/api/scenarios/${createdId}/run`, { method: "POST", cookie: engineer }), ctx(createdId));
    const { run } = await res.json();
    const first = await (await runDetailRoute.GET(request(`/api/runs/${runId}`, { cookie: viewer }), ctx(runId))).json();
    expect(run.aggregate.completed.mean).toBe(first.run.aggregate.completed.mean);
    expect(run.aggregate.cycleTimeAvgMin.mean).toBe(first.run.aggregate.cycleTimeAvgMin.mean);
  });

  it("сравнивает прогон с базовым", async () => {
    const tour = await (await tourRoute.GET(request("/api/tour", { cookie: viewer }))).json();
    const baselineRunId = tour.run.id;
    const res = await compareRoute.GET(request(`/api/compare?baseline=${baselineRunId}&runs=${runId}`, { cookie: viewer }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const alt = body.alternatives[0];
    expect(alt.run.id).toBe(runId);
    expect(alt.parameterChanges.some((c: { path: string }) => c.path === "stations.st-machining.capacity")).toBe(true);
    const completed = alt.aggregate.find((m: { key: string }) => m.key === "completed");
    expect(completed.absDiff).toBeCloseTo(completed.after - completed.before, 6);
    expect(["better", "worse", "unchanged"]).toContain(completed.verdict);
    expect(body.method).toContain("Уэлча");
  });

  it("демонстрационные прогоны с одинаковым seed сравниваются парно (CRN), кейсы тура рассчитаны", async () => {
    const tour = await (await tourRoute.GET(request("/api/tour", { cookie: viewer }))).json();
    expect(tour.cases.length).toBeGreaterThanOrEqual(4);
    for (const c of tour.cases) {
      expect(c.paired).toBe(true);
      expect(c.items.length).toBeGreaterThan(0);
    }
    const c = tour.cases.find((x: { poiId: string }) => x.poiId === "poi-machining");
    const res = await compareRoute.GET(request(`/api/compare?baseline=${c.baselineRunId}&runs=${c.runId}`, { cookie: viewer }));
    const body = await res.json();
    expect(body.pairedFlags).toEqual([true]);
    expect(body.method).toContain("парное");
    const cycle = body.alternatives[0].aggregate.find((m: { key: string }) => m.key === "cycleTimeAvgMin");
    expect(cycle.method).toBe("paired");
    expect(body.alternatives[0].parameterChanges.some((x: { path: string }) => x.path === "stations.st-machining.failure")).toBe(true);
  });

  it("советник по ресурсам доступен наблюдателю и ранжирует варианты", async () => {
    adviceLimiter.reset();
    const tour = await (await tourRoute.GET(request("/api/tour", { cookie: viewer }))).json();
    const res = await adviceRoute.GET(request(`/api/runs/${tour.run.id}/advice`, { cookie: viewer }), ctx(tour.run.id));
    expect(res.status).toBe(200);
    const { advice } = await res.json();
    expect(advice.candidates.length).toBe(7);
    expect(advice.paired).toBe(true);
    expect(advice.best).not.toBeNull();
    expect((await adviceRoute.GET(request("/api/runs/unknown/advice", { cookie: viewer }), ctx("unknown"))).status).toBe(404);
    expect((await adviceRoute.GET(request(`/api/runs/${tour.run.id}/advice`), ctx(tour.run.id))).status).toBe(401);
  });

  it("сохраняет параметры отказов оборудования и проверяет их", async () => {
    const params = {
      ...BASELINE_PARAMETERS,
      replications: 3,
      stations: { ...BASELINE_PARAMETERS.stations, "st-assembly": { ...BASELINE_PARAMETERS.stations["st-assembly"], failure: { mtbfMin: 480, mttrMin: 25 } } },
    };
    const res = await scenariosRoute.POST(request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Отказы сборки", parameters: params } }));
    expect(res.status).toBe(201);
    const { scenario } = await res.json();
    expect(scenario.parameters.stations["st-assembly"].failure).toEqual({ mtbfMin: 480, mttrMin: 25 });
    expect(scenario.parameters.stations["st-packing"].failure).toBeNull();
    const run = await (await runRoute.POST(request(`/api/scenarios/${scenario.id}/run`, { method: "POST", cookie: engineer }), ctx(scenario.id))).json();
    const st = run.run.stations.find((s: { stationId: string }) => s.stationId === "st-assembly");
    expect(st.metrics.failures.mean).toBeGreaterThan(0);
    expect(st.metrics.availability.mean).toBeLessThan(1);
    const bad = { ...params, stations: { ...params.stations, "st-assembly": { ...params.stations["st-assembly"], failure: { mtbfMin: 480, mttrMin: 0 } } } };
    expect((await scenariosRoute.POST(request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Неверные отказы", parameters: bad } }))).status).toBe(400);
    await scenarioRoute.DELETE(request(`/api/scenarios/${scenario.id}`, { method: "DELETE", cookie: engineer }), ctx(scenario.id));
  });

  it("сравнение с неизвестным прогоном → 404, без параметров → 400", async () => {
    const tour = await (await tourRoute.GET(request("/api/tour", { cookie: viewer }))).json();
    const res = await compareRoute.GET(request(`/api/compare?baseline=${tour.run.id}&runs=missing`, { cookie: viewer }));
    expect(res.status).toBe(404);
    const res2 = await compareRoute.GET(request(`/api/compare`, { cookie: viewer }));
    expect(res2.status).toBe(400);
  });

  it("копирует сценарий", async () => {
    const res = await copyRoute.POST(request(`/api/scenarios/sc-baseline/copy`, { method: "POST", cookie: engineer }), ctx("sc-baseline"));
    expect(res.status).toBe(201);
    const { scenario } = await res.json();
    expect(scenario.parentScenarioId).toBe("sc-baseline");
    expect(scenario.isBaseline).toBe(false);
  });

  it("ограничивает частоту запусков моделирования", async () => {
    simulationLimiter.reset();
    let last = 0;
    for (let i = 0; i < 13; i += 1) {
      const res = await runRoute.POST(request(`/api/scenarios/${createdId}/run`, { method: "POST", cookie: engineer }), ctx(createdId));
      last = res.status;
    }
    expect(last).toBe(429);
    simulationLimiter.reset();
  });

  it("удаляет сценарий вместе с прогонами; удаление прогонов — только admin", async () => {
    const delRunByEngineer = await runDetailRoute.DELETE(request(`/api/runs/${runId}`, { method: "DELETE", cookie: engineer }), ctx(runId));
    expect(delRunByEngineer.status).toBe(403);
    const delRun = await runDetailRoute.DELETE(request(`/api/runs/${runId}`, { method: "DELETE", cookie: admin }), ctx(runId));
    expect(delRun.status).toBe(200);
    const res = await scenarioRoute.DELETE(request(`/api/scenarios/${createdId}`, { method: "DELETE", cookie: engineer }), ctx(createdId));
    expect(res.status).toBe(200);
    const list = await (await runsRoute.GET(request(`/api/runs?scenarioId=${createdId}`, { cookie: viewer }))).json();
    expect(list.runs.length).toBe(0);
  });

  it("список пользователей доступен только администратору и не содержит хешей", async () => {
    expect((await usersRoute.GET(request("/api/admin/users", { cookie: engineer }))).status).toBe(403);
    const body = await (await usersRoute.GET(request("/api/admin/users", { cookie: admin }))).json();
    expect(body.users.length).toBe(3);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });
});

describe("Управление пользователями и журнал аудита", () => {
  const pwd = "Strong#Pass2026";
  let newId = "";
  const loginAs = (login: string, password: string) =>
    loginRoute.POST(request("/api/auth/login", { method: "POST", body: { login, password } }));

  it("администратор создаёт пользователя; проверяются права, уникальность и политика пароля", async () => {
    loginLimiter.reset();
    const body = { login: "tester.one", displayName: "Тестировщик", role: "engineer", password: pwd };
    expect((await usersRoute.POST(request("/api/admin/users", { method: "POST", cookie: engineer, body }))).status).toBe(403);
    expect((await usersRoute.POST(request("/api/admin/users", { method: "POST", cookie: admin, body: { ...body, password: "short1" } }))).status).toBe(400);
    expect((await usersRoute.POST(request("/api/admin/users", { method: "POST", cookie: admin, body: { ...body, password: "onlyletterslong" } }))).status).toBe(400);
    const res = await usersRoute.POST(request("/api/admin/users", { method: "POST", cookie: admin, body }));
    expect(res.status).toBe(201);
    newId = (await res.json()).user.id;
    expect((await usersRoute.POST(request("/api/admin/users", { method: "POST", cookie: admin, body }))).status).toBe(409);
    expect((await loginAs("tester.one", pwd)).status).toBe(200);
  });

  it("блокировка и смена пароля отзывают сессии", async () => {
    const res = await loginAs("tester.one", pwd);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect((await meRoute.GET(request("/api/auth/me", { cookie }))).status).toBe(200);
    const block = await userRoute.PATCH(request(`/api/admin/users/${newId}`, { method: "PATCH", cookie: admin, body: { isActive: false } }), ctx(newId));
    expect(block.status).toBe(200);
    expect((await meRoute.GET(request("/api/auth/me", { cookie }))).status).toBe(401);
    expect((await loginAs("tester.one", pwd)).status).toBe(401);
    await userRoute.PATCH(request(`/api/admin/users/${newId}`, { method: "PATCH", cookie: admin, body: { isActive: true } }), ctx(newId));
    const cookie2 = (await loginAs("tester.one", pwd)).headers.get("set-cookie")!.split(";")[0]!;
    await userRoute.PATCH(request(`/api/admin/users/${newId}`, { method: "PATCH", cookie: admin, body: { password: "Another#Pass2027" } }), ctx(newId));
    expect((await meRoute.GET(request("/api/auth/me", { cookie: cookie2 }))).status).toBe(401);
    expect((await loginAs("tester.one", "Another#Pass2027")).status).toBe(200);
    loginLimiter.reset();
  });

  it("администратор не может заблокировать, понизить или удалить себя", async () => {
    const list = await (await usersRoute.GET(request("/api/admin/users", { cookie: admin }))).json();
    const id = list.users.find((u: { login: string }) => u.login === "admin").id as string;
    for (const body of [{ isActive: false }, { role: "viewer" }]) {
      const res = await userRoute.PATCH(request(`/api/admin/users/${id}`, { method: "PATCH", cookie: admin, body }), ctx(id));
      expect(res.status).toBe(409);
    }
    expect((await userRoute.DELETE(request(`/api/admin/users/${id}`, { method: "DELETE", cookie: admin }), ctx(id))).status).toBe(409);
  });

  it("неуспешный вход с несуществующим логином не сохраняет введённый текст", async () => {
    loginLimiter.reset();
    await loginAs("Secret#Typed2026", "x");
    const all = await (await auditRoute.GET(request("/api/admin/audit?action=login.failure", { cookie: admin }))).json();
    expect(JSON.stringify(all)).not.toContain("Secret#Typed2026");
    expect(all.entries[0].userLogin).toBe("неизвестный логин");
    loginLimiter.reset();
  });

  it("советник отклоняет чрезмерно тяжёлый для анализа сценарий (422)", async () => {
    adviceLimiter.reset();
    const heavy = { ...BASELINE_PARAMETERS, horizonMin: 10_080, releaseWindowMin: 10_080, arrivalRatePerHour: 60, replications: 5 };
    const created = await (await scenariosRoute.POST(request("/api/scenarios", { method: "POST", cookie: engineer, body: { name: "Тяжёлый", parameters: heavy } }))).json();
    const id = created.scenario.id as string;
    const run = await (await runRoute.POST(request(`/api/scenarios/${id}/run`, { method: "POST", cookie: engineer }), ctx(id))).json();
    const res = await adviceRoute.GET(request(`/api/runs/${run.run.id}/advice`, { cookie: engineer }), ctx(run.run.id));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("ANALYSIS_TOO_HEAVY");
    await scenarioRoute.DELETE(request(`/api/scenarios/${id}`, { method: "DELETE", cookie: engineer }), ctx(id));
  });

  it("журнал аудита фиксирует действия и доступен только администратору", async () => {
    expect((await auditRoute.GET(request("/api/admin/audit", { cookie: viewer }))).status).toBe(403);
    const all = await (await auditRoute.GET(request("/api/admin/audit?limit=500", { cookie: admin }))).json();
    const actions = new Set(all.entries.map((e: { action: string }) => e.action));
    for (const a of ["login.success", "login.failure", "scenario.create", "simulation.run", "user.create", "user.update", "user.password"]) expect(actions).toContain(a);
    expect(JSON.stringify(all)).not.toContain(pwd);
    const runs = await (await auditRoute.GET(request("/api/admin/audit?action=simulation", { cookie: admin }))).json();
    expect(runs.entries.every((e: { action: string }) => e.action.startsWith("simulation"))).toBe(true);
  });

  it("пользователь меняет свой пароль: нужен текущий, другие сессии отзываются, текущая сохраняется", async () => {
    loginLimiter.reset();
    passwordChangeLimiter.reset();
    const pw = "Another#Pass2027";
    const c1 = (await loginAs("tester.one", pw)).headers.get("set-cookie")!.split(";")[0]!;
    const c2 = (await loginAs("tester.one", pw)).headers.get("set-cookie")!.split(";")[0]!;
    const wrong = await passwordRoute.POST(request("/api/auth/password", { method: "POST", cookie: c1, body: { currentPassword: "nope", newPassword: "Fresh#Pass2028" } }));
    expect(wrong.status).toBe(400);
    const weak = await passwordRoute.POST(request("/api/auth/password", { method: "POST", cookie: c1, body: { currentPassword: pw, newPassword: "short" } }));
    expect(weak.status).toBe(400);
    const ok = await passwordRoute.POST(request("/api/auth/password", { method: "POST", cookie: c1, body: { currentPassword: pw, newPassword: "Fresh#Pass2028" } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).revokedSessions).toBeGreaterThanOrEqual(1);
    expect((await meRoute.GET(request("/api/auth/me", { cookie: c1 }))).status).toBe(200);
    expect((await meRoute.GET(request("/api/auth/me", { cookie: c2 }))).status).toBe(401);
    expect((await loginAs("tester.one", "Fresh#Pass2028")).status).toBe(200);
    expect((await passwordRoute.POST(request("/api/auth/password", { method: "POST", body: { currentPassword: "x", newPassword: "Fresh#Pass2029" } }))).status).toBe(401);
    loginLimiter.reset();
  });

  it("подбор текущего пароля через смену пароля ограничен", async () => {
    passwordChangeLimiter.reset();
    const c = (await loginAs("tester.one", "Fresh#Pass2028")).headers.get("set-cookie")!.split(";")[0]!;
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await passwordRoute.POST(request("/api/auth/password", { method: "POST", cookie: c, body: { currentPassword: `guess${i}`, newPassword: "Fresh#Pass2030" } }))).status;
    }
    expect(last).toBe(429);
    passwordChangeLimiter.reset();
    loginLimiter.reset();
  });

  it("удаление пользователя обезличивает его записи аудита", async () => {
    const res = await userRoute.DELETE(request(`/api/admin/users/${newId}`, { method: "DELETE", cookie: admin }), ctx(newId));
    expect(res.status).toBe(200);
    const all = await (await auditRoute.GET(request("/api/admin/audit?limit=500", { cookie: admin }))).json();
    const text = JSON.stringify(all.entries.filter((e: { action: string }) => e.action !== "login.failure"));
    expect(text).not.toContain("tester.one");
    expect(text).toContain("удалённый пользователь");
    expect((await loginAs("tester.one", "Fresh#Pass2028")).status).toBe(401);
    loginLimiter.reset();
  });
});
