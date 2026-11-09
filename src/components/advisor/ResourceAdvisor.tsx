"use client";

import clsx from "clsx";
import { Lightbulb, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ADVISOR_VERDICT_LABELS, type AdvisorCandidate, type AdvisorDelta, type AdvisorVerdict } from "@/domain/analysis/advisor";
import { fmtRub, fmtSigned } from "@/lib/format";
import type { AdviceDto } from "@/server/services/advisorService";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

const VERDICT_STYLE: Record<AdvisorVerdict, string> = {
  recommended: "bg-ok/10 text-ok border-ok/30",
  "faster-costlier": "bg-warn/10 text-warn border-warn/30",
  "no-effect": "bg-raised text-muted border-line",
  costlier: "bg-crit/5 text-crit border-crit/25",
  worse: "bg-crit/10 text-crit border-crit/30",
};

type ApiError = { error?: { message?: string } };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw new Error(body.error?.message ?? `Ошибка ${res.status}`);
  return body;
}

/** Изменение показателя с 95% ДИ; цвет — только если изменение различимо. */
function Delta({ d, digits, unit, lowerIsBetter }: { d: AdvisorDelta; digits: number; unit: string; lowerIsBetter: boolean }) {
  const sig = d.distinguishable === true && Math.abs(d.relDiff ?? 1) >= 0.01;
  const good = lowerIsBetter ? d.diff < 0 : d.diff > 0;
  const ci = d.ci95 === null ? null : d.ci95.toLocaleString("ru-RU", { maximumFractionDigits: digits });
  return (
    <span className={clsx("tabular-nums", sig ? (good ? "text-ok" : "text-crit") : "text-muted")}>
      <span className="whitespace-nowrap">
        {fmtSigned(d.diff, digits)}
        {unit && <span className="text-xs"> {unit}</span>}
      </span>
      {ci && <span className="block text-[11px] text-faint">±{ci}</span>}
    </span>
  );
}

export function ResourceAdvisor({ runId, canCreate }: { runId: string; canCreate: boolean }) {
  const router = useRouter();
  const [advice, setAdvice] = useState<AdviceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setAdvice(null);
    setError(null);
    api<{ advice: AdviceDto }>(`/api/runs/${runId}/advice`)
      .then((r) => alive && setAdvice(r.advice))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [runId]);

  /** Создаёт сценарий из варианта, рассчитывает его и открывает сравнение с исходным прогоном. */
  async function verify(c: AdvisorCandidate) {
    if (!advice) return;
    setBusy(c.id);
    setError(null);
    try {
      const { scenario } = await api<{ scenario: { id: string } }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({
          name: `Советник: ${c.label}`.slice(0, 120),
          description: `Вариант советника по ресурсам на основе «${advice.scenarioName}». Ожидаемое изменение цикла: ${fmtSigned(
            c.deltas.cycleTimeAvgMin.diff,
            1,
          )} мин.`,
          parameters: c.parameters,
        }),
      });
      const { run } = await api<{ run: { id: string } }>(`/api/scenarios/${scenario.id}/run`, { method: "POST" });
      router.push(`/compare?baseline=${runId}&runs=${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
          Советник по ресурсам: что даст +1 единица?
        </span>
      }
      subtitle={
        advice
          ? `Автоматическая проверка гипотез для «${advice.scenarioName}»: ${advice.candidates.length} вариантов × ${advice.replications} репликаций, парное сравнение с общими случайными числами, ${advice.durationMs} мс`
          : "Автоматическая проверка гипотез: каждый вариант моделируется с теми же случайными числами, что и исходный"
      }
      id="advisor"
      className="scroll-mt-20"
      bodyClassName="p-0 sm:p-0"
    >
      <div data-testid="resource-advisor">
        {error && <p className="px-4 py-3 text-sm text-crit sm:px-5">{error}</p>}
        {!advice && !error && (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted sm:px-5">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Моделирование вариантов…
          </p>
        )}
        {advice && (
          <>
            <div className="border-b border-line px-4 py-3 text-sm sm:px-5">
              {advice.best ? (
                <p>
                  <span className="font-semibold">Рекомендация: {advice.best.label}.</span>{" "}
                  <span className="text-muted">
                    Средний цикл {fmtSigned(advice.best.deltas.cycleTimeAvgMin.diff, 1)} мин, стоимость единицы{" "}
                    {fmtSigned(advice.best.deltas.costPerUnitRub.diff, 0)} ₽, выпуск {fmtSigned(advice.best.deltas.completed.diff, 1)} шт.
                    {advice.best.bottleneckAfter && advice.best.bottleneckAfter.stationId !== advice.bottleneckBefore?.stationId
                      ? ` Узкое место сместится на «${advice.best.bottleneckAfter.name}».`
                      : ""}
                  </span>
                </p>
              ) : (
                <p className="text-muted">Ни один вариант «+1 ресурс» не даёт различимого улучшения — ограничение во входящем потоке или качестве.</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs">
                    <th className="px-4 py-2 sm:pl-5">Вариант</th>
                    <th className="px-2 py-2">Оценка</th>
                    <th className="px-2 py-2 text-right">Δ средний цикл</th>
                    <th className="px-2 py-2 text-right">Δ выпуск</th>
                    <th className="px-2 py-2 text-right">Δ стоимость ед.</th>
                    <th className="px-2 py-2 text-right">Доп. ресурс за горизонт</th>
                    <th className="px-2 py-2">Узкое место после</th>
                    {canCreate && <th className="px-4 py-2 sm:pr-5" aria-label="Действие" />}
                  </tr>
                </thead>
                <tbody>
                  {advice.candidates.map((c) => (
                    <tr key={c.id} className="border-b border-line/70 align-top last:border-0">
                      <td className="px-4 sm:pl-5">{c.label}</td>
                      <td className="px-2">
                        <span className={clsx("inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs", VERDICT_STYLE[c.verdict])}>
                          {ADVISOR_VERDICT_LABELS[c.verdict]}
                        </span>
                      </td>
                      <td className="px-2 text-right">
                        <Delta d={c.deltas.cycleTimeAvgMin} digits={1} unit="мин" lowerIsBetter />
                      </td>
                      <td className="px-2 text-right">
                        <Delta d={c.deltas.completed} digits={1} unit="шт." lowerIsBetter={false} />
                      </td>
                      <td className="px-2 text-right">
                        <Delta d={c.deltas.costPerUnitRub} digits={0} unit="₽" lowerIsBetter />
                      </td>
                      <td className="px-2 text-right tabular-nums text-muted">{fmtRub(c.addedResourceCostRub)}</td>
                      <td className="px-2 text-muted">{c.bottleneckAfter?.name ?? "нет"}</td>
                      {canCreate && (
                        <td className="px-4 text-right sm:pr-5">
                          <Button
                            variant={c.verdict === "recommended" ? "primary" : "secondary"}
                            className="min-h-8 whitespace-nowrap px-2.5 py-1 text-xs"
                            disabled={busy !== null}
                            onClick={() => verify(c)}
                          >
                            {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                            Проверить и сравнить
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-faint sm:px-5">
              «±» — полуширина 95% ДИ парной разности. Изменения меньше 1% считаются несущественными. Кнопка создаёт сценарий,
              рассчитывает его и открывает сравнение «до/после» с текущим прогоном. Вывод относится к
              модели с синтетическими параметрами.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
