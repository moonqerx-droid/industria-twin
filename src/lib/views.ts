import type { BottleneckFinding, StationStatus } from "@/domain/analysis/bottleneck";
import type { StationMetricKey } from "@/domain/model/metrics";
import type { SummaryStats } from "@/domain/simulation/statistics";
import type { ProductionModelDto } from "@/server/services/modelService";
import type { RunDetailDto } from "@/server/services/simulationService";

/** Представление участка для UI: справочные данные модели + метрики выбранного прогона (по одному stationId). */
export interface StationView {
  stationId: string;
  code: string;
  name: string;
  shortName: string;
  zone: string;
  description: string;
  resourceName: string;
  unitName: string;
  poiId: string | null;
  status: StationStatus | null;
  metrics: Partial<Record<StationMetricKey, SummaryStats>>;
  finding: BottleneckFinding | null;
}

export function buildStationViews(model: ProductionModelDto, run: RunDetailDto | null): StationView[] {
  return model.stations.map((s) => {
    const rs = run?.stations.find((x) => x.stationId === s.id);
    return {
      stationId: s.id,
      code: s.code,
      name: s.name,
      shortName: s.shortName,
      zone: s.zone,
      description: s.description,
      resourceName: s.resources[0]?.name ?? "—",
      unitName: s.resources[0]?.unitName ?? "ед.",
      poiId: s.poiId,
      status: rs?.status ?? null,
      metrics: rs?.metrics ?? {},
      finding: run?.ranking.find((r) => r.stationId === s.id) ?? null,
    };
  });
}
