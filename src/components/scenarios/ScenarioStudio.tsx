"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { STATIONS, type ScenarioParameters, type StationId, type StationParameters } from "@/domain/model/demoData";
import { availabilityOf, estimateLoads } from "@/domain/model/loadEstimate";
import { DISTRIBUTION_LABELS, distributionMean, type DistributionKind, type DurationDistribution } from "@/domain/simulation/distributions";
import { fmtDateTime, fmtMinutes, fmtNumber, fmtPercent, fmtRub } from "@/lib/format";
import type { ScenarioDto } from "@/server/services/scenarioService";
import type { RunDetailDto } from "@/server/services/simulationService";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge, StationTag } from "@/components/ui/Status";
import { NumberInput, SliderField, Stepper } from "./fields";
import { ScenarioExchange } from "./ScenarioExchange";

interface ApiErrorBody {
  error?: { message?: string; details?: Array<{ path: string; message: string }> | string[] | null };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    const det = body.error?.details;
    const extra = Array.isArray(det) && det.length
      ? `: ${det.map((d) => (typeof d === "string" ? d : `${d.path} — ${d.message}`)).join("; ")}`
      : "";
    throw new Error(`${body.error?.message ?? `Ошибка ${res.status}`}${extra}`);
  }
  return body;
}

function defaultDistribution(kind: DistributionKind, mean: number): DurationDistribution {
  const m = Math.max(0.1, Math.round(mean * 10) / 10);
  switch (kind) {
    case "fixed":
      return { kind, value: m };
    case "exponential":
      return { kind, mean: m };
    case "uniform":
      return { kind, min: Math.round(m * 0.7 * 10) / 10, max: Math.round(m * 1.3 * 10) / 10 };
    case "triangular":
      return { kind, min: Math.round(m * 0.75 * 10) / 10, mode: m, max: Math.round(m * 1.35 * 10) / 10 };
    case "normal":
      return { kind, mean: m, sd: Math.round(m * 0.15 * 10) / 10, min: 0 };
  }
}

