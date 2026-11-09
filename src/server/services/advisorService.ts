import { adviseResources, type AdvisorResult } from "@/domain/analysis/advisor";
import { capacityCurve, type CapacityCurve } from "@/domain/analysis/capacity";
import { prisma } from "@/server/db";
import { notFound } from "@/server/http";
import type { ScenarioParameters } from "@/domain/model/demoData";

export interface AdviceDto extends AdvisorResult {
  runId: string;
  scenarioName: string;
}

/** Кэш результатов в памяти процесса: ключ — снимок параметров прогона (результат детерминирован). */
const cache = new Map<string, AdvisorResult>();
const CACHE_LIMIT = 32;

export async function getAdvice(runId: string): Promise<AdviceDto> {
  const run = await prisma.simulationRun.findUnique({ where: { id: runId }, select: { id: true, configJson: true, scenarioName: true } });
  if (!run) throw notFound("Прогон моделирования");
  let result = cache.get(run.configJson);
  if (!result) {
    result = adviseResources(JSON.parse(run.configJson) as ScenarioParameters);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(run.configJson, result);
  }
  return { ...result, runId: run.id, scenarioName: run.scenarioName };
}

export interface CapacityDto extends CapacityCurve {
  runId: string;
  scenarioName: string;
}

const capacityCache = new Map<string, CapacityCurve>();

/** Кривая пропускной способности для параметров прогона (детерминирована, кэшируется по снимку параметров). */
export async function getCapacityCurve(runId: string): Promise<CapacityDto> {
  const run = await prisma.simulationRun.findUnique({ where: { id: runId }, select: { id: true, configJson: true, scenarioName: true } });
  if (!run) throw notFound("Прогон моделирования");
  let result = capacityCache.get(run.configJson);
  if (!result) {
    result = capacityCurve(JSON.parse(run.configJson) as ScenarioParameters);
    if (capacityCache.size >= CACHE_LIMIT) capacityCache.delete(capacityCache.keys().next().value!);
    capacityCache.set(run.configJson, result);
  }
  return { ...result, runId: run.id, scenarioName: run.scenarioName };
}
