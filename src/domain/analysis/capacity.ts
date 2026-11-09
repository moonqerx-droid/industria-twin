/**
 * Кривая пропускной способности: как меняются цикл, выпуск, НЗП и стоимость единицы при изменении спроса.
 *
 * Спрос (интенсивность поступления) перебирается сеткой вокруг текущего значения; все точки считаются
 * с одним и тем же seed, поэтому благодаря общим случайным числам кривая гладкая: соседние точки
 * отличаются только масштабом межприходных интервалов. Аналитический предел мощности — спрос,
 * при котором оценка загрузки самого нагруженного участка ρ = λ·v·E[S]/(c·A) достигает 100%.
 * Модуль чистый: без БД, UI и сети.
 */
import { rankBottlenecks } from "./bottleneck";
import { estimateLoads } from "../model/loadEstimate";
import { STATIONS, type ScenarioParameters, type StationId } from "../model/demoData";
import { buildSimulationConfig } from "../model/scenarioConfig";
import { runReplications } from "../simulation/replications";
import { ENGINE_LIMITS } from "../simulation/types";

export interface CapacityPoint {
  ratePerHour: number;
  /** Отношение к текущему спросу (1 — текущий). */
  factor: number;
  completed: number | null;
  completedCi: number | null;
  cycleTimeAvgMin: number | null;
  cycleTimeCi: number | null;
  wipEnd: number | null;
  costPerUnitRub: number | null;
  /** Узкое место в этой точке (null — все участки в норме). */
  bottleneckId: StationId | null;
}

export interface CapacityCurve {
  currentRatePerHour: number;
  /** Аналитический предел мощности, задания/ч (ρ ограничивающего участка = 100%). */
  saturationRatePerHour: number | null;
  limitingStationId: StationId | null;
  /** Запас мощности относительно текущего спроса, доля (0,2 — спрос можно поднять на 20%). */
  headroom: number | null;
  /** Наименьший спрос сетки, при котором средний цикл превышает текущий вдвое (null — не достигнут). */
  doublingRatePerHour: number | null;
  replications: number;
  points: CapacityPoint[];
  durationMs: number;
}

export const CAPACITY_FACTORS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;

export function capacityCurve(params: ScenarioParameters, opts: { replications?: number; factors?: readonly number[] } = {}): CapacityCurve {
  const t0 = Date.now();
  const replications = Math.max(2, Math.min(params.replications, opts.replications ?? 10));
  const factors = opts.factors ?? CAPACITY_FACTORS;
  const base = params.arrivalRatePerHour;

  const rho = estimateLoads(params);
  let limitingStationId: StationId | null = null;
  let maxRho = 0;
  for (const s of STATIONS) {
    const v = rho[s.id];
    if (v > maxRho) {
      maxRho = v;
      limitingStationId = s.id;
    }
  }
  const saturationRatePerHour = base > 0 && maxRho > 0 ? base / maxRho : null;

  const points: CapacityPoint[] = [];
  for (const factor of factors) {
    const ratePerHour = Math.min(ENGINE_LIMITS.maxArrivalRatePerHour, Math.round(base * factor * 100) / 100);
    const r = runReplications(
      { ...buildSimulationConfig({ ...params, arrivalRatePerHour: ratePerHour }), recordEvents: false },
      replications,
    );
    const ranking = rankBottlenecks(
      STATIONS.map((s) => {
        const m = r.stations[s.id]!;
        return {
          stationId: s.id,
          name: s.name,
          capacity: m.capacity.mean ?? 1,
          utilization: m.utilization.mean ?? 0,
          avgQueueLength: m.avgQueueLength.mean ?? 0,
          avgWaitMin: m.avgWaitMin.mean ?? 0,
          queueAtEnd: m.queueAtEnd.mean ?? 0,
          downtimeShare: 1 - (m.availability?.mean ?? 1),
        };
      }),
    );
    const top = ranking[0];
    points.push({
      ratePerHour,
      factor,
      completed: r.aggregate.completed.mean,
      completedCi: r.aggregate.completed.ci95,
      cycleTimeAvgMin: r.aggregate.cycleTimeAvgMin.mean,
      cycleTimeCi: r.aggregate.cycleTimeAvgMin.ci95,
      wipEnd: r.aggregate.wipEnd.mean,
      costPerUnitRub: r.aggregate.costPerUnitRub.mean,
      bottleneckId: top && top.status !== "normal" ? (top.stationId as StationId) : null,
    });
  }

  const current = points.find((p) => p.factor === 1)?.cycleTimeAvgMin ?? null;
  const doubling = current !== null ? points.find((p) => p.factor > 1 && (p.cycleTimeAvgMin ?? 0) >= 2 * current) : undefined;

  return {
    currentRatePerHour: base,
    saturationRatePerHour,
    limitingStationId,
    headroom: saturationRatePerHour !== null && base > 0 ? saturationRatePerHour / base - 1 : null,
    doublingRatePerHour: doubling?.ratePerHour ?? null,
    replications,
    points,
    durationMs: Date.now() - t0,
  };
}
