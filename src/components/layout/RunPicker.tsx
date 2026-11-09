"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fmtDateTime } from "@/lib/format";

export interface RunOption {
  id: string;
  scenarioName: string;
  createdAt: string;
  isBaselineScenario: boolean;
}

/** Выбор прогона моделирования, показатели которого отображаются на странице (параметр URL `run`). */
export function RunPicker({ runs, currentId }: { runs: RunOption[]; currentId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex w-full min-w-0 items-center gap-2 text-sm text-muted sm:w-auto">
      <span className="hidden sm:inline">Прогон</span>
      <select
        value={currentId ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("run", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="w-full min-w-0 max-w-full sm:w-auto sm:max-w-[20rem] rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 py-1.5 text-ink"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.scenarioName} — {fmtDateTime(r.createdAt)}
            {r.isBaselineScenario ? " (базовый)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
