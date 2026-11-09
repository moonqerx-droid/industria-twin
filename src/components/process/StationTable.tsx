"use client";

import clsx from "clsx";
import type { StationId } from "@/domain/model/demoData";
import { fmtMinutes, fmtNumber, fmtPercent, fmtRub } from "@/lib/format";
import { STATUS_COLOR } from "@/lib/status";
import type { StationView } from "@/lib/views";
import { StatusLamp, StationTag } from "@/components/ui/Status";
import { STATUS_LABELS } from "@/domain/analysis/bottleneck";
import { useSelection } from "@/store/selection";

/** Таблица состояния участков; строка выбирает участок (selectStation). */
export function StationTable({ stations }: { stations: StationView[] }) {
  const selected = useSelection((s) => s.selectedStationId);
  const select = useSelection((s) => s.selectStation);
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Состояние производственных участков</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-normal sm:pl-0">Участок</th>
            <th className="px-2 py-2 font-normal">Состояние</th>
            <th className="px-2 py-2 font-normal">Загрузка</th>
            <th className="px-2 py-2 text-right font-normal">Очередь, шт.</th>
            <th className="px-2 py-2 text-right font-normal">Ожидание</th>
            <th className="px-2 py-2 text-right font-normal">Операций/ч</th>
            <th className="px-4 py-2 text-right font-normal sm:pr-0">Стоимость</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => {
            const u = s.metrics.utilization?.mean ?? null;
            const isSel = selected === s.stationId;
            return (
              <tr
                key={s.stationId}
                data-station-id={s.stationId}
                aria-selected={isSel}
                tabIndex={0}
                onClick={() => select(isSel ? null : (s.stationId as StationId))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(isSel ? null : (s.stationId as StationId));
                  }
                }}
                className={clsx(
                  "cursor-pointer border-b border-line/70 transition-colors last:border-0",
                  isSel ? "bg-accent/10" : "hover:bg-raised/60",
                )}
              >
                <td className="px-4 py-2.5 sm:pl-0">
                  <div className="flex items-center gap-2.5">
                    <StationTag code={s.code} />
                    <span className="font-medium">{s.shortName}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {s.status ? (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <StatusLamp status={s.status} />
                      <span className="text-muted">{STATUS_LABELS[s.status]}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-field" aria-hidden>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(u ?? 0) * 100}%`, background: s.status ? STATUS_COLOR[s.status] : "#5f7189" }}
                      />
                    </div>
                    <span className="tabular-nums">{fmtPercent(u)}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{fmtNumber(s.metrics.avgQueueLength?.mean, 2)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{fmtMinutes(s.metrics.avgWaitMin?.mean)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{fmtNumber(s.metrics.throughputPerHour?.mean, 2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums sm:pr-0">
                  {fmtRub((s.metrics.resourceCostRub?.mean ?? 0) + (s.metrics.consumablesCostRub?.mean ?? 0))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
