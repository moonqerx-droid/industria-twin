import type { Prisma, Scenario, ScenarioStationParameter } from "@prisma/client";
import {
  PROCESS_ID,
  STATION_IDS,
  type ScenarioParameters,
  type StationId,
  type StationParameters,
} from "@/domain/model/demoData";
import type { DurationDistribution } from "@/domain/simulation/distributions";
import { prisma } from "@/server/db";
import { ApiError, notFound } from "@/server/http";
import type { ScenarioCreateInput, ScenarioUpdateInput } from "@/server/validation/schemas";

export interface ScenarioDto {
  id: string;
  name: string;
  description: string;
  isBaseline: boolean;
  isSynthetic: boolean;
  parentScenarioId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  parameters: ScenarioParameters;
  latestRun: { id: string; createdAt: string } | null;
  runCount: number;
}

type ScenarioWithParams = Scenario & {
  stationParameters: ScenarioStationParameter[];
  createdBy?: { displayName: string } | null;
  runs?: Array<{ id: string; createdAt: Date }>;
  _count?: { runs: number };
};

function req(v: number | null, field: string): number {
  if (v === null || v === undefined) throw new Error(`Повреждённые параметры сценария: нет поля ${field}`);
  return v;
}

export function rowToDistribution(row: ScenarioStationParameter): DurationDistribution {
  switch (row.distribution) {
    case "fixed":
      return { kind: "fixed", value: req(row.timeMean, "timeMean") };
    case "exponential":
      return { kind: "exponential", mean: req(row.timeMean, "timeMean") };
    case "uniform":
      return { kind: "uniform", min: req(row.timeMin, "timeMin"), max: req(row.timeMax, "timeMax") };
    case "triangular":
      return {
        kind: "triangular",
        min: req(row.timeMin, "timeMin"),
        mode: req(row.timeMode, "timeMode"),
        max: req(row.timeMax, "timeMax"),
      };
    case "normal":
      return { kind: "normal", mean: req(row.timeMean, "timeMean"), sd: req(row.timeSd, "timeSd"), min: req(row.timeMin, "timeMin") };
    default:
      throw new Error(`Неизвестное распределение ${row.distribution}`);
  }
}

export function distributionToColumns(d: DurationDistribution) {
  const empty = { timeMin: null, timeMode: null, timeMax: null, timeMean: null, timeSd: null };
  switch (d.kind) {
    case "fixed":
      return { distribution: d.kind, ...empty, timeMean: d.value };
    case "exponential":
      return { distribution: d.kind, ...empty, timeMean: d.mean };
    case "uniform":
      return { distribution: d.kind, ...empty, timeMin: d.min, timeMax: d.max };
    case "triangular":
      return { distribution: d.kind, ...empty, timeMin: d.min, timeMode: d.mode, timeMax: d.max };
    case "normal":
      return { distribution: d.kind, ...empty, timeMean: d.mean, timeSd: d.sd, timeMin: d.min };
  }
}

export function scenarioToParameters(s: ScenarioWithParams): ScenarioParameters {
  const stations = {} as Record<StationId, StationParameters>;
  for (const id of STATION_IDS) {
    const row = s.stationParameters.find((p) => p.stationId === id);
    if (!row) throw new Error(`Сценарий ${s.id}: нет параметров участка ${id}`);
    stations[id] = {
      capacity: row.capacity,
      processTime: rowToDistribution(row),
      hourlyCostRub: row.hourlyCostRub,
      consumablesPerOperationRub: row.consumablesPerOperationRub,
      failure: row.mtbfMin != null && row.mttrMin != null ? { mtbfMin: row.mtbfMin, mttrMin: row.mttrMin } : null,
    };
  }
  return {
    horizonMin: s.horizonMin,
    releaseWindowMin: s.releaseWindowMin,
    warmupMin: s.warmupMin,
    arrivalKind: s.arrivalKind === "deterministic" ? "deterministic" : "poisson",
    arrivalRatePerHour: s.arrivalRatePerHour,
    defectProbability: s.defectProbability,
    retestDefectProbability: s.retestDefectProbability,
    maxReworkCycles: s.maxReworkCycles,
    materialCostPerUnitRub: s.materialCostPerUnitRub,
    fixedCostRub: s.fixedCostRub,
    seed: s.seed,
    replications: s.replications,
    stations,
  };
}

