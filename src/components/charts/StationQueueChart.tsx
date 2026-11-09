"use client";

import { useSelection } from "@/store/selection";
import { TimeSeriesChart } from "./TimeSeriesChart";

/** Очередь перед выбранным участком (по умолчанию — перед узким местом) по кадрам репликации №1. */
export function StationQueueChart({
  series,
  names,
  defaultStationId,
}: {
  series: Record<string, Array<{ t: number; v: number }>>;
  names: Record<string, string>;
  defaultStationId: string;
}) {
  const selected = useSelection((s) => s.selectedStationId);
  const id = selected && series[selected] ? selected : defaultStationId;
  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Участок: <span className="text-ink">{names[id]}</span>
        {!selected && " (узкое место; выберите другой участок в таблице)"}
      </p>
      <TimeSeriesChart data={series[id] ?? []} unit="шт." label="Очередь" color="#c27a12" />
    </div>
  );
}
