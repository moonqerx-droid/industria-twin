import { describe, expect, it } from "vitest";
import { runSimulation, SimulationConfigError } from "@/domain/simulation/engine";
import { runReplications } from "@/domain/simulation/replications";
import type { SimulationConfig, SimulationResult, StationConfig } from "@/domain/simulation/types";
import { BASELINE_PARAMETERS, DEMO_SCENARIOS } from "@/domain/model/demoData";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";

const station = (id: string, patch: Partial<StationConfig> = {}): StationConfig => ({
  stationId: id,
  name: id,
  capacity: 1,
  processTime: { kind: "fixed", value: 10 },
  hourlyCostRub: 600,
  consumablesPerOperationRub: 10,
  ...patch,
});

const singleStation = (patch: Partial<SimulationConfig> = {}, st: Partial<StationConfig> = {}): SimulationConfig => ({
  horizonMin: 120,
  arrival: { kind: "deterministic", ratePerHour: 6 },
  route: ["s1"],
  stations: [station("s1", st)],
  quality: null,
  materialCostPerUnitRub: 100,
  fixedCostRub: 1000,
  seed: 42,
  recordEvents: true,
  ...patch,
});

const baseline = (): SimulationConfig => ({ ...buildSimulationConfig(BASELINE_PARAMETERS), recordEvents: true });

function checkInvariants(r: SimulationResult, cfg: SimulationConfig) {
  const a = r.aggregate;
  // Сохранение изделий: запущенные = завершённые + списанные + НЗП.
  expect(a.completed + a.scrapped + a.wipEnd).toBe(a.released);
  expect(r.units.filter((u) => u.outcome === "WIP").length).toBe(a.wipEnd);
  // НЗП на конец = изделия в очередях и в обработке.
  const inStations = r.stations.reduce((s, x) => s + x.queueAtEnd + x.inProcessAtEnd, 0);
  expect(inStations).toBe(a.wipEnd);
  for (const s of r.stations) {
    expect(s.utilization).toBeGreaterThanOrEqual(0);
    expect(s.utilization).toBeLessThanOrEqual(1);
    // Загрузка, рассчитанная по интервалам занятости, не превышает вместимость.
    expect(s.busyMin).toBeLessThanOrEqual(s.capacity * cfg.horizonMin + 1e-6);
    expect(s.peakBusy).toBeLessThanOrEqual(s.capacity);
    expect(s.avgWaitMin).toBeGreaterThanOrEqual(0);
    expect(s.operationsCompleted).toBeLessThanOrEqual(s.operationsStarted);
  }
  for (const u of r.units) {
    expect(u.waitingMin).toBeGreaterThanOrEqual(0);
    expect(u.processingMin).toBeGreaterThanOrEqual(0);
    if (u.exitMin !== null) expect(u.exitMin).toBeGreaterThanOrEqual(u.arrivalMin);
  }
  // События упорядочены по времени и не выходят за горизонт.
  for (let i = 1; i < r.events.length; i += 1) {
    expect(r.events[i]!.t).toBeGreaterThanOrEqual(r.events[i - 1]!.t);
  }
  for (const e of r.events) expect(e.t).toBeLessThanOrEqual(cfg.horizonMin);
  expect(a.totalCostRub).toBeGreaterThanOrEqual(0);
  for (const snap of r.snapshots) {
    for (const [id, [q, busy]] of Object.entries(snap.stations)) {
      const cap = cfg.stations.find((s) => s.stationId === id)!.capacity;
      expect(busy).toBeLessThanOrEqual(cap);
      expect(q).toBeGreaterThanOrEqual(0);
    }
  }
}

describe("Симуляционный движок: воспроизводимость", () => {
  it("один и тот же seed даёт идентичный результат", () => {
    const a = runSimulation(baseline());
    const b = runSimulation(baseline());
    expect(b.aggregate).toEqual(a.aggregate);
    expect(b.events).toEqual(a.events);
  });

  it("разные seed дают разные траектории", () => {
    const a = runSimulation(baseline());
    const b = runSimulation({ ...baseline(), seed: 777 });
    expect(b.events).not.toEqual(a.events);
  });

  it("репликации воспроизводимы и первая совпадает с одиночным прогоном", () => {
    const r1 = runReplications(baseline(), 5);
    const r2 = runReplications(baseline(), 5);
    expect(r1.aggregate).toEqual(r2.aggregate);
    expect(r1.replications[0]!.aggregate).toEqual(runSimulation(baseline()).aggregate);
    expect(new Set(r1.replications.map((r) => r.seed)).size).toBe(5);
  });
});

