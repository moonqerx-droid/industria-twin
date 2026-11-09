"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VERDICT_LABELS, type ChangeVerdict, type MetricComparison } from "@/domain/analysis/comparison";
import { STATUS_LABELS } from "@/domain/analysis/bottleneck";
import { AGGREGATE_METRICS, STATION_METRICS, formatMetricValue, type AggregateMetricKey, type StationMetricKey } from "@/domain/model/metrics";
import { CHART, SERIES_COLORS, tooltipStyle } from "@/lib/chartTheme";
import { fmtDateTime, fmtSigned } from "@/lib/format";
import type { ComparisonDto } from "@/server/services/comparisonService";
import type { RunSummaryDto } from "@/server/services/simulationService";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StationTag } from "@/components/ui/Status";
import { STATIONS } from "@/domain/model/demoData";

const VERDICT_STYLE: Record<ChangeVerdict, string> = {
  better: "text-ok",
  worse: "text-crit",
  unchanged: "text-muted",
  neutral: "text-muted",
  undetermined: "text-faint",
};

function DiffCell({ m, def }: { m: MetricComparison; def: { displayScale?: number; digits: number; unit: string } }) {
  const scale = def.displayScale ?? 1;
  return (
    <div className={clsx("text-xs", VERDICT_STYLE[m.verdict])}>
      <span className="inline-flex items-center gap-1">
        {fmtSigned(m.absDiff === null ? null : m.absDiff * scale, def.digits)}
        {m.relDiff !== null && ` (${fmtSigned(m.relDiff * 100, 1, "%")})`}
      </span>
      <div className="text-faint">{VERDICT_LABELS[m.verdict]}</div>
    </div>
  );
}

function Selector({ runs, baselineId, altIds }: { runs: RunSummaryDto[]; baselineId: string; altIds: string[] }) {
  const router = useRouter();
  const [base, setBase] = useState(baselineId);
  const [alts, setAlts] = useState<string[]>(altIds);
  const toggle = (id: string) =>
    setAlts((a) => (a.includes(id) ? a.filter((x) => x !== id) : a.length >= 3 ? a : [...a, id]));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const station = new URL(window.location.href).searchParams.get("station");
        const q = new URLSearchParams({ baseline: base, runs: alts.filter((x) => x !== base).join(",") });
        if (station) q.set("station", station);
        router.push(`/compare?${q.toString()}`);
      }}
    >
      <label className="block text-sm">
        Базовый прогон
        <select value={base} onChange={(e) => setBase(e.target.value)} className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-ink">
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.scenarioName} — {fmtDateTime(r.createdAt)}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm">Альтернативы (до трёх)</legend>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
          {runs
            .filter((r) => r.id !== base)
            .map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-raised">
                <input type="checkbox" checked={alts.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1 accent-accent" disabled={!alts.includes(r.id) && alts.length >= 3} />
                <span>
                  {r.scenarioName}
                  <span className="block text-xs text-muted">{fmtDateTime(r.createdAt)}, {r.replications} репл.</span>
                </span>
              </label>
            ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" className="w-full" disabled={alts.filter((x) => x !== base).length === 0}>
        Сравнить
      </Button>
    </form>
  );
}

const CHART_METRICS: AggregateMetricKey[] = ["completed", "cycleTimeAvgMin", "waitingTimeAvgMin", "wipEnd", "costPerUnitRub", "utilizationAvg"];