function scalarColumns(p: ScenarioParameters) {
  return {
    horizonMin: p.horizonMin,
    releaseWindowMin: p.releaseWindowMin,
    warmupMin: p.warmupMin ?? 0,
    arrivalKind: p.arrivalKind,
    arrivalRatePerHour: p.arrivalRatePerHour,
    defectProbability: p.defectProbability,
    retestDefectProbability: p.retestDefectProbability,
    maxReworkCycles: p.maxReworkCycles,
    materialCostPerUnitRub: p.materialCostPerUnitRub,
    fixedCostRub: p.fixedCostRub,
    seed: p.seed,
    replications: p.replications,
  };
}

function stationRows(p: ScenarioParameters): Prisma.ScenarioStationParameterCreateWithoutScenarioInput[] {
  return STATION_IDS.map((id) => {
    const sp = p.stations[id];
    return {
      station: { connect: { id } },
      capacity: sp.capacity,
      hourlyCostRub: sp.hourlyCostRub,
      consumablesPerOperationRub: sp.consumablesPerOperationRub,
      mtbfMin: sp.failure?.mtbfMin ?? null,
      mttrMin: sp.failure?.mttrMin ?? null,
      ...distributionToColumns(sp.processTime),
    };
  });
}

const include = {
  stationParameters: true,
  createdBy: { select: { displayName: true } },
  runs: { where: { status: "completed" }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, createdAt: true } },
  _count: { select: { runs: true } },
} satisfies Prisma.ScenarioInclude;

function toDto(s: ScenarioWithParams): ScenarioDto {
  const latest = s.runs?.[0];
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    isBaseline: s.isBaseline,
    isSynthetic: s.isSynthetic,
    parentScenarioId: s.parentScenarioId,
    createdBy: s.createdBy?.displayName ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    parameters: scenarioToParameters(s),
    latestRun: latest ? { id: latest.id, createdAt: latest.createdAt.toISOString() } : null,
    runCount: s._count?.runs ?? 0,
  };
}

export async function listScenarios(): Promise<ScenarioDto[]> {
  const rows = await prisma.scenario.findMany({ include, orderBy: [{ isBaseline: "desc" }, { createdAt: "asc" }] });
  return rows.map(toDto);
}

export async function getScenario(id: string): Promise<ScenarioDto> {
  const row = await prisma.scenario.findUnique({ where: { id }, include });
  if (!row) throw notFound("Сценарий");
  return toDto(row);
}

export async function createScenario(input: ScenarioCreateInput, userId: string | null, parentId?: string): Promise<ScenarioDto> {
  const row = await prisma.scenario.create({
    data: {
      process: { connect: { id: PROCESS_ID } },
      name: input.name,
      description: input.description,
      isBaseline: false,
      isSynthetic: true,
      ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
      ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
      ...scalarColumns(input.parameters),
      stationParameters: { create: stationRows(input.parameters) },
    },
    include,
  });
  return toDto(row);
}

export async function updateScenario(id: string, input: ScenarioUpdateInput): Promise<ScenarioDto> {
  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing) throw notFound("Сценарий");
  if (existing.isBaseline && input.parameters) {
    throw new ApiError(409, "BASELINE_LOCKED", "Параметры базового сценария защищены от изменения. Создайте копию.");
  }
  const row = await prisma.$transaction(async (tx) => {
    if (input.parameters) {
      await tx.scenarioStationParameter.deleteMany({ where: { scenarioId: id } });
    }
    return tx.scenario.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parameters
          ? { ...scalarColumns(input.parameters), stationParameters: { create: stationRows(input.parameters) } }
          : {}),
      },
      include,
    });
  });
  return toDto(row);
}

export async function copyScenario(id: string, userId: string, name?: string): Promise<ScenarioDto> {
  const source = await getScenario(id);
  return createScenario(
    { name: name ?? `${source.name} (копия)`.slice(0, 120), description: source.description, parameters: source.parameters },
    userId,
    id,
  );
}

export async function deleteScenario(id: string): Promise<void> {
  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing) throw notFound("Сценарий");
  if (existing.isBaseline) throw new ApiError(409, "BASELINE_LOCKED", "Базовый сценарий нельзя удалить");
  await prisma.scenario.delete({ where: { id } });
}
