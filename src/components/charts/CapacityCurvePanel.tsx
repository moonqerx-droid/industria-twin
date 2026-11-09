"use client";

import { Loader2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATIONS } from "@/domain/model/demoData";
import { CHART, tooltipStyle } from "@/lib/chartTheme";
import { fmtNumber, fmtPercent, fmtRub } from "@/lib/format";
import type { CapacityDto } from "@/server/services/advisorService";
import { Panel } from "@/components/ui/Panel";

const shortName = (id: string | null) => STATIONS.find((s) => s.id === id)?.shortName ?? "—";

type Row = { rate: number; v: number | null; band: [number, number] | null; bottleneck: string | null; cost: number | null };

/** Одна мера на график (без второй оси): линия среднего, полоса 95% ДИ, отметки текущего спроса и предела мощности. */
function MiniCurve({
  rows,
  title,
  unit,
  digits,
  color,
  current,
  saturation,
}: {
  rows: Row[];
  title: string;
  unit: string;
  digits: number;
  color: string;
  current: number;
  saturation: number | null;
}) {
  const xs = rows.map((r) => r.rate);
  const domain: [number, number] = [Math.min(...xs), Math.max(...xs)];
  return (
    <figure className="min-w-0">
      <figcaption className="text-sm font-medium">
        {title}, {unit}
      </figcaption>
      <div className="mt-2 h-[210px] w-full" role="img" aria-label={`${title} в зависимости от спроса`}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 18, right: 12, bottom: 4, left: -14 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="rate"
              type="number"
              domain={domain}
              ticks={xs}
              tickFormatter={(v: number) => fmtNumber(v, 1)}
              tick={{ fill: CHART.text, fontSize: 11 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />
            <YAxis tick={{ fill: CHART.text, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtNumber(v, 0)} />
            <Tooltip
              {...tooltipStyle}
              separator=": "
              labelFormatter={(v) => `Спрос ${fmtNumber(Number(v), 2)} задания/ч`}
              formatter={(value, name, item) => {
                if (name === "band") return [null, null];
                const row = (item as { payload: Row }).payload;
                const ci = row.band ? ` (95% ДИ ${fmtNumber(row.band[0], digits)}–${fmtNumber(row.band[1], digits)})` : "";
                return [`${fmtNumber(Number(value), digits)} ${unit}${ci}`, title];
              }}
            />
            <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} name="band" activeDot={false} />
            <Line dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 3.5, fill: color, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} name="v" />
            <ReferenceLine x={current} stroke={CHART.ink} strokeDasharray="4 3" label={{ value: "сейчас", position: "top", fill: CHART.text, fontSize: 11 }} />
            {saturation !== null && saturation >= domain[0] && saturation <= domain[1] && (
              <ReferenceLine x={saturation} stroke="#bf3a2b" strokeDasharray="2 3" label={{ value: "предел", position: "insideTopRight", fill: "#bf3a2b", fontSize: 11 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CapacityCurvePanel({ runId }: { runId: string }) {
  const [data, setData] = useState<CapacityDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(`/api/runs/${runId}/capacity`)
      .then(async (r) => {
        const body = (await r.json()) as { capacity?: CapacityDto; error?: { message?: string } };
        if (!r.ok || !body.capacity) throw new Error(body.error?.message ?? `Ошибка ${r.status}`);
        if (alive) setData(body.capacity);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [runId]);

  const rows = (key: "cycle" | "output"): Row[] =>
    (data?.points ?? []).map((p) => {
      const v = key === "cycle" ? p.cycleTimeAvgMin : p.completed;
      const ci = key === "cycle" ? p.cycleTimeCi : p.completedCi;
      return { rate: p.ratePerHour, v, band: v !== null && ci !== null ? [v - ci, v + ci] : null, bottleneck: p.bottleneckId, cost: p.costPerUnitRub };
    });

  const headline = (() => {
    if (!data || data.saturationRatePerHour === null || data.headroom === null) return null;
    const limit = `${fmtNumber(data.saturationRatePerHour, 2)} задания/ч`;
    const st = shortName(data.limitingStationId);
    if (data.headroom < 0)
      return {
        tone: "text-crit",
        text: `Спрос ${fmtNumber(data.currentRatePerHour, 2)} задания/ч уже выше установившейся мощности (${limit}, ограничивает «${st}») на ${fmtPercent(-data.headroom, 1)}: очереди и НЗП растут в течение смены. В пределах двух смен это частично скрыто пустым стартом.`,
      };
    if (data.headroom < 0.1)
      return { tone: "text-warn", text: `Запас мощности ${fmtPercent(data.headroom, 0)} до предела ${limit} (ограничивает «${st}»): небольшой рост спроса резко удлинит цикл.` };
    return { tone: "text-ok", text: `Запас мощности ${fmtPercent(data.headroom, 0)}: предел ≈ ${limit}, ограничивает «${st}».` };
  })();

  const cur = data?.points.find((p) => p.factor === 1);
  const hi = data?.points.find((p) => Math.abs(p.factor - 1.2) < 1e-9);

  return (
    <Panel
      id="capacity"
      className="scroll-mt-20"
      title={
        <span className="inline-flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
          Запас мощности: что будет при изменении спроса
        </span>
      }
      subtitle={
        data
          ? `«${data.scenarioName}»: спрос от 60% до 150% текущего, ${data.points.length} точек × ${data.replications} репликаций, общие случайные числа, ${data.durationMs} мс. Полоса — 95% ДИ.`
          : "Моделирование при спросе от 60% до 150% текущего"
      }
    >
      <div data-testid="capacity-curve">
        {error && <p className="text-sm text-crit">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Расчёт кривой…
          </p>
        )}
        {data && (
          <>
            {headline && <p className={`text-sm ${headline.tone}`}>{headline.text}</p>}
            {cur?.bottleneckId && data.limitingStationId && cur.bottleneckId !== data.limitingStationId && (
              <p className="mt-1.5 text-sm text-muted">
                В симуляции двух смен узкое место — «{shortName(cur.bottleneckId)}»: с учётом отказов этот участок стоит раньше по
                потоку и сдерживает подачу на «{shortName(data.limitingStationId)}». Расширение только одного из них переносит
                ограничение на другой — проверьте вариант «+1 на двух самых загруженных» в советнике выше.
              </p>
            )}
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <MiniCurve rows={rows("cycle")} title="Средний цикл" unit="мин" digits={0} color={CHART.accent} current={data.currentRatePerHour} saturation={data.saturationRatePerHour} />
              <MiniCurve rows={rows("output")} title="Выпуск за горизонт" unit="шт." digits={1} color="#13866a" current={data.currentRatePerHour} saturation={data.saturationRatePerHour} />
            </div>
            {cur && hi && (
              <p className="mt-3 text-sm text-muted">
                При росте спроса на 20% (до {fmtNumber(hi.ratePerHour, 2)} задания/ч) выпуск вырастет лишь с {fmtNumber(cur.completed, 1)} до{" "}
                {fmtNumber(hi.completed, 1)} шт., средний цикл — с {fmtNumber(cur.cycleTimeAvgMin, 0)} до {fmtNumber(hi.cycleTimeAvgMin, 0)} мин, стоимость единицы — с{" "}
                {fmtRub(cur.costPerUnitRub)} до {fmtRub(hi.costPerUnitRub)}. Узкое место: «{shortName(hi.bottleneckId)}».
              </p>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-accent-strong">Таблица значений</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs">
                      <th className="py-1.5 pr-2">Спрос, задания/ч</th>
                      <th className="px-2 py-1.5 text-right">Выпуск, шт.</th>
                      <th className="px-2 py-1.5 text-right">Средний цикл, мин</th>
                      <th className="px-2 py-1.5 text-right">НЗП на конец, шт.</th>
                      <th className="px-2 py-1.5 text-right">Стоимость единицы</th>
                      <th className="py-1.5 pl-2">Узкое место</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.points.map((p) => (
                      <tr key={p.ratePerHour} className={p.factor === 1 ? "bg-accent-soft/60 font-medium" : undefined}>
                        <td className="py-1.5 pr-2 tabular-nums">
                          {fmtNumber(p.ratePerHour, 2)} <span className="text-xs text-faint">({fmtPercent(p.factor, 0)})</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(p.completed, 1)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(p.cycleTimeAvgMin, 0)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(p.wipEnd, 1)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtRub(p.costPerUnitRub)}</td>
                        <td className="py-1.5 pl-2 text-muted">{p.bottleneckId ? shortName(p.bottleneckId) : "нет"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="mt-3 text-xs text-faint">
              «Предел» — аналитическая оценка: спрос, при котором загрузка самого нагруженного участка ρ = λ·v·E[S]/(c·A) достигает 100%.
              Кривая — результат симуляции на горизонте сценария, включая разгон с пустой системы.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
