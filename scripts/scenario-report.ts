/**
 * Печатает таблицу результатов демонстрационных сценариев, рассчитанных движком (без БД).
 * Запуск: npm run report:scenarios
 */
import { DEMO_SCENARIOS } from "../src/domain/model/demoData";
import { buildSimulationConfig } from "../src/domain/model/scenarioConfig";
import { rankBottlenecks } from "../src/domain/analysis/bottleneck";
import { runReplications } from "../src/domain/simulation/replications";

const f = (v: number | null, d = 1) => (v === null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: d }));

console.log("Сценарий | Выпуск, шт. (±95% ДИ) | Цикл, мин | НЗП конец | ₽/шт. | Узкое место (загрузка)");
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
    })),
  );
  const top = ranking[0]!;
  console.log(
    `${sc.name} | ${f(a.completed.mean)} ± ${f(a.completed.ci95)} | ${f(a.cycleTimeAvgMin.mean)} ± ${f(a.cycleTimeAvgMin.ci95)} | ` +
      `${f(a.wipEnd.mean)} | ${f(a.costPerUnitRub.mean, 0)} | ${top.stationId} (${f(top.utilization * 100)}%, ${top.status})`,
  );
}
