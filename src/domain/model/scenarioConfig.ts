import type { SimulationConfig } from "../simulation/types";
import {
  MAIN_ROUTE,
  QUALITY_STATION,
  REWORK_STATION,
  STATIONS,
  type ScenarioParameters,
} from "./demoData";

/** Преобразует параметры сценария в конфигурацию движка (чистая функция, без побочных эффектов). */
export function buildSimulationConfig(params: ScenarioParameters, seedOverride?: number): SimulationConfig {
  return {
    horizonMin: params.horizonMin,
    arrivalStopMin: Math.min(params.releaseWindowMin, params.horizonMin),
    arrival: { kind: params.arrivalKind, ratePerHour: params.arrivalRatePerHour },
    route: [...MAIN_ROUTE],
    stations: STATIONS.map((s) => {
      const p = params.stations[s.id];
      return {
        stationId: s.id,
        name: s.name,
        capacity: p.capacity,
        processTime: p.processTime,
        hourlyCostRub: p.hourlyCostRub,
        consumablesPerOperationRub: p.consumablesPerOperationRub,
        failure: p.failure ?? null,
      };
    }),
    quality: {
      stationId: QUALITY_STATION,
      reworkStationId: REWORK_STATION,
      defectProbability: params.defectProbability,
      retestDefectProbability: params.retestDefectProbability,
      maxReworkCycles: params.maxReworkCycles,
    },
    materialCostPerUnitRub: params.materialCostPerUnitRub,
    fixedCostRub: params.fixedCostRub,
    seed: seedOverride ?? params.seed,
    snapshotIntervalMin: 5,
  };
}
