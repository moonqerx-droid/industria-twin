import clsx from "clsx";
import { STATUS_LABELS, type StationStatus } from "@/domain/analysis/bottleneck";
import { STATUS_TEXT_CLASS } from "@/lib/status";

export function StatusLamp({ status, className }: { status: StationStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABELS[status]}
      className={clsx("lamp", STATUS_TEXT_CLASS[status], status === "critical" && "lamp-critical", className)}
    />
  );
}

export function StatusBadge({ status }: { status: StationStatus }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 text-sm", STATUS_TEXT_CLASS[status])}>
      <StatusLamp status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Код участка (A1…E1) — одинаковый в мнемосхеме, 3D-сцене и таблицах. */
export function StationTag({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 min-w-8 items-center justify-center rounded-[4px] border border-line-strong bg-field px-1.5 text-xs font-semibold text-accent-strong",
        className,
      )}
    >
      {code}
    </span>
  );
}
