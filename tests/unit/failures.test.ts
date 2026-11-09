import { describe, expect, it } from "vitest";
import { runSimulation, SimulationConfigError } from "@/domain/simulation/engine";
import type { SimulationConfig } from "@/domain/simulation/types";
import { classifyStation } from "@/domain/analysis/bottleneck";

const cfg = (patch: Partial<SimulationConfig["stations"][number]> = {}, horizonMin = 6000): SimulationConfig => ({
  horizonMin,
  arrival: { kind: "deterministic", ratePerHour: 4 },
  route: ["s1"],
  stations: [{ stationId: "s1", name: "s1", capacity: 2, processTime: { kind: "fixed", value: 20 }, hourlyCostRub: 600, consumablesPerOperationRub: 0, ...patch }],
  quality: null,
  materialCostPerUnitRub: 0,
  fixedCostRub: 0,
  seed: 7,
  recordEvents: true,
});

describe("Отказы оборудования", () => {
  it("без отказов доступность 100% и нет событий BREAKDOWN", () => {
    const r = runSimulation(cfg());
    expect(r.stations[0]!.availability).toBe(1);
    expect(r.stations[0]!.failures).toBe(0);
    expect(r.events.some((e) => e.type === "BREAKDOWN")).toBe(false);
  });

  it("доступность близка к MTBF/(MTBF+MTTR) на длинном горизонте", () => {
    // Средняя по 10 недельным прогонам: теоретически 300/(300+30) ≈ 0,909.
    let avail = 0;
    let failures = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const r = runSimulation({ ...cfg({ failure: { mtbfMin: 300, mttrMin: 30 } }, 10_080), seed });
      const s = r.stations[0]!;
      expect(s.utilization + (1 - s.availability)).toBeLessThanOrEqual(1 + 1e-9);
      avail += s.availability / 10;
      failures += s.failures;
    }
    // Неупреждающая модель: ремонт начинается после текущей операции — оценка с допуском.
    expect(avail).toBeGreaterThan(0.88);
    expect(avail).toBeLessThan(0.94);
    expect(failures).toBeGreaterThan(500);
  });

  it("в каждый момент занятые + в ремонте не превышают вместимость, отказы и ремонты сбалансированы", () => {
    const r = runSimulation(cfg({ failure: { mtbfMin: 200, mttrMin: 60 } }));
    for (const snap of r.snapshots) {
      const [, busy, down] = snap.stations.s1!;
      expect(busy + down).toBeLessThanOrEqual(2);
    }
    const br = r.events.filter((e) => e.type === "BREAKDOWN").length;
    const rp = r.events.filter((e) => e.type === "REPAIR").length;
    expect(br).toBe(r.stations[0]!.failures);
    expect(br - rp).toBeGreaterThanOrEqual(0);
    expect(br - rp).toBeLessThanOrEqual(2);
  });

  it("отказы увеличивают средний цикл и снижают выпуск", () => {
    const a = runSimulation(cfg({ capacity: 1, processTime: { kind: "fixed", value: 13 } }));
    const b = runSimulation(cfg({ capacity: 1, processTime: { kind: "fixed", value: 13 }, failure: { mtbfMin: 120, mttrMin: 30 } }));
    expect(b.aggregate.cycleTimeAvgMin!).toBeGreaterThan(a.aggregate.cycleTimeAvgMin!);
    expect(b.aggregate.completed).toBeLessThanOrEqual(a.aggregate.completed);
    expect(b.aggregate.downtimeMin).toBeGreaterThan(0);
  });

  it("отклоняет некорректные MTBF/MTTR", () => {
    expect(() => runSimulation(cfg({ failure: { mtbfMin: 0, mttrMin: 5 } }))).toThrow(SimulationConfigError);
    expect(() => runSimulation(cfg({ failure: { mtbfMin: 100, mttrMin: 0 } }))).toThrow(SimulationConfigError);
  });

  it("потери доступности учитываются в статусе участка", () => {
    const base = { stationId: "x", name: "x", capacity: 1, utilization: 0.7, avgQueueLength: 0, avgWaitMin: 0, queueAtEnd: 0 };
    expect(classifyStation(base)).toBe("normal");
    expect(classifyStation({ ...base, downtimeShare: 0.1 })).toBe("high");
  });
});
