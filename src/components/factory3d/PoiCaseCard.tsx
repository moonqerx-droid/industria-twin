import clsx from "clsx";
import Link from "next/link";
import type { ChangeVerdict } from "@/domain/analysis/comparison";
import { VERDICT_LABELS } from "@/domain/analysis/comparison";
import { fmtSigned } from "@/lib/format";
import type { PoiCaseDto } from "@/server/services/tourService";

const TONE: Record<ChangeVerdict, string> = {
  better: "text-ok",
  worse: "text-crit",
  unchanged: "text-muted",
  neutral: "text-muted",
  undetermined: "text-faint",
};

/** Карточка кейса точки интереса: вопрос, рассчитанные «до → после» и переходы к процессу и сравнению. */
export function PoiCaseCard({ c, stationId }: { c: PoiCaseDto; stationId: string | null }) {
  const st = stationId ? `&station=${stationId}` : "";
  return (
    <div className="mt-4 rounded-[var(--radius-control)] border border-accent/30 bg-accent-soft/60 p-3" data-testid="poi-case">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-strong">Кейс · проверено моделью</p>
      <h3 className="mt-1 text-sm font-semibold">{c.title}</h3>
      <p className="mt-0.5 text-xs text-muted">{c.question}</p>
      <ul className="mt-2.5 space-y-1.5">
        {c.items.map((it) => (
          <li key={it.key} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">{it.label}</span>
            <span className="text-right tabular-nums">
              {it.before} → <span className="font-semibold">{it.after}</span> <span className="text-xs text-faint">{it.unit}</span>
              <span className={clsx("block text-[11px]", TONE[it.verdict])}>
                {it.rel !== null ? `${fmtSigned(it.rel * 100, 1, "%")} · ` : ""}
                {VERDICT_LABELS[it.verdict]}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {c.bottleneckBefore !== c.bottleneckAfter && (
        <p className="mt-2 text-xs text-muted">
          Узкое место: {c.bottleneckBefore ?? "нет"} → {c.bottleneckAfter ?? "нет"}
        </p>
      )}
      <p className="mt-2 text-[11px] text-faint">
        «{c.scenarioName}» против базового, {c.paired ? "парное сравнение (общие случайные числа)" : "сравнение независимых выборок"}.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/compare?baseline=${c.baselineRunId}&runs=${c.runId}${st}`} className="text-accent-strong hover:underline">
          Открыть сравнение →
        </Link>
        <Link href={`/process?run=${c.runId}${st}`} className="text-accent-strong hover:underline">
          Процесс в этом сценарии →
        </Link>
      </div>
    </div>
  );
}
