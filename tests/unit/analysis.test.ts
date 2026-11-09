import { describe, expect, it } from "vitest";
import { classifyStation, findBottleneck, rankBottlenecks } from "@/domain/analysis/bottleneck";
import { compareMetric } from "@/domain/analysis/comparison";
import { differenceOfMeans, summarize } from "@/domain/simulation/statistics";
import { createRng, deriveSeed } from "@/domain/simulation/rng";
import { sampleDuration } from "@/domain/simulation/distributions";
import { EventCalendar } from "@/domain/simulation/eventQueue";

const st = (id: string, utilization: number, extra: Partial<{ avgWaitMin: number; queueAtEnd: number; capacity: number }> = {}) => ({
  stationId: id,
  name: id,
  capacity: extra.capacity ?? 1,
  utilization,
  avgQueueLength: 0,
  avgWaitMin: extra.avgWaitMin ?? 0,
  queueAtEnd: extra.queueAtEnd ?? 0,
});

describe("Поиск узких мест", () => {
  it("классифицирует по порогам загрузки", () => {
    expect(classifyStation(st("a", 0.5))).toBe("normal");
    expect(classifyStation(st("a", 0.8))).toBe("high");
    expect(classifyStation(st("a", 0.95))).toBe("critical");
    expect(classifyStation(st("a", 0.6, { queueAtEnd: 6, capacity: 2 }))).toBe("critical");
  });
  it("узкое место — участок с максимальной загрузкой; при одинаковой загрузке решает ожидание", () => {
    const r = rankBottlenecks([st("a", 0.8, { avgWaitMin: 5 }), st("b", 0.8, { avgWaitMin: 12 }), st("c", 0.4)]);
    expect(r[0]!.stationId).toBe("b");
    expect(findBottleneck([st("a", 0.3), st("b", 0.5)])).toBeNull();
  });
});

describe("Статистика и сравнение", () => {
  it("summarize считает среднее, СКО и ДИ; пропускает null", () => {
    const s = summarize([1, 2, 3, null]);
    expect(s.n).toBe(3);
    expect(s.mean).toBe(2);
    expect(s.sd).toBeCloseTo(1);
    expect(s.ci95).toBeCloseTo((4.303 * 1) / Math.sqrt(3), 3);
    expect(summarize([null]).mean).toBeNull();
  });
  it("разность средних различима только при непересекающемся разбросе", () => {
    const a = summarize([10, 11, 9, 10, 10]);
    const b = summarize([20, 21, 19, 20, 20]);
    expect(differenceOfMeans(a, b)!.distinguishable).toBe(true);
    const c = summarize([10, 30, 5, 25, 15]);
    expect(differenceOfMeans(a, c)!.distinguishable).toBe(false);
  });
  it("вердикт учитывает направление улучшения", () => {
    const before = summarize([100, 101, 99, 100]);
    const after = summarize([80, 81, 79, 80]);
    expect(compareMetric("cycle", "lower", before, after).verdict).toBe("better");
    expect(compareMetric("output", "higher", before, after).verdict).toBe("worse");
    expect(compareMetric("x", "neutral", before, after).verdict).toBe("neutral");
    expect(compareMetric("cycle", "lower", before, after).relDiff).toBeCloseTo(-0.2, 3);
  });
  it("одиночный прогон: значимость не оценивается", () => {
    const r = compareMetric("cycle", "lower", summarize([100]), summarize([90]));
    expect(r.distinguishable).toBeNull();
    expect(r.verdict).toBe("better");
  });
  it("нулевое базовое значение: относительное изменение не определено", () => {
    const r = compareMetric("scrap", "lower", summarize([0, 0]), summarize([1, 2]));
    expect(r.relDiff).toBeNull();
  });
});

describe("Генератор случайных чисел и распределения", () => {
  it("детерминирован и равномерен на [0,1)", () => {
    const a = createRng(1);
    const b = createRng(1);
    let sum = 0;
    for (let i = 0; i < 10000; i += 1) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
    expect(deriveSeed(1, 1)).not.toBe(deriveSeed(1, 2));
  });
  it("выборки неотрицательны, среднее треугольного распределения близко к аналитическому", () => {
    const rng = createRng(5);
    let sum = 0;
    for (let i = 0; i < 20000; i += 1) {
      const v = sampleDuration({ kind: "triangular", min: 2, mode: 4, max: 9 }, rng);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(9);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(5, 1);
    for (let i = 0; i < 1000; i += 1) {
      expect(sampleDuration({ kind: "normal", mean: 1, sd: 5, min: 0 }, rng)).toBeGreaterThanOrEqual(0);
    }
  });
  it("календарь упорядочивает по времени, приоритету и порядку постановки", () => {
    const c = new EventCalendar<string>();
    c.schedule(5, 1, "b");
    c.schedule(5, 0, "a");
    c.schedule(1, 9, "first");
    c.schedule(5, 1, "c");
    c.schedule(Number.POSITIVE_INFINITY, 0, "never");
    const order: string[] = [];
    for (let e = c.pop(); e; e = c.pop()) order.push(e.payload);
    expect(order).toEqual(["first", "a", "b", "c"]);
  });
});
