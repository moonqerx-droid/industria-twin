import clsx from "clsx";
import type { ReactNode } from "react";

export function Kpi({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "default" | "warn" | "crit";
}) {
  return (
    <div className="kpi-card rounded-[var(--radius-panel)] border border-line bg-surface px-5 py-5">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={clsx(
          "kpi-value mt-3 flex items-baseline gap-1.5 text-[28px] font-semibold tracking-tight",
          tone === "warn" && "text-warn",
          tone === "crit" && "text-crit",
        )}
      >
        {value}
        {unit && <span className="text-sm font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
