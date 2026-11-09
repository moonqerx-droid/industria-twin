"use client";

import { Download, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STATIONS, type ScenarioParameters } from "@/domain/model/demoData";
import { exportScenario, parseScenarioJson, parseStationsCsv, stationsToCsv } from "@/domain/model/scenarioExchange";
import { Button } from "@/components/ui/Button";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (s: string) => s.replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "scenario";

/**
 * Экспорт сценария (JSON, таблица участков CSV) и импорт в новый сценарий.
 * Импорт никогда не перезаписывает существующий сценарий: создаётся новый, его можно сравнить с базовым.
 */
export function ScenarioExchange({
  name,
  description,
  params,
  canEdit,
}: {
  name: string;
  description: string;
  params: ScenarioParameters;
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Признак готовности обработчиков (после гидратации) — для автотестов и вспомогательных технологий.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function create(body: { name: string; description: string; parameters: ScenarioParameters }) {
    const res = await fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as {
      scenario?: { id: string };
      error?: { message?: string; details?: Array<{ path: string; message: string }> | null };
    };
    if (!res.ok || !data.scenario) {
      const det = Array.isArray(data.error?.details) ? data.error!.details!.map((d) => `${d.path}: ${d.message}`) : [];
      throw Object.assign(new Error(data.error?.message ?? `Ошибка ${res.status}`), { details: det });
    }
    return data.scenario.id;
  }

  async function onFile(file: File) {
    setErrors([]);
    setBusy(true);
    try {
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{");
      let body: { name: string; description: string; parameters: ScenarioParameters };
      if (isJson) {
        const r = parseScenarioJson(text);
        if (!r.scenario) return setErrors(r.errors);
        body = { name: `Импорт: ${r.scenario.name}`.slice(0, 120), description: r.scenario.description, parameters: r.scenario.parameters };
      } else {
        const r = parseStationsCsv(text, params);
        if (!r.parameters) return setErrors(r.errors);
        const changed = r.changedStations.map((id) => STATIONS.find((s) => s.id === id)!.code).join(", ") || "нет изменений";
        body = {
          name: `Импорт CSV: ${file.name}`.slice(0, 120),
          description: `Параметры участков из файла ${file.name} поверх «${name}». Изменены участки: ${changed}.`.slice(0, 1000),
          parameters: r.parameters,
        };
      }
      const id = await create(body);
      router.push(`/scenarios?id=${id}`);
      router.refresh();
    } catch (e) {
      const err = e as Error & { details?: string[] };
      setErrors([err.message, ...(err.details ?? [])]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3.5" aria-labelledby="exchange-title" data-testid="scenario-exchange" data-ready={ready ? "true" : "false"}>
      <h2 id="exchange-title" className="text-sm font-semibold">
        Данные сценария
      </h2>
      <p className="mt-1 text-xs text-muted">
        Выгрузите таблицу участков, заполните фактическими данными в Excel и загрузите обратно — будет создан новый сценарий.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Button className="justify-start" onClick={() => download(`${slug(name)}-uchastki.csv`, stationsToCsv(params), "text/csv;charset=utf-8")} data-testid="export-stations-csv">
          <Download className="h-4 w-4" aria-hidden /> Таблица участков (CSV)
        </Button>
        <Button
          className="justify-start"
          onClick={() => download(`${slug(name)}.json`, JSON.stringify(exportScenario(name, description, params), null, 2), "application/json")}
          data-testid="export-scenario-json"
        >
          <Download className="h-4 w-4" aria-hidden /> Сценарий целиком (JSON)
        </Button>
        {canEdit && (
          <>
            <input
              ref={input}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              aria-label="Файл для импорта"
              data-testid="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button variant="primary" className="justify-start" disabled={busy} onClick={() => input.current?.click()}>
              <FileUp className="h-4 w-4" aria-hidden /> {busy ? "Импорт…" : "Импорт CSV или JSON"}
            </Button>
          </>
        )}
      </div>
      {errors.length > 0 && (
        <div role="alert" className="mt-3 rounded-[var(--radius-control)] border border-crit/40 bg-crit/5 px-3 py-2 text-xs text-crit" data-testid="import-errors">
          <p className="font-semibold">Файл не импортирован:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {errors.length > 12 && <p className="mt-1">…и ещё {errors.length - 12}</p>}
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint">
        CSV: разделитель «;», десятичная запятая. Столбцы: code или stationId, capacity, distribution (fixed, exponential, uniform,
        triangular, normal), min, mode, max, mean, sd, hourlyCostRub, consumablesPerOperationRub, mtbfMin, mttrMin. Пустая ячейка —
        значение текущего сценария.
      </p>
    </section>
  );
}
