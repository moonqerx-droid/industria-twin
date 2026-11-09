import type { AggregateResult, StationResult } from "../simulation/types";

/** Направление улучшения показателя. */
export type MetricDirection = "higher" | "lower" | "neutral";

export interface MetricDefinition<K extends string> {
  key: K;
  label: string;
  unit: string;
  direction: MetricDirection;
  description: string;
  /** Множитель для отображения (например, доля → проценты). */
  displayScale?: number;
  digits: number;
}

export type AggregateMetricKey = keyof AggregateResult;

export const AGGREGATE_METRICS: Record<AggregateMetricKey, MetricDefinition<AggregateMetricKey>> = {
  released: { key: "released", label: "Запущено заданий", unit: "шт.", direction: "neutral", digits: 1, description: "Число производственных заданий, поступивших в систему за горизонт." },
  completed: { key: "completed", label: "Выпуск", unit: "шт.", direction: "higher", digits: 1, description: "Число изделий, прошедших все операции и отгруженных за горизонт." },
  scrapped: { key: "scrapped", label: "Списано", unit: "шт.", direction: "lower", digits: 1, description: "Изделия, не прошедшие контроль после максимального числа доработок." },
  wipEnd: { key: "wipEnd", label: "НЗП на конец горизонта", unit: "шт.", direction: "lower", digits: 1, description: "Изделия, оставшиеся в очередях и в обработке на момент окончания моделирования." },
  throughputPerHour: { key: "throughputPerHour", label: "Выпуск в час", unit: "шт./ч", direction: "higher", digits: 2, description: "Выпуск, делённый на длительность горизонта в часах." },
  cycleTimeAvgMin: { key: "cycleTimeAvgMin", label: "Средний цикл", unit: "мин", direction: "lower", digits: 1, description: "Среднее время от поступления задания до отгрузки (только завершённые изделия). Включает ожидание и обработку." },
  cycleTimeP50Min: { key: "cycleTimeP50Min", label: "Медиана цикла", unit: "мин", direction: "lower", digits: 1, description: "50-й перцентиль времени цикла завершённых изделий." },
  cycleTimeP90Min: { key: "cycleTimeP90Min", label: "Цикл, P90", unit: "мин", direction: "lower", digits: 1, description: "90-й перцентиль времени цикла завершённых изделий." },
  cycleTimeMaxMin: { key: "cycleTimeMaxMin", label: "Максимальный цикл", unit: "мин", direction: "lower", digits: 1, description: "Наибольшее время цикла среди завершённых изделий." },
  waitingTimeAvgMin: { key: "waitingTimeAvgMin", label: "Среднее ожидание", unit: "мин", direction: "lower", digits: 1, description: "Суммарное время в очередях на одно завершённое изделие." },
  processingTimeAvgMin: { key: "processingTimeAvgMin", label: "Среднее время обработки", unit: "мин", direction: "neutral", digits: 1, description: "Суммарное время операций (без ожидания) на одно завершённое изделие." },
  avgWip: { key: "avgWip", label: "Средний НЗП", unit: "шт.", direction: "lower", digits: 2, description: "Среднее по времени число изделий в системе." },
  avgQueueTotal: { key: "avgQueueTotal", label: "Суммарная средняя очередь", unit: "шт.", direction: "lower", digits: 2, description: "Сумма средневзвешенных по времени длин очередей всех участков." },
  utilizationAvg: { key: "utilizationAvg", label: "Средняя загрузка", unit: "%", direction: "neutral", displayScale: 100, digits: 1, description: "Σ интервалов занятости / Σ (вместимость × горизонт) по всем участкам." },
  qualityChecks: { key: "qualityChecks", label: "Проверок качества", unit: "шт.", direction: "neutral", digits: 1, description: "Число выполненных проверок качества (включая повторные)." },
  defectsFound: { key: "defectsFound", label: "Выявлено дефектов", unit: "шт.", direction: "lower", digits: 1, description: "Число проверок с обнаруженным дефектом." },
  defectRate: { key: "defectRate", label: "Доля брака", unit: "%", direction: "lower", displayScale: 100, digits: 1, description: "Выявленные дефекты / выполненные проверки." },
  reworkCount: { key: "reworkCount", label: "Циклов доработки", unit: "шт.", direction: "lower", digits: 1, description: "Число направлений изделий на устранение дефектов." },
  resourceCostRub: { key: "resourceCostRub", label: "Стоимость ресурсов", unit: "₽", direction: "lower", digits: 0, description: "Σ вместимость × горизонт (ч) × ставка часа доступности ресурса." },
  consumablesCostRub: { key: "consumablesCostRub", label: "Расходные материалы", unit: "₽", direction: "lower", digits: 0, description: "Σ начатых операций × расходные материалы на операцию." },
  materialCostRub: { key: "materialCostRub", label: "Компоненты", unit: "₽", direction: "neutral", digits: 0, description: "Запущенные задания × стоимость комплекта компонентов." },
  fixedCostRub: { key: "fixedCostRub", label: "Постоянные расходы", unit: "₽", direction: "neutral", digits: 0, description: "Накладные расходы за горизонт, заданные в сценарии." },
  totalCostRub: { key: "totalCostRub", label: "Полная стоимость", unit: "₽", direction: "lower", digits: 0, description: "Ресурсы + расходные материалы + компоненты + постоянные расходы." },
  idleCostRub: { key: "idleCostRub", label: "Стоимость простоя", unit: "₽", direction: "lower", digits: 0, description: "Часть стоимости ресурсов, приходящаяся на незанятое время (входит в стоимость ресурсов)." },
  costPerUnitRub: { key: "costPerUnitRub", label: "Стоимость единицы", unit: "₽/шт.", direction: "lower", digits: 0, description: "Полная стоимость / выпуск. Не определена при нулевом выпуске." },
  failures: { key: "failures", label: "Отказы оборудования", unit: "шт.", direction: "lower", digits: 1, description: "Число отказов единиц ресурса на всех участках за горизонт." },
  downtimeMin: { key: "downtimeMin", label: "Время в ремонте", unit: "мин", direction: "lower", digits: 0, description: "Суммарное время единиц ресурса в ремонте (станко-мин)." },
};

