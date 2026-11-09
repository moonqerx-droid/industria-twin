"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtDateTime } from "@/lib/format";

export function RunAdminTable({ runs }: { runs: Array<{ id: string; scenarioName: string; createdAt: string; replications: number; durationMs: number }> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function remove(id: string, name: string) {
    if (!window.confirm(`Удалить прогон «${name}»? Результаты и журнал событий будут удалены без возможности восстановления.`)) return;
    const res = await fetch(`/api/runs/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Не удалось удалить прогон");
    router.refresh();
  }
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      {error && <p role="alert" className="mb-2 text-sm text-crit">{error}</p>}
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 font-normal">Сценарий</th>
            <th className="py-2 font-normal">Дата</th>
            <th className="py-2 text-right font-normal">Репликаций</th>
            <th className="py-2 text-right font-normal">Расчёт, мс</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-line/70 last:border-0">
              <td className="py-2">{r.scenarioName}</td>
              <td className="py-2 text-muted">{fmtDateTime(r.createdAt)}</td>
              <td className="py-2 text-right">{r.replications}</td>
              <td className="py-2 text-right">{r.durationMs}</td>
              <td className="py-2 text-right">
                <button onClick={() => remove(r.id, r.scenarioName)} className="text-xs text-crit hover:underline">
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
