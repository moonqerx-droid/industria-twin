import { compareMetric, type MetricComparison } from "@/domain/analysis/comparison";
import type { BottleneckFinding } from "@/domain/analysis/bottleneck";
import { STATIONS, type ScenarioParameters, type StationId } from "@/domain/model/demoData";
import {
  AGGREGATE_METRICS,
  KEY_AGGREGATE_METRICS,
  KEY_STATION_METRICS,
  STATION_METRICS,
  type AggregateMetricKey,
  type StationMetricKey,
} from "@/domain/model/metrics";
import type { SummaryStats } from "@/domain/simulation/statistics";
import { DISTRIBUTION_LABELS, distributionMean } from "@/domain/simulation/distributions";
import { getRunDetail, type RunSummaryDto } from "./simulationService";

export interface ParameterChange {
  path: string;
  label: string;
  before: string;
  after: string;
}

export interface StationComparison {
  stationId: string;
  name: string;
  metrics: MetricComparison[];
}

export interface AlternativeComparison {
  run: RunSummaryDto;
  bottleneck: BottleneckFinding | null;
  parameterChanges: ParameterChange[];
  aggregate: MetricComparison[];
  stations: StationComparison[];
}

export interface ComparisonDto {
  baseline: RunSummaryDto & { bottleneck: BottleneckFinding | null };
  alternatives: AlternativeComparison[];
  /** Полные сводные статистики (для доверительных интервалов на графиках). */
  baselineAggregate: Record<AggregateMetricKey, SummaryStats>;
  alternativeAggregates: Array<Record<AggregateMetricKey, SummaryStats>>;
  method: string;
}

const fmt = (v: number, d = 2) => v.toLocaleString("ru-RU", { maximumFractionDigits: d });

/** Перечень отличий параметров двух сценариев (по снимкам конфигурации прогонов). */
export function diffParameters(a: ScenarioParameters, b: ScenarioParameters): ParameterChange[] {
  const out: ParameterChange[] = [];
  const scalar: Array<[keyof ScenarioParameters, string, (v: number) => string]> = [
    ["arrivalRatePerHour", "Интенсивность поступления, шт./ч", (v) => fmt(v)],
    ["horizonMin", "Горизонт, мин", (v) => fmt(v, 0)],
    ["releaseWindowMin", "Окно запуска заданий, мин", (v) => fmt(v, 0)],
    ["defectProbability", "Вероятность брака (первичный контроль)", (v) => `${fmt(v * 100, 1)}%`],
    ["retestDefectProbability", "Вероятность брака (повторный контроль)", (v) => `${fmt(v * 100, 1)}%`],
    ["maxReworkCycles", "Максимум циклов доработки", (v) => fmt(v, 0)],
    ["materialCostPerUnitRub", "Компоненты на задание, ₽", (v) => fmt(v, 0)],
    ["fixedCostRub", "Постоянные расходы, ₽", (v) => fmt(v, 0)],
    ["replications", "Число репликаций", (v) => fmt(v, 0)],
    ["seed", "Базовый seed", (v) => String(v)],
  ];
  for (const [key, label, f] of scalar) {
    const x = a[key] as number;
    const y = b[key] as number;
    if (x !== y) out.push({ path: key, label, before: f(x), after: f(y) });
  }
  if (a.arrivalKind !== b.arrivalKind) {
    out.push({ path: "arrivalKind", label: "Тип входящего потока", before: a.arrivalKind, after: b.arrivalKind });
  }
  for (const st of STATIONS) {
    const x = a.stations[st.id as StationId];
    const y = b.stations[st.id as StationId];
    if (x.capacity !== y.capacity)
      out.push({ path: `stations.${st.id}.capacity`, label: `${st.shortName}: вместимость`, before: String(x.capacity), after: String(y.capacity) });
    if (JSON.stringify(x.processTime) !== JSON.stringify(y.processTime))
      out.push({
        path: `stations.${st.id}.processTime`,
        label: `${st.shortName}: время операции (среднее)`,
        before: `${DISTRIBUTION_LABELS[x.processTime.kind]}, ${fmt(distributionMean(x.processTime), 1)} мин`,
        after: `${DISTRIBUTION_LABELS[y.processTime.kind]}, ${fmt(distributionMean(y.processTime), 1)} мин`,
      });
    if (x.hourlyCostRub !== y.hourlyCostRub)
      out.push({ path: `stations.${st.id}.hourlyCostRub`, label: `${st.shortName}: ставка, ₽/ч`, before: fmt(x.hourlyCostRub, 0), after: fmt(y.hourlyCostRub, 0) });
    if (x.consumablesPerOperationRub !== y.consumablesPerOperationRub)
      out.push({
        path: `stations.${st.id}.consumablesPerOperationRub`,
        label: `${st.shortName}: расходники на операцию, ₽`,
        before: fmt(x.consumablesPerOperationRub, 0),
        after: fmt(y.consumablesPerOperationRub, 0),
      });
  }
  return out;
}

export async function compareRuns(baselineRunId: string, alternativeRunIds: string[]): Promise<ComparisonDto> {
  const base = await getRunDetail(baselineRunId);
  const alternatives: AlternativeComparison[] = [];
  const alternativeAggregates: Array<Record<AggregateMetricKey, SummaryStats>> = [];
  for (const id of alternativeRunIds) {
    const alt = await getRunDetail(id);
    alternativeAggregates.push(alt.aggregate);
    const aggregate = KEY_AGGREGATE_METRICS.map((key) =>
      compareMetric(key, AGGREGATE_METRICS[key].direction, base.aggregate[key], alt.aggregate[key]),
    );
    const stations: StationComparison[] = base.stations.map((bs) => {
      const as = alt.stations.find((s) => s.stationId === bs.stationId)!;
      return {
        stationId: bs.stationId,
        name: bs.name,
        metrics: (["capacity", ...KEY_STATION_METRICS] as StationMetricKey[]).map((key) =>
          compareMetric(key, STATION_METRICS[key].direction, bs.metrics[key], as.metrics[key]),
        ),
      };
    });
    const { aggregate: _a, stations: _s, ranking: _r, replicationValues: _v, parameters: _p, bottleneck: _b, ...altSummary } = alt;
    alternatives.push({
      run: altSummary,
      bottleneck: alt.bottleneck,
      parameterChanges: diffParameters(base.parameters, alt.parameters),
      aggregate,
      stations,
    });
  }
  const { aggregate: baselineAggregate, ...baseRest } = base;
  return {
    baseline: {
      id: baseRest.id,
      scenarioId: baseRest.scenarioId,
      scenarioName: baseRest.scenarioName,
      isBaselineScenario: baseRest.isBaselineScenario,
      status: baseRest.status,
      createdAt: baseRest.createdAt,
      createdBy: baseRest.createdBy,
      replications: baseRest.replications,
      baseSeed: baseRest.baseSeed,
      horizonMin: baseRest.horizonMin,
      durationMs: baseRest.durationMs,
      engineVersion: baseRest.engineVersion,
      headline: baseRest.headline,
      bottleneck: baseRest.bottleneck,
    },
    alternatives,
    baselineAggregate,
    alternativeAggregates,
    method:
      "Сравниваются средние значения показателей по репликациям каждого прогона. Разность считается статистически " +
      "различимой, если 95% доверительный интервал разности средних (приближение Уэлча) не содержит ноль. " +
      "Вывод относится только к модели с заданными синтетическими параметрами и не доказывает причинно-следственную " +
      "связь на реальном производстве.",
  };
}