describe("Симуляционный движок: граничные случаи", () => {
  it("нулевой входящий поток → нулевой выпуск, стоимость единицы не определена", () => {
    const cfg = singleStation({ arrival: { kind: "poisson", ratePerHour: 0 } });
    const r = runSimulation(cfg);
    expect(r.aggregate.released).toBe(0);
    expect(r.aggregate.completed).toBe(0);
    expect(r.aggregate.costPerUnitRub).toBeNull();
    expect(r.aggregate.cycleTimeAvgMin).toBeNull();
    expect(r.stations[0]!.utilization).toBe(0);
    // Ресурсы оплачиваются за доступность даже без загрузки: 1 × 2 ч × 600 ₽.
    expect(r.aggregate.resourceCostRub).toBeCloseTo(1200);
    expect(r.aggregate.totalCostRub).toBeCloseTo(1200 + 1000);
    checkInvariants(r, cfg);
  });

  it("нулевой выпуск при ненулевом поступлении: операция длиннее горизонта", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 500 } });
    const r = runSimulation(cfg);
    expect(r.aggregate.released).toBeGreaterThan(0);
    expect(r.aggregate.completed).toBe(0);
    expect(r.aggregate.costPerUnitRub).toBeNull();
    expect(r.stations[0]!.utilization).toBeCloseTo(1, 6);
    checkInvariants(r, cfg);
  });

  it("корректно завершает горизонт: незавершённые изделия учитываются как НЗП", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 15 } });
    const r = runSimulation(cfg);
    // Поступления в 0,10,...,110 (12 шт.), обслуживание по 15 мин: к 120 мин завершено 8.
    expect(r.aggregate.released).toBe(12);
    expect(r.aggregate.completed).toBe(8);
    expect(r.aggregate.wipEnd).toBe(4);
    expect(r.events.at(-1)!.type).toBe("HORIZON_END");
    checkInvariants(r, cfg);
  });

  it("отклоняет некорректную конфигурацию", () => {
    expect(() => runSimulation(singleStation({ horizonMin: -5 }))).toThrow(SimulationConfigError);
    expect(() => runSimulation(singleStation({}, { capacity: 0 }))).toThrow(SimulationConfigError);
    expect(() =>
      runSimulation(singleStation({}, { processTime: { kind: "triangular", min: 5, mode: 2, max: 9 } })),
    ).toThrow(SimulationConfigError);
    expect(() => runSimulation(singleStation({ route: ["unknown"] }))).toThrow(SimulationConfigError);
    expect(() => runSimulation(singleStation({}, { hourlyCostRub: -1 }))).toThrow(SimulationConfigError);
  });
});

describe("Симуляционный движок: очереди и ресурсы", () => {
  it("без перегрузки очередь не образуется (детерминированный поток, обслуживание короче интервала)", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 5 } });
    const r = runSimulation(cfg);
    expect(r.stations[0]!.maxQueueLength).toBeLessThanOrEqual(1);
    expect(r.stations[0]!.avgWaitMin).toBe(0);
    // Загрузка = 12 операций × 5 мин / 120 мин.
    expect(r.stations[0]!.utilization).toBeCloseTo((12 * 5) / 120, 9);
    checkInvariants(r, cfg);
  });

  it("образование очереди при обслуживании дольше интервала поступления", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 20 } });
    const r = runSimulation(cfg);
    const s = r.stations[0]!;
    expect(s.maxQueueLength).toBeGreaterThan(3);
    expect(s.avgWaitMin).toBeGreaterThan(0);
    expect(s.queueAtEnd).toBeGreaterThan(0);
    checkInvariants(r, cfg);
  });

  it("параллельные ресурсы: при вместимости 2 очередь исчезает", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 20 }, capacity: 2 });
    const r = runSimulation(cfg);
    const s = r.stations[0]!;
    expect(s.peakBusy).toBe(2);
    expect(s.avgWaitMin).toBe(0);
    checkInvariants(r, cfg);
  });

  it("перегрузка станции: загрузка → 100%, очередь растёт, НЗП накапливается", () => {
    const cfg = singleStation(
      { horizonMin: 600, arrival: { kind: "poisson", ratePerHour: 12 } },
      { processTime: { kind: "exponential", mean: 10 } },
    );
    const r = runSimulation(cfg);
    const s = r.stations[0]!;
    expect(s.utilization).toBeGreaterThan(0.95);
    expect(s.queueAtEnd).toBeGreaterThan(5);
    expect(r.aggregate.wipEnd).toBeGreaterThan(5);
    checkInvariants(r, cfg);
  });

  it("ресурс никогда не обслуживает больше заданий, чем вместимость (по журналу событий)", () => {
    const cfg = baseline();
    const r = runSimulation(cfg);
    const busy = new Map<string, number>();
    for (const e of r.events) {
      if (!e.stationId) continue;
      if (e.type === "PROCESS_START") busy.set(e.stationId, (busy.get(e.stationId) ?? 0) + 1);
      if (e.type === "PROCESS_FINISH") busy.set(e.stationId, (busy.get(e.stationId) ?? 0) - 1);
      const cap = cfg.stations.find((s) => s.stationId === e.stationId)!.capacity;
      expect(busy.get(e.stationId) ?? 0).toBeLessThanOrEqual(cap);
      expect(busy.get(e.stationId) ?? 0).toBeGreaterThanOrEqual(0);
    }
    checkInvariants(r, cfg);
  });

  it("время цикла ≥ времени обработки (не путаем обработку и полный цикл)", () => {
    const r = runSimulation(baseline());
    const a = r.aggregate;
    expect(a.cycleTimeAvgMin!).toBeGreaterThanOrEqual(a.processingTimeAvgMin!);
    expect(a.cycleTimeAvgMin!).toBeCloseTo(a.processingTimeAvgMin! + a.waitingTimeAvgMin!, 6);
  });
});

