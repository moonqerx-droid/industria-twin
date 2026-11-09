import type { Prisma } from "@prisma/client";
import { rankBottlenecks, classifyStation, type BottleneckFinding, type StationStatus } from "@/domain/analysis/bottleneck";
import { STATIONS, type ScenarioParameters } from "@/domain/model/demoData";
import {
  AGGREGATE_METRICS,
  STATION_METRICS,
  type AggregateMetricKey,
  type StationMetricKey,
} from "@/domain/model/metrics";
import { buildSimulationConfig } from "@/domain/model/scenarioConfig";
import { runReplications } from "@/domain/simulation/replications";
import type { SummaryStats } from "@/domain/simulation/statistics";
import { EVENT_TYPES, type Snapshot } from "@/domain/simulation/types";
import { prisma } from "@/server/db";
import { notFound } from "@/server/http";
import { getScenario } from "./scenarioService";

export const EVENT_LOG_FORMAT_VERSION = 1;

export interface RunSummaryDto {
  id: string;
  scenarioId: string;
  scenarioName: string;
  isBaselineScenario: boolean;
  status: string;
  createdAt: string;
  createdBy: string | null;
  replications: number;
  baseSeed: number;
  horizonMin: number;
  durationMs: number;
  engineVersion: string;
  headline: {
    completed: number | null;
    cycleTimeAvgMin: number | null;
    utilizationAvg: number | null;
    costPerUnitRub: number | null;
  };
}

export interface StationRunDto {
  stationId: string;
  name: string;
  shortName: string;
  code: string;
  status: StationStatus;
  metrics: Record<StationMetricKey, SummaryStats>;
}

export interface RunDetailDto extends RunSummaryDto {
  parameters: ScenarioParameters;
  aggregate: Record<AggregateMetricKey, SummaryStats>;
  stations: StationRunDto[];
  ranking: BottleneckFinding[];
  bottleneck: BottleneckFinding | null;
  replicationValues: Array<{ index: number; seed: number; aggregate: Record<string, number | null> }>;
}

/** Компактная запись события: [t, тип, id изделия, индекс участка (-1 — нет), дефект 0/1]. */
export type CompactEvent = [number, number, number, number, number];

export interface ReplayDto {
  runId: string;
  formatVersion: number;
  horizonMin: number;
  eventTypes: readonly string[];
  stationIds: string[];
  truncated: boolean;
  events: CompactEvent[];
  snapshots: Snapshot[];
}

const STATION_ORDER = STATIONS.map((s) => s.id as string);

function toStats(row: { n: number; mean: number | null; sd: number | null; min: number | null; max: number | null; ci95: number | null }): SummaryStats {
  return { n: row.n, mean: row.mean, sd: row.sd, min: row.min, max: row.max, ci95: row.ci95 };
}

