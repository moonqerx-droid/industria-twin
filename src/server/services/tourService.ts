import { FACTORY_ID } from "@/domain/model/demoData";
import { prisma } from "@/server/db";
import { getRunDetail, resolveRunId, type RunDetailDto } from "./simulationService";

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
  const [pois, tours, run] = await Promise.all([listPois(), listTours(), resolved ? getRunDetail(resolved) : Promise.resolve(null)]);
  return { pois, tours, run };
}
