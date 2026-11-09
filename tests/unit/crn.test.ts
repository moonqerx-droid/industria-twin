import { describe, expect, it } from "vitest";
import { runSimulation, streamSeed } from "@/domain/simulation/engine";
import { runReplications } from "@/domain/simulation/replications";
import { differenceOfMeans, pairedDifference, summarize } from "@/domain/simulation/statistics";
import { compareMetric } from "@/domain/analysis/comparison";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";
import { engineSupportsCrn, ENGINE_VERSION } from "@/domain/simulation/types";

const withCapacity = (stationId: keyof typeof BASELINE_PARAMETERS.stations, capacity: number) => ({
  ...BASELINE_PARAMETERS,
  stations: { ...BASELINE_PARAMETERS.stations, [stationId]: { ...BASELINE_PARAMETERS.stations[stationId], capacity } },
});

describe("Общие случайные числа (CRN)", () => {
  it("потоки различаются по адресу и детерминированы", () => {
    expect(streamSeed(1, 2, 3, 4, 5)).toBe(streamSeed(1, 2, 3, 4, 5));
    const seeds = new Set([streamSeed(1, 2, 3, 0, 0), streamSeed(1, 2, 3, 1, 0), streamSeed(1, 2, 4, 0, 0), streamSeed(1, 3, 3, 0, 0), streamSeed(2, 2, 3, 0, 0)]);
    expect(seeds.size).toBe(5);
  });

  it("изменение мощности участка не меняет поток поступлений", () => {
    const a = runSimulation({ ...buildSimulationConfig(BASELINE_PARAMETERS), recordEvents: true });
    const b = runSimulation({ ...buildSimulationConfig(withCapacity("st-assembly", 3)), recordEvents: true });
    const arrivals = (r: typeof a) => r.events.filter((e) => e.type === "ARRIVAL").map((e) => e.t);
    expect(arrivals(b)).toEqual(arrivals(a));
  });

  it("одно и то же изделие получает одинаковую длительность операции при другой мощности", () => {
    const a = runSimulation({ ...buildSimulationConfig(BASELINE_PARAMETERS), recordEvents: true });
    const b = runSimulation({ ...buildSimulationConfig(withCapacity("st-assembly", 3)), recordEvents: true });
    // Длительность операции на первом участке маршрута (A1) не зависит от мощности сборки.
    const durations = (r: typeof a) => {
      const start = new Map<number, number>();
      const out = new Map<number, number>();
      for (const e of r.events) {
        if (e.stationId !== "st-receiving") continue;
        if (e.type === "PROCESS_START") start.set(e.unitId, e.t);
        if (e.type === "PROCESS_FINISH") out.set(e.unitId, e.t - start.get(e.unitId)!);
      }
      return out;
    };
    const da = durations(a);
    const db = durations(b);
    let compared = 0;
    for (const [unit, d] of da) {
      if (db.has(unit)) {
        expect(db.get(unit)!).toBeCloseTo(d, 9);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(30);
  });

  it("исход контроля качества изделия одинаков в разных сценариях", () => {
    const outcomes = (params: typeof BASELINE_PARAMETERS) => {
      const r = runSimulation({ ...buildSimulationConfig(params), recordEvents: true });
      const m = new Map<number, boolean>();
      for (const e of r.events) if (e.type === "QUALITY_CHECK" && !m.has(e.unitId)) m.set(e.unitId, e.defect === true);
      return m;
    };
    const a = outcomes(BASELINE_PARAMETERS);
    const b = outcomes(withCapacity("st-testing", 2));
    let compared = 0;
    for (const [unit, d] of a) {
      if (!b.has(unit)) continue;
      expect(b.get(unit)).toBe(d);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it("парная оценка разности уже интервала Уэлча для добавления сборочного поста", () => {
    const base = runReplications(buildSimulationConfig(BASELINE_PARAMETERS), 20);
    const alt = runReplications(buildSimulationConfig(withCapacity("st-assembly", 3)), 20);
    const key = "cycleTimeAvgMin" as const;
    const p = pairedDifference(base.replications.map((r) => r.aggregate[key]), alt.replications.map((r) => r.aggregate[key]))!;
    const w = differenceOfMeans(base.aggregate[key], alt.aggregate[key])!;
    expect(p.ci95!).toBeLessThan(w.ci95! / 2);
    expect(p.diff).toBeLessThan(0);
    expect(p.distinguishable).toBe(true);
  });
});

describe("Парное сравнение", () => {
  it("считает среднее и ДИ по разностям пар, пропуская неопределённые значения", () => {
    const p = pairedDifference([10, 20, 30, null], [11, 22, 33, 5])!;
    expect(p.n).toBe(3);
    expect(p.diff).toBeCloseTo(2);
    expect(p.ci95).toBeCloseTo(summarize([1, 2, 3]).ci95!, 9);
  });

  it("возвращает null при менее чем двух парах", () => {
    expect(pairedDifference([1], [2])).toBeNull();
  });

  it("compareMetric помечает метод и выносит вердикт по парному интервалу", () => {
    const before = [100, 120, 90, 110, 105];
    const after = before.map((x) => x - 5 + (x % 2) * 0.1);
    const r = compareMetric("cycle", "lower", summarize(before), summarize(after), { before, after });
    expect(r.method).toBe("paired");
    expect(r.verdict).toBe("better");
    const w = compareMetric("cycle", "lower", summarize(before), summarize(after));
    expect(w.method).toBe("welch");
    expect(w.verdict).toBe("unchanged");
  });

  it("версия движка поддерживает CRN", () => {
    expect(engineSupportsCrn(ENGINE_VERSION)).toBe(true);
    expect(engineSupportsCrn("1.0.0")).toBe(false);
  });
});
