/**
 * Советник по ресурсам: автоматическая проверка гипотез «что даст +1 единица ресурса на участке».
 *
 * Для каждого участка строится вариант сценария с увеличенной на 1 вместимостью, а также вариант
 * «+1 на двух самых загруженных участках». Все варианты рассчитываются с теми же seed и числом
 * репликаций, что и исходный сценарий, поэтому благодаря общим случайным числам (CRN) разность
 * оценивается парно и узкими доверительными интервалами. Модуль чистый: без БД, UI и сети.
 */
import { rankBottlenecks, type BottleneckFinding } from "./bottleneck";
import { STATIONS, type ScenarioParameters, type StationId } from "../model/demoData";
import { buildSimulationConfig } from "../model/scenarioConfig";
import { runReplications, type ReplicatedResult } from "../simulation/replications";
import { pairedDifference, differenceOfMeans, type DifferenceStats } from "../simulation/statistics";
import { ENGINE_LIMITS } from "../simulation/types";

export const ADVISOR_METRICS = ["cycleTimeAvgMin", "completed", "costPerUnitRub", "wipEnd", "totalCostRub"] as const;
export type AdvisorMetricKey = (typeof ADVISOR_METRICS)[number];

export interface AdvisorDelta extends DifferenceStats {
  before: number | null;
  after: number | null;
  relDiff: number | null;
}

export type AdvisorVerdict = "recommended" | "faster-costlier" | "no-effect" | "costlier" | "worse";

/** Порог практической значимости: изменение меньше 1% считается несущественным, даже если оно различимо. */
export const PRACTICAL_THRESHOLD = 0.01;

export interface AdvisorCandidate {
  id: string;
  label: string;
  /** Участки, на которых добавлена единица ресурса. */
  stationIds: StationId[];
  parameters: ScenarioParameters;
  deltas: Record<AdvisorMetricKey, AdvisorDelta>;
  bottleneckAfter: BottleneckFinding | null;
  verdict: AdvisorVerdict;
  /** Дополнительные затраты на ресурс за горизонт, ₽ (ставка × горизонт). */
  addedResourceCostRub: number;
}

export interface AdvisorResult {
  replications: number;
  baseSeed: number;
  paired: boolean;
  bottleneckBefore: BottleneckFinding | null;
  candidates: AdvisorCandidate[];
  /** Лучший вариант по правилу ранжирования или null, если ни один не даёт различимого улучшения. */
  best: AdvisorCandidate | null;
  durationMs: number;
}

export const ADVISOR_VERDICT_LABELS: Record<AdvisorVerdict, string> = {
  recommended: "Рекомендуется",
  "faster-costlier": "Быстрее, но дороже",
  "no-effect": "Нет заметного эффекта",
  costlier: "Дороже без эффекта",
  worse: "Ухудшает показатели",
};

