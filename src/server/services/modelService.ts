import { FACTORY_ID, PROCESS_ID } from "@/domain/model/demoData";
import { prisma } from "@/server/db";
import { notFound } from "@/server/http";

export interface StationDto {
  id: string;
  code: string;
  name: string;
  shortName: string;
  zone: string;
  kind: string;
  description: string;
  sortOrder: number;
  resources: Array<{ id: string; name: string; kind: string; unitName: string; description: string }>;
  poiId: string | null;
}

export interface ProductionModelDto {
  factory: { id: string; name: string; description: string; isSynthetic: boolean };
  process: { id: string; name: string; version: number };
  stations: StationDto[];
  nodes: Array<{ id: string; type: string; name: string; stationId: string | null; x: number; y: number }>;
  edges: Array<{ id: string; from: string; to: string; label: string | null; condition: string }>;
}

export async function getProductionModel(): Promise<ProductionModelDto> {
  const factory = await prisma.factory.findUnique({ where: { id: FACTORY_ID } });
  const process = await prisma.productionProcess.findUnique({
    where: { id: PROCESS_ID },
    include: { nodes: true, edges: true },
  });
  if (!factory || !process) throw notFound("Производственная модель");
  const stations = await prisma.station.findMany({
    where: { factoryId: FACTORY_ID },
    include: { resources: true, pois: { select: { id: true } } },
    orderBy: { sortOrder: "asc" },
  });
  return {
    factory: { id: factory.id, name: factory.name, description: factory.description, isSynthetic: factory.isSynthetic },
    process: { id: process.id, name: process.name, version: process.version },
    stations: stations.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      shortName: s.shortName,
      zone: s.zone,
      kind: s.kind,
      description: s.description,
      sortOrder: s.sortOrder,
      resources: s.resources.map((r) => ({ id: r.id, name: r.name, kind: r.kind, unitName: r.unitName, description: r.description })),
      poiId: s.pois[0]?.id ?? null,
    })),
    nodes: process.nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, stationId: n.stationId, x: n.x, y: n.y })),
    edges: process.edges.map((e) => ({ id: e.id, from: e.fromNodeId, to: e.toNodeId, label: e.label, condition: e.condition })),
  };
}

export async function listResources() {
  return prisma.resource.findMany({ include: { station: { select: { name: true, code: true } } }, orderBy: { stationId: "asc" } });
}
