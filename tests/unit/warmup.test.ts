import { describe, expect, it } from "vitest";
import { runSimulation, SimulationConfigError } from "@/domain/simulation/engine";
import { runReplications } from "@/domain/simulation/replications";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";

const base = () => ({ ...buildSimulationConfig(BASELINE_PARAMETERS), recordEvents: true });

describe("Период разгона", () => {
  it("нулевой разгон даёт тот же результат, что и без параметра", () => {
    const a = runSimulation(base());
    const b = runSimulation({ ...base(), warmupMin: 0 });
    expect(b.aggregate).toEqual(a.aggregate);
    expect(b.stations).toEqual(a.stations);
  });

  it("сохраняет баланс изделий в окне наблюдения и ограничивает загрузку", () => {
    const r = runSimulation({ ...base(), warmupMin: 240 });
    const a = r.aggregate;
    expect(r.warmupMin).toBe(240);
    expect(a.completed + a.scrapped + a.wipEnd).toBe(a.released);
    expect(a.released).toBeLessThan(r.units.length);
    for (const s of r.stations) {
      expect(s.utilization).toBeGreaterThanOrEqual(0);
      expect(s.utilization).toBeLessThanOrEqual(1);
      expect(s.busyMin).toBeLessThanOrEqual(s.capacity * (r.horizonMin - 240) + 1e-6);
    }
    // Журнал и кадры для 3D охватывают весь горизонт.
    expect(r.snapshots[0]!.t).toBe(0);
  });

  it("исключение разгона с пустой системы повышает среднюю загрузку и НЗП", () => {
    const cold = runReplications(base(), 10);
    const warm = runReplications({ ...base(), warmupMin: 240 }, 10);
    expect(warm.aggregate.utilizationAvg.mean!).toBeGreaterThan(cold.aggregate.utilizationAvg.mean!);
    expect(warm.aggregate.avgWip.mean!).toBeGreaterThan(cold.aggregate.avgWip.mean!);
  });

  it("постоянные расходы распределяются пропорционально окну наблюдения", () => {
    const r = runSimulation({ ...base(), warmupMin: 480 });
    expect(r.aggregate.fixedCostRub).toBeCloseTo((BASELINE_PARAMETERS.fixedCostRub * 480) / 960, 6);
  });

  it("отклоняет разгон не меньше горизонта", () => {
    expect(() => runSimulation({ ...base(), warmupMin: 960 })).toThrow(SimulationConfigError);
    expect(() => runSimulation({ ...base(), warmupMin: -1 })).toThrow(SimulationConfigError);
  });
});
