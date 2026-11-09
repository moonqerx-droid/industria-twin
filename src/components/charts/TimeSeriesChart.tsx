"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, tooltipStyle } from "@/lib/chartTheme";
import { fmtClock } from "@/lib/format";

/** Одна временная серия по кадрам состояния симуляции (ось X — модельное время). */
export function TimeSeriesChart({
  data,
  unit,
  label,
  color = CHART.accent,
  height = 200,
  stepAfter = true,
}: {
  data: Array<{ t: number; v: number }>;
  unit: string;
  label: string;
  color?: string;
  height?: number;
  stepAfter?: boolean;
}) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`${label} по модельному времени`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => fmtClock(t)}
            tick={{ fill: CHART.text, fontSize: 12 }}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            ticks={data.length ? Array.from({ length: Math.floor(data[data.length - 1]!.t / 120) + 1 }, (_, i) => i * 120) : []}
          />
          <YAxis allowDecimals={false} tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(t) => `Модельное время ${fmtClock(Number(t))}`}
            formatter={(v: number) => [`${v} ${unit}`, label]}
          />
          <Area
            type={stepAfter ? "stepAfter" : "monotone"}
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.12}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
