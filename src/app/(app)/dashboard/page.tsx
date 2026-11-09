import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { RunPicker } from "@/components/layout/RunPicker";
import { CostBreakdown } from "@/components/charts/CostBreakdown";
import { StationQueueChart } from "@/components/charts/StationQueueChart";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { UtilizationChart } from "@/components/charts/UtilizationChart";
import { StationPanel } from "@/components/process/StationPanel";
import { StationTable } from "@/components/process/StationTable";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { Panel } from "@/components/ui/Panel";
import { SyntheticNote } from "@/components/ui/SyntheticNote";
import { AGGREGATE_METRICS, formatMetricValue, type AggregateMetricKey } from "@/domain/model/metrics";
import { fmtDateTime, fmtMinutes, fmtNumber } from "@/lib/format";
import { buildStationViews } from "@/lib/views";
import { getProductionModel } from "@/server/services/modelService";
import { getReplay, getRunDetail, latestRunPerScenario, listRuns, resolveRunId } from "@/server/services/simulationService";

export const metadata: Metadata = { title: "Дашборд" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runParam } = await searchParams;
  const runId = await resolveRunId(runParam ?? null).catch(() => null);
  const model = await getProductionModel();
  if (!runId) {
    return (
      <>
        <PageHeader title="Дашборд производства" />
        <EmptyState title="Расчётов пока нет" action={<LinkButton href="/scenarios" variant="primary">Открыть студию сценариев</LinkButton>}>
          Запустите моделирование любого сценария — показатели появятся здесь автоматически.
        </EmptyState>
      </>
    );
  }
  const [run, replay, runs, latest] = await Promise.all([getRunDetail(runId), getReplay(runId), listRuns({ limit: 40 }), latestRunPerScenario()]);
  const stations = buildStationViews(model, run);
  const a = run.aggregate;
  const val = (k: AggregateMetricKey) => formatMetricValue(AGGREGATE_METRICS[k], a[k]?.mean);
  const ci = (k: AggregateMetricKey) => {
    const s = a[k];
    return s?.ci95 != null ? `± ${formatMetricValue(AGGREGATE_METRICS[k], s.ci95)} (95% ДИ, ${s.n} репл.)` : undefined;
  };
  const bottleneck = run.bottleneck;
  const wip = replay.snapshots.map((s) => ({ t: s.t, v: s.wip }));
  const output = replay.snapshots.map((s) => ({ t: s.t, v: s.completed }));
  const queues: Record<string, Array<{ t: number; v: number }>> = {};
  for (const st of model.stations) queues[st.id] = replay.snapshots.map((s) => ({ t: s.t, v: s.stations[st.id]?.[0] ?? 0 }));
  const names = Object.fromEntries(model.stations.map((s) => [s.id, `${s.code} ${s.name}`]));
  const costTotal = a.totalCostRub?.mean ?? 0;

  return (
    <>
      <PageHeader
        title="Дашборд производства"
        description={
          <>
            {run.scenarioName}: горизонт {fmtMinutes(run.horizonMin)}, {run.replications} репликаций, расчёт от {fmtDateTime(run.createdAt)}
          </>
        }
        actions={<RunPicker runs={runs} currentId={run.id} />}
      />

      <div className="kpi-strip grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Выпуск за горизонт" value={val("completed")} unit="шт." hint={ci("completed")} />
        <Kpi label="Выпуск в час" value={val("throughputPerHour")} unit="шт./ч" hint={ci("throughputPerHour")} />
        <Kpi label="Средний цикл" value={val("cycleTimeAvgMin")} unit="мин" hint={ci("cycleTimeAvgMin")} />
        <Kpi label="Средняя загрузка" value={val("utilizationAvg")} unit="%" hint="по всем участкам, взвешенно" />
        <Kpi label="НЗП на конец" value={val("wipEnd")} unit="шт." hint={ci("wipEnd")} tone={(a.wipEnd?.mean ?? 0) > 15 ? "warn" : "default"} />
        <Kpi label="Стоимость единицы" value={val("costPerUnitRub")} unit="₽" hint={ci("costPerUnitRub")} />
      </div>

      <div className="mt-6 space-y-6">
          {bottleneck ? (
            <section className="panel-surface flex gap-4 rounded-[var(--radius-panel)] border border-line border-l-[3px] border-l-warn bg-white p-4 sm:p-5" aria-labelledby="bn-title">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fbf1e1] text-warn" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3 2.5 16h15L10 3Z" strokeLinejoin="round" /><path d="M10 8v3.6M10 13.8v.2" /></svg>
              </span>
              <div className="min-w-0">
                <h2 id="bn-title" className="font-semibold">Узкое место: {bottleneck.name}</h2>
                <p className="mt-1 text-sm text-muted">{bottleneck.explanation}</p>
                <p className="mt-2 text-xs text-faint">
                  Правило: участок с максимальной загрузкой среди перегруженных (≥ 90%) или высоконагруженных (≥ 75%). Изменение
                  мощности этого участка — гипотеза для проверки в студии сценариев, а не готовый вывод.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <LinkButton href={`/factory?station=${bottleneck.stationId}&run=${run.id}`}>Показать в 3D</LinkButton>
                  <LinkButton href={`/process?station=${bottleneck.stationId}&run=${run.id}`}>На мнемосхеме</LinkButton>
                  <LinkButton href="/scenarios" variant="ghost">Проверить сценарий</LinkButton>
                </div>
              </div>
            </section>
          ) : (
            <Panel title="Узких мест не обнаружено">
              <p className="text-sm text-muted">Загрузка всех участков ниже 75%, очереди не накапливаются.</p>
            </Panel>
          )}

          <Panel title="Участки производства" subtitle="Средние по репликациям. Выберите строку, чтобы открыть метрики участка.">
            <StationTable stations={stations} />
          </Panel>

      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Загрузка участков, %" subtitle="Пунктир — пороги 75% и 90%">
              <UtilizationChart
                data={stations.map((s) => ({
                  stationId: s.stationId,
                  code: s.code,
                  name: s.name,
                  utilization: s.metrics.utilization?.mean ?? 0,
                  ci95: s.metrics.utilization?.ci95 ?? null,
                  status: s.status ?? "normal",
                }))}
              />
            </Panel>
            <Panel title="Очередь перед участком, шт." subtitle={`Репликация №1, seed ${run.baseSeed}`}>
              <StationQueueChart series={queues} names={names} defaultStationId={bottleneck?.stationId ?? model.stations[0]!.id} />
            </Panel>
            <Panel title="Изделий в системе (НЗП), шт." subtitle={`Репликация №1, seed ${run.baseSeed}`}>
              <TimeSeriesChart data={wip} unit="шт." label="НЗП" />
            </Panel>
            <Panel title="Накопленный выпуск, шт." subtitle={`Репликация №1, seed ${run.baseSeed}`}>
              <TimeSeriesChart data={output} unit="шт." label="Отгружено" color="#1d7f55" />
            </Panel>
          </div>
        </div>

        <div className="space-y-5">
          <Panel title="Метрики участка">
            <StationPanel stations={stations} runId={run.id} context="dashboard" />
          </Panel>
          <Panel title="Структура стоимости">
            <CostBreakdown
              total={costTotal}
              items={[
                { key: "res", label: "Ресурсы (доступность)", value: a.resourceCostRub?.mean ?? 0 },
                { key: "mat", label: "Компоненты", value: a.materialCostRub?.mean ?? 0 },
                { key: "con", label: "Расходные материалы", value: a.consumablesCostRub?.mean ?? 0 },
                { key: "fix", label: "Постоянные расходы", value: a.fixedCostRub?.mean ?? 0 },
              ]}
            />
            <p className="mt-3 text-xs text-faint">
              В том числе стоимость простоя ресурсов: {formatMetricValue(AGGREGATE_METRICS.idleCostRub, a.idleCostRub?.mean)} ₽.
            </p>
          </Panel>
          <Panel title="Сводка расчёта">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Сценарий</dt>
              <dd>{run.scenarioName}</dd>
              <dt className="text-muted">Запущено заданий</dt>
              <dd>{val("released")} шт.</dd>
              <dt className="text-muted">Списано</dt>
              <dd>{val("scrapped")} шт.</dd>
              <dt className="text-muted">Доля брака</dt>
              <dd>{val("defectRate")}%</dd>
              <dt className="text-muted">Циклов доработки</dt>
              <dd>{val("reworkCount")}</dd>
              <dt className="text-muted">Ожидание на изделие</dt>
              <dd>{val("waitingTimeAvgMin")} мин</dd>
              <dt className="text-muted">Обработка на изделие</dt>
              <dd>{val("processingTimeAvgMin")} мин</dd>
              <dt className="text-muted">Репликаций, seed</dt>
              <dd>
                {run.replications}, {run.baseSeed}
              </dd>
              <dt className="text-muted">Время расчёта</dt>
              <dd>{fmtNumber(run.durationMs, 0)} мс</dd>
              <dt className="text-muted">Версия движка</dt>
              <dd>{run.engineVersion}</dd>
            </dl>
          </Panel>
          <Panel title="Последние расчёты сценариев">
            <ul className="space-y-2 text-sm">
              {latest.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <a href={`/dashboard?run=${r.id}`} className="truncate hover:text-accent-strong">
                    {r.scenarioName}
                  </a>
                  <span className="shrink-0 tabular-nums text-muted">{fmtNumber(r.headline.completed)} шт.</span>
                </li>
              ))}
            </ul>
          </Panel>
          <SyntheticNote />
        </div>
      </div>
    </>
  );
}
