import type { Rng } from "./rng";

/**
 * Распределения длительностей. Все значения — в минутах.
 * Отрицательные значения не допускаются: каждая выборка ограничивается снизу нулём
 * (для normal — заданным `min`), а сами параметры проверяются функцией validateDistribution.
 */
export type DurationDistribution =
  | { kind: "fixed"; value: number }
  | { kind: "exponential"; mean: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "triangular"; min: number; mode: number; max: number }
  | { kind: "normal"; mean: number; sd: number; min: number };

export type DistributionKind = DurationDistribution["kind"];

export const DISTRIBUTION_LABELS: Record<DistributionKind, string> = {
  fixed: "Детерминированное",
  exponential: "Экспоненциальное",
  uniform: "Равномерное",
  triangular: "Треугольное",
  normal: "Нормальное (усечённое)",
};

/** Возвращает список ошибок параметров распределения (пустой массив — параметры корректны). */
export function validateDistribution(d: DurationDistribution): string[] {
  const errors: string[] = [];
  const finite = (name: string, v: number) => {
    if (!Number.isFinite(v)) errors.push(`${name}: значение должно быть конечным числом`);
    else if (v < 0) errors.push(`${name}: значение не может быть отрицательным`);
  };
  switch (d.kind) {
    case "fixed":
      finite("value", d.value);
      break;
    case "exponential":
      finite("mean", d.mean);
      if (d.mean <= 0) errors.push("mean: среднее должно быть больше нуля");
      break;
    case "uniform":
      finite("min", d.min);
      finite("max", d.max);
      if (d.max < d.min) errors.push("max должно быть не меньше min");
      break;
    case "triangular":
      finite("min", d.min);
      finite("mode", d.mode);
      finite("max", d.max);
      if (!(d.min <= d.mode && d.mode <= d.max)) errors.push("должно выполняться min ≤ mode ≤ max");
      break;
    case "normal":
      finite("mean", d.mean);
      finite("sd", d.sd);
      finite("min", d.min);
      break;
  }
  return errors;
}

/** Аналитическое математическое ожидание (для normal — без учёта усечения). */
export function distributionMean(d: DurationDistribution): number {
  switch (d.kind) {
    case "fixed":
      return d.value;
    case "exponential":
      return d.mean;
    case "uniform":
      return (d.min + d.max) / 2;
    case "triangular":
      return (d.min + d.mode + d.max) / 3;
    case "normal":
      return Math.max(d.mean, d.min);
  }
}

function standardNormal(rng: Rng): number {
  // Преобразование Бокса — Мюллера; 1 - u исключает log(0).
  const u1 = 1 - rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleDuration(d: DurationDistribution, rng: Rng): number {
  let value: number;
  switch (d.kind) {
    case "fixed":
      value = d.value;
      break;
    case "exponential":
      value = -d.mean * Math.log(1 - rng.next());
      break;
    case "uniform":
      value = d.min + (d.max - d.min) * rng.next();
      break;
    case "triangular": {
      const { min, mode, max } = d;
      if (max === min) {
        value = min;
        break;
      }
      const u = rng.next();
      const fc = (mode - min) / (max - min);
      value =
        u < fc
          ? min + Math.sqrt(u * (max - min) * (mode - min))
          : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
      break;
    }
    case "normal":
      value = Math.max(d.min, d.mean + d.sd * standardNormal(rng));
      break;
  }
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Межприходный интервал (мин) для заданной интенсивности (заказов в час). */
export function sampleInterArrival(
  kind: "poisson" | "deterministic",
  ratePerHour: number,
  rng: Rng,
): number {
  if (ratePerHour <= 0) return Number.POSITIVE_INFINITY;
  const meanMin = 60 / ratePerHour;
  if (kind === "deterministic") return meanMin;
  return -meanMin * Math.log(1 - rng.next());
}
