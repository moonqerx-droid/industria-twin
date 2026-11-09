import { describe, expect, it } from "vitest";
import { BASELINE_PARAMETERS, DEMO_SCENARIOS, MAIN_ROUTE, POINTS_OF_INTEREST, PROCESS_EDGES, PROCESS_NODES, STATION_IDS, TOURS } from "@/domain/model/demoData";
import { estimateLoads } from "@/domain/model/loadEstimate";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";
import { validateConfig } from "@/domain/simulation/engine";
import { diffParameters } from "@/server/services/comparisonService";
import { STATION_LAYOUT, CAMERA_PRESETS } from "@/components/factory3d/sceneContract";

describe("Демонстрационная модель: согласованность идентификаторов", () => {
  it("каждый участок имеет узел процесса, точку интереса, раскладку 3D и камеру", () => {
    for (const id of STATION_IDS) {
      expect(PROCESS_NODES.some((n) => n.stationId === id)).toBe(true);
      expect(POINTS_OF_INTEREST.some((p) => p.stationId === id)).toBe(true);
      expect(STATION_LAYOUT[id].stationId).toBe(id);
    }
    for (const p of POINTS_OF_INTEREST) expect(CAMERA_PRESETS[p.cameraPresetId]).toBeDefined();
    const nodeIds = new Set(PROCESS_NODES.map((n) => n.id));
    for (const e of PROCESS_EDGES) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    }
    for (const s of TOURS[0]!.stops) expect(POINTS_OF_INTEREST.some((p) => p.id === s.poiId)).toBe(true);
  });

  it("все демонстрационные сценарии дают корректную конфигурацию движка", () => {
    for (const sc of DEMO_SCENARIOS) expect(validateConfig(buildSimulationConfig(sc.parameters))).toEqual([]);
    expect(buildSimulationConfig(BASELINE_PARAMETERS).route).toEqual(MAIN_ROUTE);
  });
});

describe("Аналитическая оценка загрузки", () => {
  it("ρ = λ·v·E[S]/(c·A); испытания учитывают повторные посещения и готовность стенда", () => {
    const rho = estimateLoads(BASELINE_PARAMETERS);
    const lambda = BASELINE_PARAMETERS.arrivalRatePerHour / 60;
    expect(rho["st-assembly"]).toBeCloseTo((lambda * ((17 + 21 + 29) / 3)) / 2, 6);
    const p = BASELINE_PARAMETERS.defectProbability;
    const q = BASELINE_PARAMETERS.retestDefectProbability;
    // Стенд с отказами: MTBF 900, MTTR 20 → готовность A = 900 / 920.
    expect(rho["st-testing"]).toBeCloseTo((lambda * (1 + p + p * q) * ((7 + 9 + 12) / 3)) / (900 / 920), 6);
    expect(rho["st-rework"]).toBeCloseTo(lambda * (p + p * q) * ((10 + 15 + 24) / 3), 6);
  });
  it("добавление ресурса снижает оценку загрузки обратно пропорционально", () => {
    const more = { ...BASELINE_PARAMETERS, stations: { ...BASELINE_PARAMETERS.stations, "st-assembly": { ...BASELINE_PARAMETERS.stations["st-assembly"], capacity: 4 } } };
    expect(estimateLoads(more)["st-assembly"]).toBeCloseTo(estimateLoads(BASELINE_PARAMETERS)["st-assembly"] / 2, 9);
  });
});

describe("Сравнение параметров сценариев", () => {
  it("находит именно изменённые параметры", () => {
    const alt = DEMO_SCENARIOS.find((s) => s.id === "sc-assembly-plus")!.parameters;
    const changes = diffParameters(BASELINE_PARAMETERS, alt);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "stations.st-assembly.capacity", before: "2", after: "3" });
    expect(diffParameters(BASELINE_PARAMETERS, BASELINE_PARAMETERS)).toEqual([]);
  });
});