function ranking(r: ReplicatedResult): BottleneckFinding[] {
  return rankBottlenecks(
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
}

/** Единица ресурса участка в именительном падеже — для подписей вариантов. */
export const RESOURCE_UNIT_NOUN: Record<StationId, string> = {
  "st-receiving": "кладовщик",
  "st-machining": "станок ЧПУ",
  "st-assembly": "сборочный пост",
  "st-testing": "испытательный стенд",
  "st-rework": "пост доработки",
  "st-packing": "линия упаковки",
};

function addCapacity(params: ScenarioParameters, ids: StationId[]): ScenarioParameters {
  const stations = { ...params.stations };
  for (const id of ids) stations[id] = { ...stations[id], capacity: stations[id].capacity + 1 };
  return { ...params, stations };
}

function delta(base: ReplicatedResult, alt: ReplicatedResult, key: AdvisorMetricKey, paired: boolean): AdvisorDelta {
  const before = base.aggregate[key].mean;
  const after = alt.aggregate[key].mean;
  const d = paired
    ? pairedDifference(base.replications.map((r) => r.aggregate[key]), alt.replications.map((r) => r.aggregate[key]))
    : differenceOfMeans(base.aggregate[key], alt.aggregate[key]);
  const diff = before !== null && after !== null ? after - before : (d?.diff ?? 0);
  const ci95 = d?.ci95 ?? null;
  return {
    before,
    after,
    diff,
    ci95,
    distinguishable: ci95 === null ? null : Math.abs(diff) > ci95,
    relDiff: before !== null && before !== 0 ? diff / Math.abs(before) : null,
  };
}

function classify(c: Pick<AdvisorCandidate, "deltas">): AdvisorVerdict {
  const sig = (k: AdvisorMetricKey) =>
    c.deltas[k].distinguishable === true && Math.abs(c.deltas[k].relDiff ?? 1) >= PRACTICAL_THRESHOLD;
  const cycleBetter = sig("cycleTimeAvgMin") && c.deltas.cycleTimeAvgMin.diff < 0;
  const outputBetter = sig("completed") && c.deltas.completed.diff > 0;
  const costBetter = sig("costPerUnitRub") && c.deltas.costPerUnitRub.diff < 0;
  const costWorse = sig("costPerUnitRub") && c.deltas.costPerUnitRub.diff > 0;
  const cycleWorse = sig("cycleTimeAvgMin") && c.deltas.cycleTimeAvgMin.diff > 0;
  if (cycleWorse) return "worse";
  if ((cycleBetter || outputBetter) && !costWorse) return "recommended";
  if (costBetter) return "recommended";
  if (cycleBetter || outputBetter) return "faster-costlier";
  return costWorse ? "costlier" : "no-effect";
}

const VERDICT_ORDER: Record<AdvisorVerdict, number> = { recommended: 0, "faster-costlier": 1, "no-effect": 2, costlier: 3, worse: 4 };

/**
 * Рассчитывает варианты «+1 ресурс» и ранжирует их: сначала рекомендуемые, внутри группы —
 * по снижению стоимости единицы, затем по сокращению среднего цикла.
 */
export function adviseResources(params: ScenarioParameters, opts: { replications?: number } = {}): AdvisorResult {
  const t0 = Date.now();
  const replications = Math.max(2, Math.min(params.replications, opts.replications ?? params.replications) || 10);
  const run = (p: ScenarioParameters) => runReplications({ ...buildSimulationConfig(p), recordEvents: false }, replications);
  const base = run(params);
  const baseRanking = ranking(base);
  const bottleneckBefore = baseRanking[0] && baseRanking[0].status !== "normal" ? baseRanking[0] : null;

  const variants: Array<{ id: string; label: string; ids: StationId[] }> = STATIONS.filter(
    (s) => params.stations[s.id].capacity < ENGINE_LIMITS.maxCapacity,
  ).map((s) => ({ id: `plus-${s.id}`, label: `+1 ${RESOURCE_UNIT_NOUN[s.id]} (${s.code} ${s.shortName})`, ids: [s.id] }));
  const topTwo = baseRanking.slice(0, 2).map((b) => b.stationId as StationId);
  if (topTwo.length === 2 && topTwo.every((id) => params.stations[id].capacity < ENGINE_LIMITS.maxCapacity)) {
    const names = topTwo.map((id) => STATIONS.find((s) => s.id === id)!.shortName).join(" + ");
    variants.push({ id: "plus-top2", label: `+1 на двух самых загруженных: ${names}`, ids: topTwo });
  }

  const candidates: AdvisorCandidate[] = variants.map((v) => {
    const parameters = addCapacity(params, v.ids);
    const alt = run(parameters);
    const deltas = Object.fromEntries(ADVISOR_METRICS.map((k) => [k, delta(base, alt, k, true)])) as Record<
      AdvisorMetricKey,
      AdvisorDelta
    >;
    const r = ranking(alt);
    const candidate = {
      id: v.id,
      label: v.label,
      stationIds: v.ids,
      parameters,
      deltas,
      bottleneckAfter: r[0] && r[0].status !== "normal" ? r[0] : null,
      addedResourceCostRub: v.ids.reduce((sum, id) => sum + (params.stations[id].hourlyCostRub * params.horizonMin) / 60, 0),
    };
    return { ...candidate, verdict: classify(candidate) };
  });

  candidates.sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      a.deltas.costPerUnitRub.diff - b.deltas.costPerUnitRub.diff ||
      a.deltas.cycleTimeAvgMin.diff - b.deltas.cycleTimeAvgMin.diff ||
      a.id.localeCompare(b.id),
  );
  const best = candidates[0] && candidates[0].verdict === "recommended" ? candidates[0] : null;
  return {
    replications,
    baseSeed: params.seed,
    paired: true,
    bottleneckBefore,
    candidates,
    best,
    durationMs: Date.now() - t0,
  };
}
