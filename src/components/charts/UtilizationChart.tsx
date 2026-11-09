"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StationStatus } from "@/domain/analysis/bottleneck";
import { STATUS_LABELS, STATUS_THRESHOLDS } from "@/domain/analysis/bottleneck";
import { CHART, tooltipStyle } from "@/lib/chartTheme";
import { STATUS_COLOR } from "@/lib/status";
import { selectStation, useSelection } from "@/store/selection";
import type { StationId } from "@/domain/model/demoData";

export interface UtilizationDatum {
  stationId: string;
  code: string;
  name: string;
  utilization: number;
  ci95: number | null;
  status: StationStatus;
}

/** Загрузка участков (%), цвет — статус участка. Клик по столбцу выбирает участок. */
export function UtilizationChart({ data }: { data: UtilizationDatum[] }) {
  const selected = useSelection((s) => s.selectedStationId);
  const rows = data.map((d) => ({ ...d, pct: d.utilization * 100, label: `${d.code} ${d.name}` }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Диаграмма загрузки участков в процентах">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="code" tick={{ fill: CHART.text, fontSize: 12 }} axisLine={{ stroke: CHART.axis }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: CHART.text, fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
          <ReferenceLine y={STATUS_THRESHOLDS.high * 100} stroke={STATUS_COLOR.high} strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={STATUS_THRESHOLDS.critical * 100} stroke={STATUS_COLOR.critical} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v: number, _n, item) => {
              const d = item.payload as (typeof rows)[number];
              const ci = d.ci95 !== null ? ` ± ${(d.ci95 * 100).toFixed(1)}` : "";
              return [`${v.toFixed(1)}%${ci} (${STATUS_LABELS[d.status]})`, "Загрузка"];
            }}
            labelFormatter={(_l, p) => (p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""}
          />
          <Bar
            dataKey="pct"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            cursor="pointer"
            onClick={(d) => selectStation((d as unknown as { stationId: StationId }).stationId)}
          >
            {rows.map((d) => (
              <Cell
                key={d.stationId}
                fill={STATUS_COLOR[d.status]}
                fillOpacity={selected && selected !== d.stationId ? 0.35 : 0.9}
                stroke={selected === d.stationId ? CHART.ink : "none"}
                strokeWidth={2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
