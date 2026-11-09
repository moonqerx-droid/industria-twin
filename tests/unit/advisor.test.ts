import { describe, expect, it } from "vitest";
import { adviseResources } from "@/domain/analysis/advisor";
import { BASELINE_PARAMETERS } from "@/domain/model/demoData";

describe("Советник по ресурсам", () => {
  const r = adviseResources(BASELINE_PARAMETERS);

  it("проверяет +1 ресурс на каждом участке и комбинированный вариант", () => {
    expect(r.candidates.length).toBe(7);
    expect(new Set(r.candidates.map((c) => c.id)).size).toBe(7);
    for (const c of r.candidates) {
      for (const id of c.stationIds) expect(c.parameters.stations[id].capacity).toBe(BASELINE_PARAMETERS.stations[id].capacity + 1);
    }
  });

  it("для базового сценария находит узкое место с учётом отказов и рекомендует вариант с различимым эффектом", () => {
    expect(r.bottleneckBefore?.stationId).toBe("st-machining");
    expect(r.best).not.toBeNull();
    expect(r.best!.verdict).toBe("recommended");
    expect(r.best!.deltas.cycleTimeAvgMin.diff).toBeLessThan(0);
    expect(r.best!.deltas.cycleTimeAvgMin.distinguishable).toBe(true);
  });

  it("ресурс на ненагруженном участке не рекомендуется", () => {
    const rework = r.candidates.find((c) => c.id === "plus-st-rework")!;
    expect(["no-effect", "costlier"]).toContain(rework.verdict);
    expect(rework.addedResourceCostRub).toBeCloseTo((1700 * 960) / 60);
  });

  it("детерминирован", () => {
    const again = adviseResources(BASELINE_PARAMETERS);
    expect(again.candidates.map((c) => [c.id, c.deltas.costPerUnitRub.diff])).toEqual(
      r.candidates.map((c) => [c.id, c.deltas.costPerUnitRub.diff]),
    );
  });
});