/** Ключевые показатели, отображаемые на дашборде и в сравнении по умолчанию. */
export const KEY_AGGREGATE_METRICS: AggregateMetricKey[] = [
  "completed",
  "throughputPerHour",
  "cycleTimeAvgMin",
  "waitingTimeAvgMin",
  "utilizationAvg",
  "avgWip",
  "wipEnd",
  "defectRate",
  "reworkCount",
  "totalCostRub",
  "costPerUnitRub",
  "downtimeMin",
];

export type StationMetricKey = Exclude<keyof StationResult, "stationId" | "name">;

export const STATION_METRICS: Record<StationMetricKey, MetricDefinition<StationMetricKey>> = {
  capacity: { key: "capacity", label: "Вместимость", unit: "ед.", direction: "neutral", digits: 0, description: "Число параллельных единиц ресурса." },
  operationsStarted: { key: "operationsStarted", label: "Начато операций", unit: "шт.", direction: "neutral", digits: 1, description: "Операции, начатые за горизонт." },
  operationsCompleted: { key: "operationsCompleted", label: "Выполнено операций", unit: "шт.", direction: "higher", digits: 1, description: "Операции, завершённые за горизонт." },
  busyMin: { key: "busyMin", label: "Время занятости", unit: "мин", direction: "neutral", digits: 0, description: "Интеграл числа занятых единиц ресурса по времени." },
  utilization: { key: "utilization", label: "Загрузка", unit: "%", direction: "neutral", displayScale: 100, digits: 1, description: "Время занятости / (вместимость × горизонт)." },
  avgQueueLength: { key: "avgQueueLength", label: "Средняя очередь", unit: "шт.", direction: "lower", digits: 2, description: "Средневзвешенная по времени длина очереди." },
  maxQueueLength: { key: "maxQueueLength", label: "Максимальная очередь", unit: "шт.", direction: "lower", digits: 1, description: "Наибольшая длина очереди за горизонт." },
  avgWaitMin: { key: "avgWaitMin", label: "Среднее ожидание", unit: "мин", direction: "lower", digits: 1, description: "Среднее ожидание в очереди на одну начатую операцию." },
  maxWaitMin: { key: "maxWaitMin", label: "Максимальное ожидание", unit: "мин", direction: "lower", digits: 1, description: "Наибольшее ожидание в очереди." },
  queueAtEnd: { key: "queueAtEnd", label: "Очередь на конец", unit: "шт.", direction: "lower", digits: 1, description: "Изделия в очереди в момент окончания горизонта." },
  inProcessAtEnd: { key: "inProcessAtEnd", label: "В обработке на конец", unit: "шт.", direction: "neutral", digits: 1, description: "Изделия в обработке в момент окончания горизонта." },
  throughputPerHour: { key: "throughputPerHour", label: "Производительность", unit: "оп./ч", direction: "higher", digits: 2, description: "Выполненные операции / горизонт (ч)." },
  resourceCostRub: { key: "resourceCostRub", label: "Стоимость ресурса", unit: "₽", direction: "lower", digits: 0, description: "Вместимость × горизонт (ч) × ставка." },
  consumablesCostRub: { key: "consumablesCostRub", label: "Расходные материалы", unit: "₽", direction: "lower", digits: 0, description: "Начатые операции × расходы на операцию." },
  idleCostRub: { key: "idleCostRub", label: "Стоимость простоя", unit: "₽", direction: "lower", digits: 0, description: "Стоимость незанятого времени ресурса." },
  peakBusy: { key: "peakBusy", label: "Пиковая занятость", unit: "ед.", direction: "neutral", digits: 0, description: "Максимум одновременно занятых единиц ресурса." },
  failures: { key: "failures", label: "Отказы", unit: "шт.", direction: "lower", digits: 1, description: "Число отказов единиц ресурса участка за горизонт." },
  downtimeMin: { key: "downtimeMin", label: "Время в ремонте", unit: "мин", direction: "lower", digits: 0, description: "Интеграл числа единиц в ремонте по времени (станко-мин)." },
  availability: { key: "availability", label: "Доступность", unit: "%", direction: "higher", displayScale: 100, digits: 1, description: "1 − время в ремонте / (вместимость × горизонт)." },
};

export const KEY_STATION_METRICS: StationMetricKey[] = [
  "utilization",
  "avgQueueLength",
  "maxQueueLength",
  "avgWaitMin",
  "throughputPerHour",
  "queueAtEnd",
  "resourceCostRub",
];

export function formatMetricValue(def: MetricDefinition<string>, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const scaled = value * (def.displayScale ?? 1);
  return scaled.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: def.digits });
}
