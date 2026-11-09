import { FACTORY_ID, POI_CASES, TOURS } from "@/domain/model/demoData";
import type { ChangeVerdict } from "@/domain/analysis/comparison";
import { AGGREGATE_METRICS, formatMetricValue, type AggregateMetricKey } from "@/domain/model/metrics";
import { compareRuns } from "./comparisonService";
import { prisma } from "@/server/db";
import { getRunDetail, latestRunPerScenario, resolveRunId, type RunDetailDto } from "./simulationService";

/** Карточка результата кейса: рассчитанное сравнение «до/после» для точки интереса. */
export interface PoiCaseDto {
  poiId: string;
  title: string;
  question: string;
  scenarioName: string;
  baselineRunId: string;
  runId: string;
  paired: boolean;
  items: Array<{ key: string; label: string; unit: string; before: string; after: string; rel: number | null; verdict: ChangeVerdict }>;
  bottleneckBefore: string | null;
  bottleneckAfter: string | null;
}

export interface PoiDto {
  id: string;
  stationId: string | null;
  title: string;
  kind: string;
  description: string;
  bestPractice: string | null;
  cameraPresetId: string;
  metricKeys: string[];
  media: Array<{ id: string; kind: string; uri: string; title: string; license: string; isPlaceholder: boolean }>;
}

export interface TourDto {
  id: string;
  name: string;
  audience: string;
  description: string;
  stops: Array<{ order: number; poiId: string; title: string; narrative: string }>;
}

export interface TourStateDto {
  pois: PoiDto[];
  tours: TourDto[];
  /** Прогон, показатели которого отображаются в туре; null — расчётов ещё нет. */
  run: RunDetailDto | null;
  /** Кейсы точек интереса, рассчитанные по последним прогонам сценариев. */
  cases: PoiCaseDto[];
}

/**
 * Строит карточки кейсов: последний прогон сценария кейса сравнивается с последним прогоном базового.
 * Числа не хранятся в карточке — они вычисляются из сохранённых результатов моделирования.
 */
export async function listPoiCases(): Promise<PoiCaseDto[]> {
  const latest = await latestRunPerScenario();
  const base = latest.find((r) => r.isBaselineScenario);
  if (!base) return [];
  const out: PoiCaseDto[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof compareRuns>>>();
  for (const c of POI_CASES) {
    const alt = latest.find((r) => r.scenarioId === c.scenarioId);
    if (!alt) continue;
    let cmp = cache.get(alt.id);
    if (!cmp) {
      cmp = await compareRuns(base.id, [alt.id]);
      cache.set(alt.id, cmp);
    }
    const a = cmp.alternatives[0]!;
    const items = c.metricKeys.flatMap((key) => {
      const m = a.aggregate.find((x) => x.key === key);
      const def = AGGREGATE_METRICS[key as AggregateMetricKey];
      if (!m || !def) return [];
      return [{ key, label: def.label, unit: def.unit, before: formatMetricValue(def, m.before), after: formatMetricValue(def, m.after), rel: m.relDiff, verdict: m.verdict }];
    });
    out.push({
      poiId: c.poiId,
      title: c.title,
      question: c.question,
      scenarioName: alt.scenarioName,
      baselineRunId: base.id,
      runId: alt.id,
      paired: cmp.pairedFlags[0] ?? false,
      items,
      bottleneckBefore: cmp.baseline.bottleneck?.name ?? null,
      bottleneckAfter: a.bottleneck?.name ?? null,
    });
  }
  return out;
}

export async function listPois(): Promise<PoiDto[]> {
  const rows = await prisma.pointOfInterest.findMany({ where: { factoryId: FACTORY_ID }, include: { media: true }, orderBy: { id: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    stationId: p.stationId,
    title: p.title,
    kind: p.kind,
    description: p.description,
    bestPractice: p.bestPractice,
    cameraPresetId: p.cameraPresetId,
    metricKeys: p.metricKeys.split(",").filter(Boolean),
    media: p.media.map((m) => ({ id: m.id, kind: m.kind, uri: m.uri, title: m.title, license: m.license, isPlaceholder: m.isPlaceholder })),
  }));
}

export async function listTours(): Promise<TourDto[]> {
  const rows = await prisma.tour.findMany({ where: { factoryId: FACTORY_ID }, include: { stops: { orderBy: { order: "asc" } } } });
  // Порядок маршрутов — как в демонстрационных данных (основная экскурсия первой), остальные — по названию.
  const rank = (id: string) => {
    const i = TOURS.findIndex((t) => t.id === id);
    return i < 0 ? TOURS.length : i;
  };
  rows.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "ru"));
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    audience: t.audience,
    description: t.description,
    stops: t.stops.map((s) => ({ order: s.order, poiId: s.poiId, title: s.title, narrative: s.narrative })),
  }));
}

export async function getTourState(runId?: string | null): Promise<TourStateDto> {
  const resolved = await resolveRunId(runId);
  const [pois, tours, run, cases] = await Promise.all([
    listPois(),
    listTours(),
    resolved ? getRunDetail(resolved) : Promise.resolve(null),
    listPoiCases().catch(() => []),
  ]);
  return { pois, tours, run, cases };
}
