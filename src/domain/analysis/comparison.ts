import type { MetricDirection } from "../model/metrics";
import { differenceOfMeans, pairedDifference, type SummaryStats } from "../simulation/statistics";

export type ChangeVerdict = "better" | "worse" | "unchanged" | "neutral" | "undetermined";

export interface MetricComparison {
  key: string;
  before: number | null;
  after: number | null;
  absDiff: number | null;
  /** Относительное изменение (доля); null, если базовое значение равно 0 или не определено. */
  relDiff: number | null;
  ci95: number | null;
  /** true — разность статистически различима на уровне 95% по репликациям. */
  distinguishable: boolean | null;
  verdict: ChangeVerdict;
  /** Метод оценки различимости: парный (CRN) или Уэлча для независимых выборок. */
  method: "paired" | "welch";
}

/**
 * Сравнивает средние двух прогонов по одному показателю.
 * Вердикт «лучше/хуже» выносится только с учётом направления улучшения; если репликаций
 * достаточно и 95% ДИ разности содержит ноль — вердикт «без значимых изменений».
 */
export function compareMetric(
  key: string,
  direction: MetricDirection,
  before: SummaryStats,
  after: SummaryStats,
  /** Значения по репликациям (одинаковые номера — одинаковые потоки CRN); если заданы — парное сравнение. */
  paired?: { before: Array<number | null>; after: Array<number | null> },
): MetricComparison {
  const p = paired ? pairedDifference(paired.before, paired.after) : null;
  const method: "paired" | "welch" = p ? "paired" : "welch";
  // Разность выводим как разность средних (совпадает с парной при одинаковом наборе репликаций),
  // а полуширину ДИ и различимость — по выбранному методу.
  const welch = differenceOfMeans(before, after);
  const d = welch && p ? { diff: welch.diff, ci95: p.ci95, distinguishable: p.ci95 === null ? null : Math.abs(welch.diff) > p.ci95 } : welch;
  if (!d) {
    return {
      key,
      before: before.mean,
      after: after.mean,
      absDiff: null,
      relDiff: null,
      ci95: null,
      distinguishable: null,
      verdict: "undetermined",
      method,
    };
  }
  const base = before.mean as number;
  const relDiff = base !== 0 ? d.diff / Math.abs(base) : null;
  let verdict: ChangeVerdict;
  if (direction === "neutral") verdict = "neutral";
  else if (d.diff === 0 || d.distinguishable === false) verdict = "unchanged";
  else {
    const improved = direction === "higher" ? d.diff > 0 : d.diff < 0;
    verdict = improved ? "better" : "worse";
  }
  return {
    key,
    before: before.mean,
    after: after.mean,
    absDiff: d.diff,
    relDiff,
    ci95: d.ci95,
    distinguishable: d.distinguishable,
    verdict,
    method,
  };
}

export const VERDICT_LABELS: Record<ChangeVerdict, string> = {
  better: "Улучшение",
  worse: "Ухудшение",
  unchanged: "Без значимых изменений",
  neutral: "Справочно",
  undetermined: "Нет данных",
};
