import { describe, expect, it } from "vitest";
import { capacityCurve, CAPACITY_FACTORS } from "@/domain/analysis/capacity";
import { estimateLoads } from "@/domain/model/loadEstimate";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";

describe("Кривая пропускной способности", () => {
  const c = capacityCurve(BASELINE_PARAMETERS);

  it("содержит точку на каждый множитель спроса, включая текущий", () => {
    expect(c.points.map((p) => p.factor)).toEqual([...CAPACITY_FACTORS]);
    expect(c.points.find((p) => p.factor === 1)!.ratePerHour).toBeCloseTo(BASELINE_PARAMETERS.arrivalRatePerHour, 6);
  });

  it("с ростом спроса цикл и НЗП растут монотонно (общие случайные числа)", () => {
    for (let i = 1; i < c.points.length; i += 1) {
      expect(c.points[i]!.cycleTimeAvgMin!).toBeGreaterThan(c.points[i - 1]!.cycleTimeAvgMin!);
      expect(c.points[i]!.wipEnd!).toBeGreaterThanOrEqual(c.points[i - 1]!.wipEnd!);
    }
  });

  it("предел мощности согласован с аналитической оценкой ρ", () => {
    const rho = estimateLoads({ ...BASELINE_PARAMETERS, arrivalRatePerHour: c.saturationRatePerHour! });
    expect(Math.max(...Object.values(rho))).toBeCloseTo(1, 6);
    expect(c.limitingStationId).toBe("st-assembly");
    expect(c.headroom!).toBeCloseTo(c.saturationRatePerHour! / BASELINE_PARAMETERS.arrivalRatePerHour - 1, 9);
  });

  it("добавление сборочного поста увеличивает предел мощности", () => {
    const more = capacityCurve({ ...BASELINE_PARAMETERS, stations: { ...BASELINE_PARAMETERS.stations, "st-assembly": { ...BASELINE_PARAMETERS.stations["st-assembly"], capacity: 3 } } }, { factors: [1] });
    expect(more.saturationRatePerHour!).toBeGreaterThan(c.saturationRatePerHour!);
    expect(more.limitingStationId).not.toBe("st-assembly");
  });
});