function DistributionEditor({
  value,
  onChange,
  disabled,
  stationId,
}: {
  value: DurationDistribution;
  onChange: (d: DurationDistribution) => void;
  disabled: boolean;
  stationId: string;
}) {
  const fields: Array<[string, number, (v: number) => DurationDistribution]> = (() => {
    switch (value.kind) {
      case "fixed":
        return [["Значение", value.value, (v) => ({ ...value, value: v })]];
      case "exponential":
        return [["Среднее", value.mean, (v) => ({ ...value, mean: v })]];
      case "uniform":
        return [
          ["Мин.", value.min, (v) => ({ ...value, min: v })],
          ["Макс.", value.max, (v) => ({ ...value, max: v })],
        ];
      case "triangular":
        return [
          ["Мин.", value.min, (v) => ({ ...value, min: v })],
          ["Мода", value.mode, (v) => ({ ...value, mode: v })],
          ["Макс.", value.max, (v) => ({ ...value, max: v })],
        ];
      case "normal":
        return [
          ["Среднее", value.mean, (v) => ({ ...value, mean: v })],
          ["СКО", value.sd, (v) => ({ ...value, sd: v })],
          ["Не менее", value.min, (v) => ({ ...value, min: v })],
        ];
    }
  })();
  return (
    <div>
      <label className="block text-xs text-muted">
        Время операции
        <select
          value={value.kind}
          disabled={disabled}
          onChange={(e) => onChange(defaultDistribution(e.target.value as DistributionKind, distributionMean(value)))}
          className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2 py-1.5 text-sm text-ink"
        >
          {(Object.keys(DISTRIBUTION_LABELS) as DistributionKind[]).map((k) => (
            <option key={k} value={k}>
              {DISTRIBUTION_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {fields.map(([label, v, make]) => (
          <NumberInput key={label} label={label} unit="мин" value={v} step={0.5} min={0} max={1440} disabled={disabled} onChange={(x) => onChange(make(x))} testId={`${stationId}-${label}`} />
        ))}
      </div>
    </div>
  );
}

export function ScenarioStudio({
  scenarios,
  selectedId,
  canEdit,
  baselineRunId,
  lastRun,
}: {
  scenarios: ScenarioDto[];
  selectedId: string;
  canEdit: boolean;
  baselineRunId: string | null;
  lastRun: RunDetailDto | null;
}) {
  const router = useRouter();
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0]!;
  const [name, setName] = useState(selected.name);
  const [description, setDescription] = useState(selected.description);
  const [params, setParams] = useState<ScenarioParameters>(selected.parameters);
  const [busy, setBusy] = useState<null | "save" | "run" | "copy" | "delete">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [run, setRun] = useState<RunDetailDto | null>(lastRun);

  // Синхронизация с сервером после сохранения/запуска (router.refresh); сообщение о результате не сбрасываем.
  const lastRunId = lastRun?.id ?? null;
  useEffect(() => {
    setName(selected.name);
    setDescription(selected.description);
    setParams(selected.parameters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id, selected.updatedAt]);
  useEffect(() => {
    if (lastRun) setRun(lastRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunId]);

  const locked = selected.isBaseline;
  const readOnly = !canEdit;
  const paramsDisabled = readOnly || locked;
  const dirty =
    name !== selected.name || description !== selected.description || JSON.stringify(params) !== JSON.stringify(selected.parameters);
  const loads = useMemo(() => estimateLoads(params), [params]);

  const setStation = (id: StationId, patch: Partial<StationParameters>) =>
    setParams((p) => ({ ...p, stations: { ...p.stations, [id]: { ...p.stations[id], ...patch } } }));

  async function save(): Promise<boolean> {
    setBusy("save");
    setMessage(null);
    try {
      await api(`/api/scenarios/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify(locked ? { name, description } : { name, description, parameters: params }),
      });
      setMessage({ tone: "ok", text: "Сценарий сохранён" });
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function runSimulation() {
    if (dirty && !(await save())) return;
    setBusy("run");
    setMessage(null);
    try {
      const { run: r } = await api<{ run: RunDetailDto }>(`/api/scenarios/${selected.id}/run`, { method: "POST" });
      setRun(r);
      setMessage({ tone: "ok", text: `Моделирование выполнено: ${r.replications} репликаций за ${r.durationMs} мс` });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    setBusy("copy");
    try {
      const { scenario } = await api<{ scenario: ScenarioDto }>(`/api/scenarios/${selected.id}/copy`, { method: "POST", body: "{}" });
      router.push(`/scenarios?id=${scenario.id}`);
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить сценарий «${selected.name}» и все его прогоны? Действие нельзя отменить.`)) return;
    setBusy("delete");
    try {
      await api(`/api/scenarios/${selected.id}`, { method: "DELETE" });
      router.push("/scenarios");
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
      setBusy(null);
    }
  }

  const baseline = scenarios.find((s) => s.isBaseline);

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      <aside aria-label="Список сценариев" className="space-y-3">
        <ul className="space-y-1.5">
          {scenarios.map((s) => (
            <li key={s.id}>
              <Link
                href={`/scenarios?id=${s.id}`}
                aria-current={s.id === selected.id ? "page" : undefined}
                className={clsx(
                  "block rounded-[var(--radius-control)] border px-3 py-2.5 text-sm transition-colors",
                  s.id === selected.id ? "border-accent/60 bg-accent/10" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.isBaseline && <span className="text-[10px] text-muted">База</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {s.latestRun ? `Расчёт ${fmtDateTime(s.latestRun.createdAt)}` : "Не рассчитан"}, прогонов: {s.runCount}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {canEdit && baseline && (
          <Button
            className="w-full"
            onClick={async () => {
              setBusy("copy");
              try {
                const { scenario } = await api<{ scenario: ScenarioDto }>(`/api/scenarios/${baseline.id}/copy`, {
                  method: "POST",
                  body: JSON.stringify({ name: "Новый сценарий" }),
                });
                router.push(`/scenarios?id=${scenario.id}`);
                router.refresh();
              } catch (e) {
                setMessage({ tone: "error", text: (e as Error).message });
              } finally {
                setBusy(null);
              }
            }}
          >
            Новый сценарий на основе базового
          </Button>
        )}
        <ScenarioExchange name={name} description={description} params={params} canEdit={canEdit} />
      </aside>

      <div className="min-w-0 space-y-5">
        <Panel
          title={locked ? "Базовый сценарий (параметры защищены)" : "Параметры сценария"}
          subtitle={
            locked
              ? "Базовый сценарий — точка отсчёта для сравнения. Скопируйте его, чтобы изменить параметры."
              : readOnly
                ? "Роль «Наблюдатель»: только просмотр"
                : "Изменения применяются после сохранения. Запуск сохраняет несохранённые изменения автоматически."
          }
          actions={
            <>
              {canEdit && (
                <>
                  <Button variant="primary" onClick={runSimulation} disabled={busy !== null} data-testid="run-scenario">
                    {busy === "run" ? "Моделирование…" : dirty ? "Сохранить и запустить" : "Запустить моделирование"}
                  </Button>
                  <Button onClick={save} disabled={busy !== null || !dirty} data-testid="save-scenario">
                    {busy === "save" ? "Сохраняем…" : "Сохранить"}
                  </Button>
                  <Button variant="ghost" onClick={copy} disabled={busy !== null}>
                    Копировать
                  </Button>
                  {!locked && (
                    <Button variant="danger" onClick={remove} disabled={busy !== null}>
                      Удалить
                    </Button>
                  )}
                </>
              )}
            </>
          }
        >
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={clsx(
                "mb-4 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                message.tone === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-crit/40 bg-crit/10 text-crit",
              )}
            >
              {message.text}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Название
              <input
                data-testid="scenario-name"
                value={name}
                disabled={readOnly}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-3 py-2 text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              Описание гипотезы
              <input
                value={description}
                disabled={readOnly}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-3 py-2 text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <h3 className="mt-6 text-sm font-semibold">Нагрузка и горизонт</h3>
          <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">
            <SliderField label="Интенсивность поступления заданий" unit="шт./ч" min={0} max={15} step={0.1} value={params.arrivalRatePerHour} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, arrivalRatePerHour: v })} hint="Пуассоновский поток: интервалы между заданиями экспоненциальны" testId="arrival-rate" />
            <SliderField label="Горизонт моделирования" unit="мин" min={60} max={2880} step={30} value={params.horizonMin} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, horizonMin: v, releaseWindowMin: Math.min(params.releaseWindowMin, v) })} hint={`${fmtMinutes(params.horizonMin)}; 960 мин — две смены`} />
            <SliderField label="Окно запуска новых заданий" unit="мин" min={0} max={params.horizonMin} step={30} value={params.releaseWindowMin} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, releaseWindowMin: v })} hint="После окна задания не запускаются, но незавершённые дорабатываются до горизонта" />
            <label className="block text-sm">
              Тип входящего потока
              <select
                value={params.arrivalKind}
                disabled={paramsDisabled}
                onChange={(e) => setParams({ ...params, arrivalKind: e.target.value as ScenarioParameters["arrivalKind"] })}
                className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-ink"
              >
                <option value="poisson">Случайный (пуассоновский)</option>
                <option value="deterministic">Равномерный (такт)</option>
              </select>
            </label>
          </div>

          <h3 className="mt-7 text-sm font-semibold">Качество</h3>
          <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-3">
            <SliderField label="Брак при первичных испытаниях" unit="%" min={0} max={60} step={0.5} scale={100} value={params.defectProbability} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, defectProbability: v })} />
            <SliderField label="Брак при повторных испытаниях" unit="%" min={0} max={60} step={0.5} scale={100} value={params.retestDefectProbability} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, retestDefectProbability: v })} />
            <SliderField label="Максимум циклов доработки" unit="цикл." min={0} max={5} step={1} value={params.maxReworkCycles} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, maxReworkCycles: Math.round(v) })} hint="После лимита изделие списывается" />
          </div>

          <h3 className="mt-7 text-sm font-semibold">Затраты и статистика</h3>
          <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">
            <SliderField label="Комплект компонентов на задание" unit="₽" min={0} max={200000} step={500} value={params.materialCostPerUnitRub} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, materialCostPerUnitRub: v })} />
            <SliderField label="Постоянные расходы за горизонт" unit="₽" min={0} max={1000000} step={5000} value={params.fixedCostRub} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, fixedCostRub: v })} />
            <SliderField label="Число репликаций" unit="шт." min={1} max={30} step={1} value={params.replications} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, replications: Math.round(v) })} hint="Независимые прогоны с разными seed; при 1 — одиночный воспроизводимый прогон без доверительных интервалов" />
            <SliderField label="Базовый seed генератора" unit="" min={0} max={999999} step={1} value={params.seed} disabled={paramsDisabled} onChange={(v) => setParams({ ...params, seed: Math.round(v) })} hint="Одинаковый seed и параметры дают идентичный результат" />
          </div>
        </Panel>

        <Panel title="Участки и ресурсы" subtitle="Оценка загрузки ρ = λ·v·E[S]/c — аналитическая подсказка до запуска, не результат симуляции">
          <div className="space-y-4">
            {STATIONS.map((st) => {
              const sp = params.stations[st.id];
              const rho = loads[st.id];
              return (
                <div key={st.id} className="rounded-[var(--radius-control)] border border-line p-3 sm:p-4" data-station-id={st.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <StationTag code={st.code} />
                      <span className="font-medium">{st.name}</span>
                    </div>
                    <span className={clsx("text-sm tabular-nums", rho >= 1 ? "text-crit" : rho >= 0.9 ? "text-warn" : "text-muted")}>
                      ρ ≈ {fmtPercent(rho, 0)}
                      {rho >= 1 && " — поток превышает мощность"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr_150px_150px]">
                    <Stepper label={`${st.resource.name}, ${st.resource.unitName}`} value={sp.capacity} min={1} max={10} disabled={paramsDisabled} onChange={(v) => setStation(st.id, { capacity: v })} testId={`capacity-${st.id}`} />
                    <DistributionEditor stationId={st.id} value={sp.processTime} disabled={paramsDisabled} onChange={(d) => setStation(st.id, { processTime: d })} />
                    <NumberInput label="Ставка ресурса" unit="₽/ч" value={sp.hourlyCostRub} step={50} disabled={paramsDisabled} onChange={(v) => setStation(st.id, { hourlyCostRub: v })} />
                    <NumberInput label="Расходники на операцию" unit="₽" value={sp.consumablesPerOperationRub} step={10} disabled={paramsDisabled} onChange={(v) => setStation(st.id, { consumablesPerOperationRub: v })} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line/70 pt-3">
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!sp.failure}
                        disabled={paramsDisabled}
                        data-testid={`failure-toggle-${st.id}`}
                        onChange={(e) => setStation(st.id, { failure: e.target.checked ? { mtbfMin: 600, mttrMin: 30 } : null })}
                      />
                      Отказы оборудования
                    </label>
                    {sp.failure && (
                      <>
                        <div className="w-40">
                          <NumberInput label="Наработка на отказ (MTBF)" unit="мин" value={sp.failure.mtbfMin} min={10} step={30} disabled={paramsDisabled} onChange={(v) => setStation(st.id, { failure: { ...sp.failure!, mtbfMin: v } })} testId={`mtbf-${st.id}`} />
                        </div>
                        <div className="w-40">
                          <NumberInput label="Время ремонта (MTTR)" unit="мин" value={sp.failure.mttrMin} min={0.5} step={1} disabled={paramsDisabled} onChange={(v) => setStation(st.id, { failure: { ...sp.failure!, mttrMin: v } })} testId={`mttr-${st.id}`} />
                        </div>
                        <p className="pb-2 text-xs text-muted">Готовность ≈ {fmtPercent(availabilityOf(sp.failure), 1)}</p>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-faint">Среднее время операции: {fmtNumber(distributionMean(sp.processTime), 1)} мин</p>
                </div>
              );
            })}
          </div>
        </Panel>

        {run && (
          <Panel
            title="Результат последнего моделирования"
            subtitle={`${run.scenarioName}, ${fmtDateTime(run.createdAt)}, ${run.replications} репликаций`}
            actions={
              <>
                {baselineRunId && baselineRunId !== run.id && (
                  <Link href={`/compare?baseline=${baselineRunId}&runs=${run.id}`} className="text-sm text-accent-strong hover:underline">
                    Сравнить с базовым
                  </Link>
                )}
                <Link href={`/dashboard?run=${run.id}`} className="text-sm text-accent-strong hover:underline">
                  Дашборд
                </Link>
                <Link href={`/factory?run=${run.id}`} className="text-sm text-accent-strong hover:underline">
                  3D-тур
                </Link>
              </>
            }
          >
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="run-result">
              <div>
                <dt className="text-xs text-muted">Выпуск</dt>
                <dd className="text-lg font-semibold">{fmtNumber(run.aggregate.completed?.mean)} шт.</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Средний цикл</dt>
                <dd className="text-lg font-semibold">{fmtNumber(run.aggregate.cycleTimeAvgMin?.mean)} мин</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">НЗП на конец</dt>
                <dd className="text-lg font-semibold">{fmtNumber(run.aggregate.wipEnd?.mean)} шт.</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Стоимость единицы</dt>
                <dd className="text-lg font-semibold">{fmtRub(run.aggregate.costPerUnitRub?.mean)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {run.bottleneck ? (
                <>
                  <span className="text-muted">Узкое место:</span>
                  <span className="font-medium">{run.bottleneck.name}</span>
                  <StatusBadge status={run.bottleneck.status} />
                </>
              ) : (
                <span className="text-muted">Узких мест не обнаружено</span>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
