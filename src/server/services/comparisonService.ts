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
import { engineSupportsCrn } from "@/domain/simulation/types";
import { prisma } from "@/server/db";
import { getRunDetail, type RunDetailDto, type RunSummaryDto } from "./simulationService";

/** Значения показателей по репликациям: агрегаты и показатели участков, упорядоченные по номеру репликации. */
interface ReplicationMatrix {
  aggregate: Record<string, Array<number | null>>;
  stations: Record<string, Record<string, Array<number | null>>>;
}

async function loadReplicationMatrix(runId: string): Promise<ReplicationMatrix> {
  const rows = await prisma.replicationResult.findMany({ where: { runId }, orderBy: { replicationIndex: "asc" } });
  const aggregate: ReplicationMatrix["aggregate"] = {};
  const stations: ReplicationMatrix["stations"] = {};
  rows.forEach((row, i) => {
    const agg = JSON.parse(row.aggregateJson) as Record<string, number | null>;
    for (const [k, v] of Object.entries(agg)) (aggregate[k] ??= [])[i] = typeof v === "number" ? v : null;
    const sts = JSON.parse(row.stationsJson) as Array<Record<string, unknown> & { stationId: string }>;
    for (const st of sts) {
      const target = (stations[st.stationId] ??= {});
      for (const [k, v] of Object.entries(st)) {
        if (k === "stationId" || k === "name") continue;
        (target[k] ??= [])[i] = typeof v === "number" ? v : null;
      }
    }
  });
  return { aggregate, stations };
}

/**
 * Парное сравнение допустимо, если оба прогона рассчитаны движком с CRN, с одинаковым базовым seed
 * и одинаковым числом репликаций: тогда репликация i в обоих прогонах использует одни и те же потоки.
 */
export function canPairRuns(a: Pick<RunDetailDto, "engineVersion" | "baseSeed" | "replications">, b: typeof a): boolean {
  return (
    engineSupportsCrn(a.engineVersion) &&
    engineSupportsCrn(b.engineVersion) &&
    a.baseSeed === b.baseSeed &&
    a.replications === b.replications &&
    a.replications >= 2
  );
}

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
  /** Для каждой альтернативы: применено ли парное сравнение (CRN). */
  pairedFlags: boolean[];
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
    const ff = (f: typeof x.failure) => (f ? `MTBF ${fmt(f.mtbfMin, 0)} / MTTR ${fmt(f.mttrMin, 1)} мин` : "без отказов");
    if (ff(x.failure) !== ff(y.failure))
      out.push({ path: `stations.${st.id}.failure`, label: `${st.shortName}: отказы`, before: ff(x.failure), after: ff(y.failure) });
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
  const baseMatrix = await loadReplicationMatrix(baselineRunId);
  const pairedFlags: boolean[] = [];
  const alternatives: AlternativeComparison[] = [];
  const alternativeAggregates: Array<Record<AggregateMetricKey, SummaryStats>> = [];
  for (const id of alternativeRunIds) {
    const alt = await getRunDetail(id);
    alternativeAggregates.push(alt.aggregate);
    const paired = canPairRuns(base, alt);
    pairedFlags.push(paired);
    const altMatrix = paired ? await loadReplicationMatrix(id) : null;
    const aggregate = KEY_AGGREGATE_METRICS.map((key) =>
      compareMetric(
        key,
        AGGREGATE_METRICS[key].direction,
        base.aggregate[key],
        alt.aggregate[key],
        altMatrix ? { before: baseMatrix.aggregate[key] ?? [], after: altMatrix.aggregate[key] ?? [] } : undefined,
      ),
    );
    const stations: StationComparison[] = base.stations.map((bs) => {
      const as = alt.stations.find((s) => s.stationId === bs.stationId)!;
      return {
        stationId: bs.stationId,
        name: bs.name,
        metrics: (["capacity", ...KEY_STATION_METRICS] as StationMetricKey[]).map((key) =>
          compareMetric(
            key,
            STATION_METRICS[key].direction,
            bs.metrics[key],
            as.metrics[key],
            altMatrix
              ? { before: baseMatrix.stations[bs.stationId]?.[key] ?? [], after: altMatrix.stations[bs.stationId]?.[key] ?? [] }
              : undefined,
          ),
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
    pairedFlags,
    method:
      "Сравниваются средние значения показателей по репликациям. Движок использует общие случайные числа (CRN): " +
      "при одинаковом seed изделие №k получает одинаковые длительности операций и исходы контроля в обоих сценариях. " +
      "Поэтому для прогонов с одинаковым seed и числом репликаций применяется парное сравнение: 95% доверительный " +
      "интервал строится по разностям внутри пар репликаций. Если прогоны несопоставимы (разный seed или старая версия " +
      "движка), используется интервал Уэлча для независимых выборок. Разность считается различимой, если интервал не содержит ноль. " +
      "Вывод относится только к модели с заданными синтетическими параметрами и не доказывает причинно-следственную " +
      "связь на реальном производстве.",
  };
}
