/**
 * Печатает таблицу результатов демонстрационных сценариев, рассчитанных движком (без БД).
 * Запуск: npm run report:scenarios
 */
import { DEMO_SCENARIOS } from "../src/domain/model/demoData";
import { buildSimulationConfig } from "../src/domain/model/scenarioConfig";
import { rankBottlenecks } from "../src/domain/analysis/bottleneck";
import { runReplications } from "../src/domain/simulation/replications";

const f = (v: number | null, d = 1) => (v === null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: d }));

console.log("Сценарий | Выпуск, шт. (±95% ДИ) | Цикл, мин | НЗП конец | ₽/шт. | Узкое место (загрузка + ремонт, статус)");
for (const sc of DEMO_SCENARIOS) {
  const r = runReplications(buildSimulationConfig(sc.parameters), sc.parameters.replications);
  const a = r.aggregate;
  const ranking = rankBottlenecks(
    Object.entries(r.stations).map(([id, m]) => ({
      stationId: id,
      name: id,
      capacity: m.capacity.mean ?? 1,
      utilization: m.utilization.mean ?? 0,
      avgQueueLength: m.avgQueueLength.mean ?? 0,
      avgWaitMin: m.avgWaitMin.mean ?? 0,
      queueAtEnd: m.queueAtEnd.mean ?? 0,
      downtimeShare: 1 - (m.availability?.mean ?? 1),
    })),
  );
  const top = ranking[0]!;
  console.log(
    `${sc.name} | ${f(a.completed.mean)} ± ${f(a.completed.ci95)} | ${f(a.cycleTimeAvgMin.mean)} ± ${f(a.cycleTimeAvgMin.ci95)} | ` +
      `${f(a.wipEnd.mean)} | ${f(a.costPerUnitRub.mean, 0)} | ${top.stationId} (${f(top.utilization * 100)}%` +
      `${(r.stations[top.stationId]!.availability.mean ?? 1) < 0.995 ? ` + ${f((1 - (r.stations[top.stationId]!.availability.mean ?? 1)) * 100)}%` : ""}, ${top.status})`,
  );
}

// Сравнение с базовым сценарием: парное (CRN) против независимых выборок (Уэлч).
import { differenceOfMeans, pairedDifference } from "../src/domain/simulation/statistics";
const baseSc = DEMO_SCENARIOS.find((s) => s.isBaseline)!;
const baseRun = runReplications(buildSimulationConfig(baseSc.parameters), baseSc.parameters.replications);
const metricKeys = ["completed", "cycleTimeAvgMin", "wipEnd", "costPerUnitRub"] as const;
console.log("\nСравнение с базовым: Δ ± полуширина 95% ДИ (парное CRN | Уэлч); * — различимо");
for (const sc of DEMO_SCENARIOS.filter((s) => !s.isBaseline)) {
  const r = runReplications(buildSimulationConfig(sc.parameters), sc.parameters.replications);
  const cells = metricKeys.map((k) => {
    const p = pairedDifference(
      baseRun.replications.map((x) => x.aggregate[k]),
      r.replications.map((x) => x.aggregate[k]),
    );
    const w = differenceOfMeans(baseRun.aggregate[k], r.aggregate[k]);
    const mark = (d: { distinguishable: boolean | null } | null) => (d?.distinguishable ? "*" : "");
    return `${k}: ${f(p?.diff ?? null)} ± ${f(p?.ci95 ?? null)}${mark(p)} | ± ${f(w?.ci95 ?? null)}${mark(w)}`;
  });
  console.log(`${sc.name}\n  ${cells.join("\n  ")}`);
}