function round(x: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Запускает моделирование сценария и сохраняет результаты в одной транзакции. */
export async function runScenarioSimulation(scenarioId: string, userId: string | null): Promise<RunDetailDto> {
  const scenario = await getScenario(scenarioId);
  const params = scenario.parameters;
  const config = buildSimulationConfig(params);
  const t0 = performance.now();
  const result = runReplications({ ...config, recordEvents: true }, params.replications);
  const durationMs = Math.round(performance.now() - t0);
  const rep0 = result.representative;

  const aggregateRows: Prisma.AggregateMetricCreateManyRunInput[] = (Object.keys(result.aggregate) as AggregateMetricKey[]).map(
    (key) => ({ metricKey: key, unit: AGGREGATE_METRICS[key].unit, ...result.aggregate[key] }),
  );
  const stationRows: Prisma.StationMetricCreateManyRunInput[] = [];
  for (const [stationId, metrics] of Object.entries(result.stations)) {
    for (const key of Object.keys(metrics) as StationMetricKey[]) {
      stationRows.push({ stationId, metricKey: key, unit: STATION_METRICS[key].unit, ...metrics[key] });
    }
  }
  const typeIndex = new Map(EVENT_TYPES.map((t, i) => [t, i]));
  const compact: CompactEvent[] = rep0.events.map((e) => [
    round(e.t),
    typeIndex.get(e.type)!,
    e.unitId,
    e.stationId ? STATION_ORDER.indexOf(e.stationId) : -1,
    e.defect ? 1 : 0,
  ]);

  const run = await prisma.simulationRun.create({
    data: {
      scenario: { connect: { id: scenarioId } },
      scenarioName: scenario.name,
      status: "completed",
      engineVersion: rep0.engineVersion,
      baseSeed: result.baseSeed,
      replications: result.replications.length,
      horizonMin: params.horizonMin,
      configJson: JSON.stringify(params),
      durationMs,
      ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
      aggregate: { createMany: { data: aggregateRows } },
      stationMetrics: { createMany: { data: stationRows } },
      replicationRows: {
        createMany: {
          data: result.replications.map((r) => ({
            replicationIndex: r.index,
            seed: r.seed,
            aggregateJson: JSON.stringify(r.aggregate),
            stationsJson: JSON.stringify(r.stations),
          })),
        },
      },
      eventLog: {
        create: {
          formatVersion: EVENT_LOG_FORMAT_VERSION,
          eventCount: compact.length,
          truncated: rep0.eventsTruncated,
          eventsJson: JSON.stringify(compact),
          snapshotsJson: JSON.stringify(rep0.snapshots),
        },
      },
    },
  });
  return getRunDetail(run.id);
}

const summaryInclude = {
  scenario: { select: { isBaseline: true } },
  createdBy: { select: { displayName: true } },
  aggregate: { where: { metricKey: { in: ["completed", "cycleTimeAvgMin", "utilizationAvg", "costPerUnitRub"] } } },
} satisfies Prisma.SimulationRunInclude;

type RunWithSummary = Prisma.SimulationRunGetPayload<{ include: typeof summaryInclude }>;

function toSummary(r: RunWithSummary): RunSummaryDto {
  const m = (k: string) => r.aggregate.find((a) => a.metricKey === k)?.mean ?? null;
  return {
    id: r.id,
    scenarioId: r.scenarioId,
    scenarioName: r.scenarioName,
    isBaselineScenario: r.scenario.isBaseline,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy?.displayName ?? null,
    replications: r.replications,
    baseSeed: r.baseSeed,
    horizonMin: r.horizonMin,
    durationMs: r.durationMs,
    engineVersion: r.engineVersion,
    headline: {
      completed: m("completed"),
      cycleTimeAvgMin: m("cycleTimeAvgMin"),
      utilizationAvg: m("utilizationAvg"),
      costPerUnitRub: m("costPerUnitRub"),
    },
  };
}

export async function listRuns(opts: { scenarioId?: string; limit?: number } = {}): Promise<RunSummaryDto[]> {
  const rows = await prisma.simulationRun.findMany({
    where: { status: "completed", ...(opts.scenarioId ? { scenarioId: opts.scenarioId } : {}) },
    include: summaryInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return rows.map(toSummary);
}

/** Последние прогоны каждого сценария (для выбора в сравнении). */
export async function latestRunPerScenario(): Promise<RunSummaryDto[]> {
  const all = await listRuns({ limit: 200 });
  const seen = new Set<string>();
  return all.filter((r) => (seen.has(r.scenarioId) ? false : (seen.add(r.scenarioId), true)));
}

export async function getRunDetail(id: string): Promise<RunDetailDto> {
  const r = await prisma.simulationRun.findUnique({
    where: { id },
    include: {
      scenario: { select: { isBaseline: true } },
      createdBy: { select: { displayName: true } },
      aggregate: true,
      stationMetrics: true,
      replicationRows: { orderBy: { replicationIndex: "asc" } },
    },
  });
  if (!r) throw notFound("Прогон моделирования");

  const aggregate = {} as Record<AggregateMetricKey, SummaryStats>;
  for (const row of r.aggregate) aggregate[row.metricKey as AggregateMetricKey] = toStats(row);

  const stations: StationRunDto[] = STATIONS.map((def) => {
    const metrics = {} as Record<StationMetricKey, SummaryStats>;
    for (const row of r.stationMetrics.filter((m) => m.stationId === def.id)) {
      metrics[row.metricKey as StationMetricKey] = toStats(row);
    }
    const v = (k: StationMetricKey) => metrics[k]?.mean ?? 0;
    return {
      stationId: def.id,
      name: def.name,
      shortName: def.shortName,
      code: def.code,
      metrics,
      status: classifyStation({
        stationId: def.id,
        name: def.name,
        capacity: v("capacity"),
        utilization: v("utilization"),
        avgQueueLength: v("avgQueueLength"),
        avgWaitMin: v("avgWaitMin"),
        queueAtEnd: v("queueAtEnd"),
        downtimeShare: 1 - (metrics.availability?.mean ?? 1),
      }),
    };
  });

  const ranking = rankBottlenecks(
    stations.map((s) => ({
      stationId: s.stationId,
      name: s.name,
      capacity: s.metrics.capacity?.mean ?? 1,
      utilization: s.metrics.utilization?.mean ?? 0,
      avgQueueLength: s.metrics.avgQueueLength?.mean ?? 0,
      avgWaitMin: s.metrics.avgWaitMin?.mean ?? 0,
      queueAtEnd: s.metrics.queueAtEnd?.mean ?? 0,
      downtimeShare: 1 - (s.metrics.availability?.mean ?? 1),
    })),
  );

  const m = (k: string) => aggregate[k as AggregateMetricKey]?.mean ?? null;
  return {
    id: r.id,
    scenarioId: r.scenarioId,
    scenarioName: r.scenarioName,
    isBaselineScenario: r.scenario.isBaseline,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy?.displayName ?? null,
    replications: r.replications,
    baseSeed: r.baseSeed,
    horizonMin: r.horizonMin,
    durationMs: r.durationMs,
    engineVersion: r.engineVersion,
    headline: {
      completed: m("completed"),
      cycleTimeAvgMin: m("cycleTimeAvgMin"),
      utilizationAvg: m("utilizationAvg"),
      costPerUnitRub: m("costPerUnitRub"),
    },
    parameters: JSON.parse(r.configJson) as ScenarioParameters,
    aggregate,
    stations,
    ranking,
    bottleneck: ranking[0] && ranking[0].status !== "normal" ? ranking[0] : null,
    replicationValues: r.replicationRows.map((row) => ({
      index: row.replicationIndex,
      seed: row.seed,
      aggregate: JSON.parse(row.aggregateJson) as Record<string, number | null>,
    })),
  };
}

export async function getReplay(runId: string): Promise<ReplayDto> {
  const run = await prisma.simulationRun.findUnique({ where: { id: runId }, include: { eventLog: true } });
  if (!run) throw notFound("Прогон моделирования");
  if (!run.eventLog) throw notFound("Журнал событий прогона");
  return {
    runId,
    formatVersion: run.eventLog.formatVersion,
    horizonMin: run.horizonMin,
    eventTypes: EVENT_TYPES,
    stationIds: STATION_ORDER,
    truncated: run.eventLog.truncated,
    events: JSON.parse(run.eventLog.eventsJson) as CompactEvent[],
    snapshots: JSON.parse(run.eventLog.snapshotsJson) as Snapshot[],
  };
}

/**
 * Выбор прогона по умолчанию: указанный явно → последний прогон базового сценария → последний прогон.
 * Возвращает null, если прогонов нет.
 */
export async function resolveRunId(runId?: string | null): Promise<string | null> {
  if (runId) {
    const exists = await prisma.simulationRun.findUnique({ where: { id: runId }, select: { id: true } });
    if (!exists) throw notFound("Прогон моделирования");
    return runId;
  }
  const baseline = await prisma.simulationRun.findFirst({
    where: { status: "completed", scenario: { isBaseline: true } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (baseline) return baseline.id;
  const any = await prisma.simulationRun.findFirst({ where: { status: "completed" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return any?.id ?? null;
}

export async function deleteRun(id: string): Promise<void> {
  const existing = await prisma.simulationRun.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("Прогон моделирования");
  await prisma.simulationRun.delete({ where: { id } });
}