export function CompareView({ data, runs, focusStationId }: { data: ComparisonDto | null; runs: RunSummaryDto[]; focusStationId: string | null }) {
  const [metric, setMetric] = useState<AggregateMetricKey>("cycleTimeAvgMin");
  if (!data) {
    return (
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Panel title="Выбор прогонов">
          <Selector runs={runs} baselineId={runs[0]?.id ?? ""} altIds={[]} />
        </Panel>
        <p className="text-sm text-muted">Выберите базовый прогон и хотя бы одну альтернативу.</p>
      </div>
    );
  }
  const series = [{ name: data.baseline.scenarioName, run: data.baseline }, ...data.alternatives.map((a) => ({ name: a.run.scenarioName, run: a.run }))];
  const def = AGGREGATE_METRICS[metric];
  const scale = def.displayScale ?? 1;
  const metricRows = [
    {
      label: def.label,
      ...Object.fromEntries(
        series.map((s, i) => {
          const cmp = i === 0 ? null : data.alternatives[i - 1]!.aggregate.find((m) => m.key === metric);
          const v = i === 0 ? cmp?.before ?? data.alternatives[0]?.aggregate.find((m) => m.key === metric)?.before : cmp?.after;
          return [`s${i}`, v === null || v === undefined ? null : v * scale];
        }),
      ),
    },
  ];
  // Доверительные интервалы для графика берём из полных метрик прогонов, переданных сервером.
  const ci = (i: number) => {
    const a = i === 0 ? data.baselineAggregate : data.alternativeAggregates[i - 1];
    const c = a?.[metric]?.ci95;
    return c === null || c === undefined ? 0 : c * scale;
  };
  const metricRowsWithCi = metricRows.map((r) => ({ ...r, ...Object.fromEntries(series.map((_, i) => [`e${i}`, ci(i)])) }));

  const utilRows = STATIONS.map((st) => {
    const row: Record<string, number | string> = { code: st.code, name: st.shortName };
    const b = data.alternatives[0]?.stations.find((s) => s.stationId === st.id)?.metrics.find((m) => m.key === "utilization");
    row.s0 = (b?.before ?? 0) * 100;
    data.alternatives.forEach((alt, i) => {
      const m = alt.stations.find((s) => s.stationId === st.id)?.metrics.find((x) => x.key === "utilization");
      row[`s${i + 1}`] = (m?.after ?? 0) * 100;
    });
    return row;
  });

  const focusStation = focusStationId ? STATIONS.find((s) => s.id === focusStationId) : undefined;

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <div className="space-y-5">
        <Panel title="Выбор прогонов">
          <Selector runs={runs} baselineId={data.baseline.id} altIds={data.alternatives.map((a) => a.run.id)} />
        </Panel>
        <Panel title="Метод сравнения">
          <p className="text-sm text-muted">{data.method}</p>
        </Panel>
      </div>

      <div className="min-w-0 space-y-5">
        {data.alternatives.map((alt, i) => {
          const sig = alt.aggregate.filter((m) => m.verdict === "better" || m.verdict === "worse");
          return (
            <Panel
              key={alt.run.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: SERIES_COLORS[i + 1] }} aria-hidden />
                  {alt.run.scenarioName}
                </span>
              }
              subtitle={`Сравнение с «${data.baseline.scenarioName}»: ${alt.run.replications} и ${data.baseline.replications} репликаций`}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Что изменено в параметрах</h3>
                  {alt.parameterChanges.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Параметры совпадают с базовым прогоном.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {alt.parameterChanges.map((c) => (
                        <li key={c.path} className="flex flex-wrap justify-between gap-x-3">
                          <span className="text-muted">{c.label}</span>
                          <span className="tabular-nums">
                            {c.before} <span className="text-faint">→</span> {c.after}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Ключевые изменения показателей</h3>
                  {sig.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Статистически различимых изменений ключевых показателей нет.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {sig.map((m) => {
                        const d = AGGREGATE_METRICS[m.key as AggregateMetricKey];
                        return (
                          <li key={m.key} className="flex justify-between gap-3">
                            <span className="text-muted">{d.label}</span>
                            <span className={VERDICT_STYLE[m.verdict]}>
                              {formatMetricValue(d, m.before)} → {formatMetricValue(d, m.after)} {d.unit}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-3 text-sm">
                    <span className="text-muted">Узкое место: </span>
                    {data.baseline.bottleneck?.name ?? "нет"} <span className="text-faint">→</span> {alt.bottleneck?.name ?? "нет"}
                    {alt.bottleneck && <span className="text-muted"> ({STATUS_LABELS[alt.bottleneck.status].toLowerCase()})</span>}
                  </p>
                  {alt.bottleneck && <p className="mt-1 text-xs text-faint">{alt.bottleneck.explanation}</p>}
                </div>
              </div>
            </Panel>
          );
        })}

        <Panel title="Показатели: до и после" subtitle="Δ — абсолютная и относительная разность средних; цвет и подпись — направление с учётом смысла показателя">
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-sm" data-testid="compare-table">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2 font-normal sm:pl-0">Показатель</th>
                  <th className="px-2 py-2 text-right font-normal">{data.baseline.scenarioName}</th>
                  {data.alternatives.map((a) => (
                    <th key={a.run.id} className="px-2 py-2 text-right font-normal">
                      {a.run.scenarioName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.alternatives[0]?.aggregate.map((m0) => {
                  const d = AGGREGATE_METRICS[m0.key as AggregateMetricKey];
                  return (
                    <tr key={m0.key} className="border-b border-line/70 align-top last:border-0">
                      <td className="px-4 py-2.5 sm:pl-0">
                        {d.label}
                        <span className="ml-1 text-xs text-faint">{d.unit}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatMetricValue(d, m0.before)}</td>
                      {data.alternatives.map((alt) => {
                        const m = alt.aggregate.find((x) => x.key === m0.key)!;
                        return (
                          <td key={alt.run.id} className="px-2 py-2.5 text-right tabular-nums">
                            <div>{formatMetricValue(d, m.after)}</div>
                            <DiffCell m={m} def={d} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title={`${def.label}, ${def.unit}`}
            subtitle="Среднее по репликациям, отрезок — 95% ДИ"
            actions={
              <select value={metric} onChange={(e) => setMetric(e.target.value as AggregateMetricKey)} aria-label="Показатель для графика" className="rounded-[var(--radius-control)] border border-line-strong bg-field px-2 py-1 text-sm">
                {CHART_METRICS.map((k) => (
                  <option key={k} value={k}>
                    {AGGREGATE_METRICS[k].label}
                  </option>
                ))}
              </select>
            }
          >
            <div className="h-64" role="img" aria-label={`Сравнение показателя ${def.label}`}>
              <ResponsiveContainer>
                <BarChart data={metricRowsWithCi} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={false} axisLine={{ stroke: CHART.axis }} />
                  <YAxis tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip {...tooltipStyle} formatter={(v: number, n) => [`${v.toLocaleString("ru-RU", { maximumFractionDigits: def.digits })} ${def.unit}`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12, color: CHART.text }} />
                  {series.map((s, i) => (
                    <Bar key={s.run.id} dataKey={`s${i}`} name={s.name} fill={SERIES_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                      <ErrorBar dataKey={`e${i}`} width={6} stroke={CHART.ink} strokeWidth={1.5} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Загрузка участков, %" subtitle="Средние по репликациям">
            <div className="h-64" role="img" aria-label="Загрузка участков по сценариям">
              <ResponsiveContainer>
                <BarChart data={utilRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="code" tick={{ fill: CHART.text, fontSize: 12 }} axisLine={{ stroke: CHART.axis }} tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n]} labelFormatter={(l, p) => `${l} ${(p?.[0]?.payload as { name?: string })?.name ?? ""}`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: CHART.text }} />
                  {series.map((s, i) => (
                    <Bar key={s.run.id} dataKey={`s${i}`} name={s.name} fill={SERIES_COLORS[i]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <Panel
          id="stations"
          title={focusStation ? `Участок ${focusStation.code} ${focusStation.name}` : "Сравнение по участкам"}
          subtitle={focusStation ? "Выбран из процесса или 3D-тура" : "Загрузка и среднее ожидание по каждому участку"}
          actions={focusStation ? <Link href={`/compare?baseline=${data.baseline.id}&runs=${data.alternatives.map((a) => a.run.id).join(",")}`} className="text-sm text-accent-strong hover:underline">Все участки</Link> : null}
        >
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-sm" data-testid="station-compare">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2 font-normal sm:pl-0">{focusStation ? "Показатель" : "Участок / показатель"}</th>
                  <th className="px-2 py-2 text-right font-normal">{data.baseline.scenarioName}</th>
                  {data.alternatives.map((a) => (
                    <th key={a.run.id} className="px-2 py-2 text-right font-normal">
                      {a.run.scenarioName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STATIONS.filter((s) => !focusStation || s.id === focusStation.id).flatMap((st) => {
                  const keys: StationMetricKey[] = focusStation
                    ? ["capacity", "utilization", "avgQueueLength", "maxQueueLength", "avgWaitMin", "throughputPerHour", "queueAtEnd", "resourceCostRub"]
                    : ["capacity", "utilization", "avgWaitMin"];
                  return keys.map((key, ki) => {
                    const d = STATION_METRICS[key];
                    const m0 = data.alternatives[0]?.stations.find((s) => s.stationId === st.id)?.metrics.find((m) => m.key === key);
                    return (
                      <tr key={`${st.id}-${key}`} className={clsx("align-top", ki === keys.length - 1 ? "border-b border-line" : "")}>
                        <td className="px-4 py-2 sm:pl-0">
                          {!focusStation && ki === 0 ? (
                            <span className="inline-flex items-center gap-2">
                              <StationTag code={st.code} /> {st.shortName}: {d.label.toLowerCase()}
                            </span>
                          ) : (
                            <span className={!focusStation ? "pl-10 text-muted" : undefined}>{d.label}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMetricValue(d, m0?.before)} <span className="text-xs text-faint">{d.unit}</span>
                        </td>
                        {data.alternatives.map((alt) => {
                          const m = alt.stations.find((s) => s.stationId === st.id)?.metrics.find((x) => x.key === key);
                          return (
                            <td key={alt.run.id} className="px-2 py-2 text-right tabular-nums">
                              {formatMetricValue(d, m?.after)}
                              {m && key !== "capacity" && <DiffCell m={m} def={d} />}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
