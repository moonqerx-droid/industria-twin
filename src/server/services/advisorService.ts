import { adviseResources, type AdvisorResult } from "@/domain/analysis/advisor";
import { capacityCurve, type CapacityCurve } from "@/domain/analysis/capacity";
import { prisma } from "@/server/db";
import { ApiError, notFound } from "@/server/http";
import type { ScenarioParameters } from "@/domain/model/demoData";

export interface AdviceDto extends AdvisorResult {
  runId: string;
  scenarioName: string;
}

/**
 * Предел вычислительной стоимости одного запроса (ожидаемое число изделий во всех прогонах).
 * Базовый сценарий: советник ≈ 14 тыс., кривая мощности ≈ 10 тыс. Предел защищает сервер от
 * намеренно тяжёлых сценариев, ведь расчёт выполняется синхронно в обработчике запроса.
 */
export const MAX_ANALYSIS_JOBS = 400_000;

function assertAffordable(p: ScenarioParameters, runs: number, rateFactor = 1): void {
  const jobs = ((p.arrivalRatePerHour * rateFactor * Math.min(p.releaseWindowMin, p.horizonMin)) / 60) * runs;
  if (jobs > MAX_ANALYSIS_JOBS)
    throw new ApiError(422, "ANALYSIS_TOO_HEAVY", "Сценарий слишком тяжёл для автоматического анализа: уменьшите горизонт, интенсивность или число репликаций");
}

/** Кэш результатов в памяти процесса: ключ — снимок параметров прогона (результат детерминирован). */
const cache = new Map<string, AdvisorResult>();
const CACHE_LIMIT = 32;

export async function getAdvice(runId: string): Promise<AdviceDto> {
  const run = await prisma.simulationRun.findUnique({ where: { id: runId }, select: { id: true, configJson: true, scenarioName: true } });
  if (!run) throw notFound("Прогон моделирования");
  let result = cache.get(run.configJson);
  if (!result) {
    const p = JSON.parse(run.configJson) as ScenarioParameters;
    assertAffordable(p, Math.max(2, p.replications) * 8);
    result = adviseResources(p);
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
    const p = JSON.parse(run.configJson) as ScenarioParameters;
    assertAffordable(p, 10 * 10, 1.05);
    result = capacityCurve(p);
    if (capacityCache.size >= CACHE_LIMIT) capacityCache.delete(capacityCache.keys().next().value!);
    capacityCache.set(run.configJson, result);
  }
  return { ...result, runId: run.id, scenarioName: run.scenarioName };
}
