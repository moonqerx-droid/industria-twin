/**
 * Классификация состояния участков и поиск узкого места по рассчитанным метрикам.
 * Правила детерминированы и описаны в docs/ARCHITECTURE.md (раздел «Аналитика»).
 */
export type StationStatus = "normal" | "high" | "critical";

export const STATUS_THRESHOLDS = {
  /** Загрузка, начиная с которой участок считается высоконагруженным. */
  high: 0.75,
  /** Загрузка, начиная с которой участок считается критическим. */
  critical: 0.9,
  /** Очередь на конец горизонта (в единицах вместимости), сигнализирующая о накоплении. */
  queueGrowthPerCapacity: 2,
} as const;

export const STATUS_LABELS: Record<StationStatus, string> = {
  normal: "Норма",
  high: "Высокая загрузка",
  critical: "Перегрузка",
};

export interface StationLoadInput {
  stationId: string;
  name: string;
  capacity: number;
  utilization: number;
  avgQueueLength: number;
  avgWaitMin: number;
  queueAtEnd: number;
}

export function classifyStation(s: StationLoadInput): StationStatus {
  const accumulating = s.queueAtEnd >= STATUS_THRESHOLDS.queueGrowthPerCapacity * s.capacity && s.queueAtEnd >= 3;
  if (s.utilization >= STATUS_THRESHOLDS.critical || accumulating) return "critical";
  if (s.utilization >= STATUS_THRESHOLDS.high) return "high";
  return "normal";
}

export interface BottleneckFinding {
  stationId: string;
  name: string;
  status: StationStatus;
  utilization: number;
  avgQueueLength: number;
  avgWaitMin: number;
  queueAtEnd: number;
  rank: number;
  explanation: string;
}

function pct(x: number): string {
  return `${(x * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}
function num(x: number, d = 1): string {
  return x.toLocaleString("ru-RU", { maximumFractionDigits: d });
}

/**
 * Ранжирует участки: сначала по статусу, затем по загрузке, затем по среднему ожиданию.
 * Узким местом считается участок с рангом 1, если его статус не «норма».
 */
export function rankBottlenecks(stations: StationLoadInput[]): BottleneckFinding[] {
  const order: Record<StationStatus, number> = { critical: 0, high: 1, normal: 2 };
  return stations
    .map((s) => ({ s, status: classifyStation(s) }))
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        b.s.utilization - a.s.utilization ||
        b.s.avgWaitMin - a.s.avgWaitMin ||
        a.s.stationId.localeCompare(b.s.stationId),
    )
    .map(({ s, status }, i) => ({
      stationId: s.stationId,
      name: s.name,
      status,
      utilization: s.utilization,
      avgQueueLength: s.avgQueueLength,
      avgWaitMin: s.avgWaitMin,
      queueAtEnd: s.queueAtEnd,
      rank: i + 1,
      explanation:
        `${s.name}: загрузка ${pct(s.utilization)}, средняя очередь ${num(s.avgQueueLength, 2)} шт., ` +
        `среднее ожидание ${num(s.avgWaitMin)} мин, в очереди на конец горизонта ${num(s.queueAtEnd)} шт.`,
    }));
}

export function findBottleneck(stations: StationLoadInput[]): BottleneckFinding | null {
  const top = rankBottlenecks(stations)[0];
  return top && top.status !== "normal" ? top : null;
}