describe("Симуляционный движок: качество и доработка", () => {
  const qcConfig = (p: number, retest: number, maxCycles: number): SimulationConfig => ({
    horizonMin: 2000,
    arrival: { kind: "deterministic", ratePerHour: 3 },
    route: ["test", "pack"],
    stations: [
      station("test", { processTime: { kind: "fixed", value: 5 } }),
      station("pack", { processTime: { kind: "fixed", value: 2 } }),
      station("fix", { processTime: { kind: "fixed", value: 4 } }),
    ],
    quality: { stationId: "test", reworkStationId: "fix", defectProbability: p, retestDefectProbability: retest, maxReworkCycles: maxCycles },
    materialCostPerUnitRub: 0,
    fixedCostRub: 0,
    seed: 9,
    recordEvents: true,
  });

  it("вероятность брака 0 — доработок нет", () => {
    const r = runSimulation(qcConfig(0, 0, 2));
    expect(r.aggregate.reworkCount).toBe(0);
    expect(r.aggregate.defectRate).toBe(0);
  });

  it("брак 100% без доработок: все проверенные изделия списываются", () => {
    const cfg = qcConfig(1, 1, 0);
    const r = runSimulation(cfg);
    expect(r.aggregate.completed).toBe(0);
    expect(r.aggregate.scrapped).toBeGreaterThan(0);
    expect(r.aggregate.reworkCount).toBe(0);
    checkInvariants(r, cfg);
  });

  it("брак 100%: число доработок ограничено максимумом, бесконечного цикла нет", () => {
    const cfg = qcConfig(1, 1, 3);
    const r = runSimulation(cfg);
    for (const u of r.units) expect(u.reworkCycles).toBeLessThanOrEqual(3);
    // Каждое списанное изделие прошло ровно 3 доработки и 4 проверки.
    const scrapped = r.units.filter((u) => u.outcome === "SCRAPPED");
    expect(scrapped.length).toBeGreaterThan(0);
    for (const u of scrapped) expect(u.reworkCycles).toBe(3);
    expect(r.aggregate.completed).toBe(0);
    checkInvariants(r, cfg);
  });

  it("доля брака близка к заданной вероятности на длинном горизонте", () => {
    const cfg = { ...qcConfig(0.2, 0.2, 5), horizonMin: 7 * 24 * 60, arrival: { kind: "deterministic" as const, ratePerHour: 6 } };
    const r = runSimulation(cfg);
    expect(r.aggregate.defectRate!).toBeGreaterThan(0.17);
    expect(r.aggregate.defectRate!).toBeLessThan(0.23);
    checkInvariants(r, cfg);
  });

  it("журнал содержит события ARRIVAL, QUEUE_ENTER, PROCESS_START/FINISH, QUALITY_CHECK, REWORK, DEPARTURE", () => {
    const r = runSimulation(qcConfig(0.3, 0.1, 2));
    const types = new Set(r.events.map((e) => e.type));
    for (const t of ["ARRIVAL", "QUEUE_ENTER", "PROCESS_START", "PROCESS_FINISH", "QUALITY_CHECK", "REWORK", "DEPARTURE", "HORIZON_END"]) {
      expect(types.has(t as never)).toBe(true);
    }
  });
});

describe("Симуляционный движок: стоимость", () => {
  it("стоимость рассчитывается по документированной модели", () => {
    const cfg = singleStation({}, { processTime: { kind: "fixed", value: 5 } });
    const r = runSimulation(cfg);
    const a = r.aggregate;
    // Ресурс: 1 ед. × 2 ч × 600 ₽ = 1200; расходники: 12 операций × 10; материалы: 12 × 100; постоянные: 1000.
    expect(a.resourceCostRub).toBeCloseTo(1200);
    expect(a.consumablesCostRub).toBeCloseTo(120);
    expect(a.materialCostRub).toBeCloseTo(1200);
    expect(a.totalCostRub).toBeCloseTo(1200 + 120 + 1200 + 1000);
    expect(a.costPerUnitRub).toBeCloseTo(a.totalCostRub / a.completed);
    // Простой: 120 − 60 мин занятости = 60 мин → 600 ₽.
    expect(a.idleCostRub).toBeCloseTo(600);
  });

  it("все демонстрационные сценарии выполняются и сохраняют инварианты", () => {
    for (const sc of DEMO_SCENARIOS) {
      const cfg = { ...buildSimulationConfig(sc.parameters), recordEvents: true };
      const r = runSimulation(cfg);
      checkInvariants(r, cfg);
      expect(r.aggregate.completed).toBeGreaterThan(0);
    }
  });
});
