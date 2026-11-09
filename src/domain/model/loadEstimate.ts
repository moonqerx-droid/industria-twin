import { distributionMean } from "../simulation/distributions";
import { MAIN_ROUTE, QUALITY_STATION, REWORK_STATION, STATION_IDS, type ScenarioParameters, type StationId } from "./demoData";

/**
 * Аналитическая (стационарная) оценка коэффициента загрузки ρ = λ · v · E[S] / c,
 * где v — ожидаемое число посещений участка одним изделием. Используется в студии сценариев
 * только как подсказка ДО запуска; фактическая загрузка определяется симуляцией и обычно ниже
 * из-за разгона системы в начале горизонта. При заданных отказах мощность умножается на
 * коэффициент готовности A = MTBF / (MTBF + MTTR).
 */
export function availabilityOf(f: { mtbfMin: number; mttrMin: number } | null | undefined): number {
  return f ? f.mtbfMin / (f.mtbfMin + f.mttrMin) : 1;
}

export function estimateLoads(p: ScenarioParameters): Record<StationId, number> {
  const lambdaPerMin = p.arrivalRatePerHour / 60;
  // Вероятность дойти до k-й проверки: P0 = 1, Pk = p · q^(k-1), k ≤ maxRework.
  let testVisits = 1;
  let reworkVisits = 0;
  let reach = p.defectProbability;
  for (let k = 1; k <= p.maxReworkCycles; k += 1) {
    reworkVisits += reach;
    testVisits += reach;
    reach *= p.retestDefectProbability;
  }
  const out = {} as Record<StationId, number>;
  for (const id of STATION_IDS) {
    const s = p.stations[id];
    let visits = MAIN_ROUTE.includes(id) ? 1 : 0;
    if (id === QUALITY_STATION) visits = testVisits;
    if (id === REWORK_STATION) visits = reworkVisits;
    out[id] = (lambdaPerMin * visits * distributionMean(s.processTime)) / (s.capacity * availabilityOf(s.failure));
  }
  return out;
}
