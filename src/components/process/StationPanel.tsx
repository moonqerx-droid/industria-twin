"use client";

import Link from "next/link";
import { KEY_STATION_METRICS, STATION_METRICS } from "@/domain/model/metrics";
import { fmtMetric } from "@/lib/format";
import type { StationView } from "@/lib/views";
import { StatusBadge, StationTag } from "@/components/ui/Status";
import { useSelection } from "@/store/selection";

/** Панель метрик выбранного участка. Одинакова для мнемосхемы, дашборда и 3D-тура. */
export function StationPanel({
  stations,
  runId,
  context,
  emptyHint = "Выберите участок на схеме, в таблице или в 3D-сцене.",
}: {
  stations: StationView[];
  runId: string | null;
  context: "process" | "factory" | "dashboard";
  emptyHint?: string;
}) {
  const selectedId = useSelection((s) => s.selectedStationId);
  const select = useSelection((s) => s.selectStation);
  const st = stations.find((s) => s.stationId === selectedId);
  if (!st) return <p className="text-sm text-muted">{emptyHint}</p>;
  const runQ = runId ? `&run=${runId}` : "";
  return (
    <div data-testid="station-panel" data-station-id={st.stationId}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <StationTag code={st.code} className="mt-0.5" />
          <div>
            <h3 className="font-semibold leading-snug">{st.name}</h3>
            <p className="text-xs text-muted">{st.zone}</p>
          </div>
        </div>
        <button onClick={() => select(null)} aria-label="Снять выбор участка" className="rounded p-1 text-muted hover:bg-raised hover:text-ink">
          <span aria-hidden className="px-1 text-lg leading-none">×</span>
        </button>
      </div>
      <div className="mt-3">{st.status ? <StatusBadge status={st.status} /> : <span className="text-sm text-muted">Нет расчёта</span>}</div>
      <p className="mt-3 text-sm text-muted">{st.description}</p>
      <p className="mt-2 text-sm">
        Ресурс: <span className="text-muted">{st.resourceName}</span>
        {st.metrics.capacity?.mean != null && (
          <>
            , <span className="font-semibold">{st.metrics.capacity.mean}</span> {st.unitName}
          </>
        )}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {KEY_STATION_METRICS.map((key) => {
          const def = STATION_METRICS[key];
          const s = st.metrics[key];
          return (
            <div key={key}>
              <dt className="text-xs text-muted">{def.label}</dt>
              <dd className="text-[0.95rem] font-semibold tabular-nums">
                {fmtMetric(def, s?.mean)}
                {s?.ci95 != null && s.n > 1 && (
                  <span className="ml-1 text-xs font-normal text-faint">± {fmtMetric({ ...def, unit: "" }, s.ci95).trim()}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {st.finding && st.finding.status !== "normal" && (
        <p className="mt-4 rounded-[var(--radius-control)] border border-warn/30 bg-warn/5 px-3 py-2 text-sm">
          Место в рейтинге загрузки: {st.finding.rank}. {st.finding.explanation}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {context !== "factory" && (
          <Link href={`/factory?station=${st.stationId}${runQ}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm hover:border-accent">
            Показать в 3D
          </Link>
        )}
        {context !== "process" && (
          <Link href={`/process?station=${st.stationId}${runQ}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm hover:border-accent">
            На мнемосхеме
          </Link>
        )}
        <Link href={`/compare?station=${st.stationId}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm hover:border-accent">
          Сравнить сценарии по участку
        </Link>
      </div>
      <p className="mt-4 text-xs text-faint">
        Среднее по репликациям; «±» — полуширина 95% доверительного интервала. stationId: {st.stationId}
      </p>
    </div>
  );
}
