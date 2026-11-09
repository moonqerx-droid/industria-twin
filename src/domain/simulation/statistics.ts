/** Статистика по репликациям: среднее, выборочное СКО, 95% доверительный интервал (t-распределение). */

// Квантили t-распределения t(0.975, df) для df = 1..30.
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tQuantile975(df: number): number {
  if (!Number.isFinite(df) || df < 1) return Number.NaN;
  const idx = Math.floor(df) - 1;
  if (idx < T_975.length) return T_975[idx]!;
  if (df < 60) return 2.0;
  if (df < 120) return 1.98;
  return 1.96;
}

export interface SummaryStats {
  /** Число репликаций, в которых показатель определён. */
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  /** Полуширина 95% доверительного интервала среднего; null при n < 2. */
  ci95: number | null;
}

export function summarize(values: Array<number | null>): SummaryStats {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: null, sd: null, min: null, max: null, ci95: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  const ci95 = sd !== null ? (tQuantile975(n - 1) * sd) / Math.sqrt(n) : null;
  return { n, mean, sd, min: Math.min(...xs), max: Math.max(...xs), ci95 };
}

export interface DifferenceStats {
  diff: number;
  /** Полуширина 95% ДИ разности средних (Уэлч); null — недостаточно данных. */
  ci95: number | null;
  /** true — 95% ДИ разности не содержит 0; null — оценить нельзя. */
  distinguishable: boolean | null;
}

/** Разность средних (after − before) с интервалом Уэлча. */
export function differenceOfMeans(before: SummaryStats, after: SummaryStats): DifferenceStats | null {
  if (before.mean === null || after.mean === null) return null;
  const diff = after.mean - before.mean;
  if (before.sd === null || after.sd === null || before.n < 2 || after.n < 2) {
    return { diff, ci95: null, distinguishable: null };
  }
  const v1 = before.sd ** 2 / before.n;
  const v2 = after.sd ** 2 / after.n;
  const se = Math.sqrt(v1 + v2);
  if (se === 0) return { diff, ci95: 0, distinguishable: diff !== 0 };
  const df = (v1 + v2) ** 2 / ((v1 * v1) / (before.n - 1) + (v2 * v2) / (after.n - 1));
  const half = tQuantile975(df) * se;
  return { diff, ci95: half, distinguishable: Math.abs(diff) > half };
}

/**
 * Парная разность (after_i − before_i) по репликациям с общими случайными числами.
 * Репликации с одинаковым номером используют одинаковые потоки случайных чисел, поэтому
 * разность считается внутри пары: дисперсия шума общей части сокращается.
 * Возвращает null, если пар меньше двух.
 */
export function pairedDifference(
  before: Array<number | null>,
  after: Array<number | null>,
): (DifferenceStats & { n: number }) | null {
  const diffs: number[] = [];
  const len = Math.min(before.length, after.length);
  for (let i = 0; i < len; i += 1) {
    const b = before[i];
    const a = after[i];
    if (b === null || b === undefined || a === null || a === undefined) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    diffs.push(a - b);
  }
  const s = summarize(diffs);
  if (s.n < 2 || s.mean === null || s.ci95 === null) return null;
  if (s.ci95 === 0) return { n: s.n, diff: s.mean, ci95: 0, distinguishable: s.mean !== 0 };
  return { n: s.n, diff: s.mean, ci95: s.ci95, distinguishable: Math.abs(s.mean) > s.ci95 };
}
