import type { DurationDistribution } from "./distributions";

/** Версия движка: сохраняется с каждым прогоном для воспроизводимости. */
export const ENGINE_VERSION = "1.1.0";

/** Версии движка, использующие общие случайные числа (CRN) и допускающие парное сравнение репликаций. */
export function engineSupportsCrn(version: string): boolean {
  const [maj = 0, min = 0] = version.split(".").map(Number);
  return maj > 1 || (maj === 1 && min >= 1);
}

/** Жёсткие ограничения безопасности движка. */
export const ENGINE_LIMITS = {
  maxHorizonMin: 7 * 24 * 60,
  maxCapacity: 50,
  maxReworkCycles: 5,
  maxArrivalRatePerHour: 120,
  maxEvents: 2_000_000,
  maxRecordedEvents: 60_000,
} as const;

export type ArrivalProcess = {
  /** poisson — экспоненциальные межприходные интервалы; deterministic — равные интервалы. */
  kind: "poisson" | "deterministic";
  /** Интенсивность поступления производственных заданий, шт./ч. */
  ratePerHour: number;
};

export interface StationConfig {
  stationId: string;
  name: string;
  /** Число параллельных единиц ресурса (станков/постов/стендов), шт. */
  capacity: number;
  /** Длительность одной операции, мин. */
  processTime: DurationDistribution;
  /** Стоимость часа доступности одной единицы ресурса (труд + амортизация + энергия), ₽/ч. */
  hourlyCostRub: number;
  /** Расходные материалы на одну начатую операцию, ₽. */
  consumablesPerOperationRub: number;
  /** Отказы оборудования; null/undefined — без отказов. */
  failure?: FailureConfig | null;
}

/**
 * Отказы оборудования (неупреждающая модель): отказы участка образуют пуассоновский поток
 * с интенсивностью capacity / MTBF; отказавшая единица выводится из работы после завершения
 * текущей операции и возвращается через экспоненциальное время ремонта со средним MTTR.
 */
export interface FailureConfig {
  /** Средняя наработка на отказ одной единицы ресурса, мин. */
  mtbfMin: number;
  /** Среднее время восстановления, мин. */
  mttrMin: number;
}

export interface QualityGateConfig {
  /** Станция, после которой выполняется контроль качества. */
  stationId: string;
  /** Станция устранения дефектов, после которой изделие возвращается на контроль. */
  reworkStationId: string;
  /** Вероятность брака при первичном контроле, доля 0..1. */
  defectProbability: number;
  /** Вероятность брака при повторном контроле после доработки, доля 0..1. */
  retestDefectProbability: number;
  /** Максимум циклов доработки; при превышении изделие списывается. */
  maxReworkCycles: number;
}

export interface SimulationConfig {
  /** Горизонт моделирования, мин. */
  horizonMin: number;
  /** Момент прекращения запуска новых заданий, мин (по умолчанию = горизонт). */
  arrivalStopMin?: number;
  /**
   * Период разгона, мин (по умолчанию 0). Статистика собирается только на интервале [разгон, горизонт]:
   * в момент окончания разгона счётчики и интегралы обнуляются, показатели нормируются на окно наблюдения.
   */
  warmupMin?: number;
  arrival: ArrivalProcess;
  /** Основной маршрут изделия: упорядоченный список stationId. */
  route: string[];
  stations: StationConfig[];
  quality: QualityGateConfig | null;
  /** Стоимость комплекта компонентов на одно запущенное задание, ₽. */
  materialCostPerUnitRub: number;
  /** Постоянные расходы за горизонт (накладные), ₽. */
  fixedCostRub: number;
  seed: number;
  /** Записывать ли журнал событий (нужен для воспроизведения). */
  recordEvents?: boolean;
  /** Шаг дискретизации кадров состояния, мин. */
  snapshotIntervalMin?: number;
}

export const EVENT_TYPES = [
  "ARRIVAL",
  "QUEUE_ENTER",
  "PROCESS_START",
  "PROCESS_FINISH",
  "QUALITY_CHECK",
  "REWORK",
  "SCRAP",
  "DEPARTURE",
  "HORIZON_END",
  // Добавлены в 1.1.0 в конец списка: индексы прежних типов в сжатом журнале не меняются.
  "BREAKDOWN",
  "REPAIR",
] as const;
export type SimulationEventType = (typeof EVENT_TYPES)[number];

export interface SimulationEvent {
  /** Модельное время, мин. */
  t: number;
  type: SimulationEventType;
  unitId: number;
  stationId: string | null;
  /** Для QUALITY_CHECK: true — дефект обнаружен. */
  defect?: boolean;
}

export type UnitOutcome = "COMPLETED" | "SCRAPPED" | "WIP";

export interface UnitRecord {
  unitId: number;
  arrivalMin: number;
  /** Время выхода из системы (отгрузка или списание); null — изделие осталось в НЗП. */
  exitMin: number | null;
  outcome: UnitOutcome;
  waitingMin: number;
  processingMin: number;
  reworkCycles: number;
}

export interface StationResult {
  stationId: string;
  name: string;
  capacity: number;
  operationsStarted: number;
  operationsCompleted: number;
  /** Интеграл занятости, станко-мин. */
  busyMin: number;
  /** Загрузка = busyMin / (capacity × горизонт), доля 0..1. */
  utilization: number;
  avgQueueLength: number;
  maxQueueLength: number;
  avgWaitMin: number;
  maxWaitMin: number;
  queueAtEnd: number;
  inProcessAtEnd: number;
  throughputPerHour: number;
  resourceCostRub: number;
  consumablesCostRub: number;
  idleCostRub: number;
  /** Пиковое число одновременно обслуживаемых заданий (для проверки вместимости). */
  peakBusy: number;
  /** Число отказов оборудования за горизонт. */
  failures: number;
  /** Интеграл числа единиц в ремонте по времени, станко-мин. */
  downtimeMin: number;
  /** Доступность = 1 − downtimeMin / (capacity × горизонт), доля 0..1. */
  availability: number;
}

export interface Snapshot {
  t: number;
  wip: number;
  completed: number;
  scrapped: number;
  /** stationId → [в очереди, в обработке, в ремонте] */
  stations: Record<string, [number, number, number]>;
}

export interface AggregateResult {
  released: number;
  completed: number;
  scrapped: number;
  wipEnd: number;
  throughputPerHour: number;
  cycleTimeAvgMin: number | null;
  cycleTimeP50Min: number | null;
  cycleTimeP90Min: number | null;
  cycleTimeMaxMin: number | null;
  waitingTimeAvgMin: number | null;
  processingTimeAvgMin: number | null;
  avgWip: number;
  avgQueueTotal: number;
  utilizationAvg: number;
  qualityChecks: number;
  defectsFound: number;
  defectRate: number | null;
  reworkCount: number;
  resourceCostRub: number;
  consumablesCostRub: number;
  materialCostRub: number;
  fixedCostRub: number;
  totalCostRub: number;
  idleCostRub: number;
  costPerUnitRub: number | null;
  /** Отказы оборудования по всем участкам. */
  failures: number;
  /** Суммарное время единиц ресурса в ремонте, мин. */
  downtimeMin: number;
}

export interface SimulationResult {
  engineVersion: string;
  seed: number;
  horizonMin: number;
  /** Период разгона, исключённый из статистики, мин. */
  warmupMin: number;
  aggregate: AggregateResult;
  stations: StationResult[];
  units: UnitRecord[];
  snapshots: Snapshot[];
  events: SimulationEvent[];
  eventsTruncated: boolean;
  processedEvents: number;
}
