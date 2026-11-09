/**
 * Обмен сценариями: экспорт в JSON, таблица параметров участков в CSV и импорт с проверкой.
 *
 * Назначение — загрузка данных организаторов или фактических данных цеха без интеграций с ERP/MES:
 * пользователь выгружает шаблон CSV текущего сценария, заполняет его в Excel и загружает обратно.
 * CSV — разделитель «;», десятичная запятая или точка, кодировка UTF-8 (BOM допускается).
 * Модуль чистый; окончательную проверку выполняет сервер (Zod) при создании сценария.
 */
import { validateConfig } from "../simulation/engine";
import { validateDistribution, type DistributionKind, type DurationDistribution } from "../simulation/distributions";
import { ENGINE_LIMITS } from "../simulation/types";
import { STATIONS, type ScenarioParameters, type StationId, type StationParameters } from "./demoData";
import { buildSimulationConfig } from "./scenarioConfig";

export const SCENARIO_FORMAT = "industria-twin/scenario@1";

export interface ScenarioExport {
  format: typeof SCENARIO_FORMAT;
  exportedAt: string;
  name: string;
  description: string;
  parameters: ScenarioParameters;
}

export function exportScenario(name: string, description: string, parameters: ScenarioParameters, now = new Date()): ScenarioExport {
  return { format: SCENARIO_FORMAT, exportedAt: now.toISOString(), name, description, parameters };
}

export const CSV_COLUMNS = [
  "code",
  "stationId",
  "name",
  "capacity",
  "distribution",
  "min",
  "mode",
  "max",
  "mean",
  "sd",
  "hourlyCostRub",
  "consumablesPerOperationRub",
  "mtbfMin",
  "mttrMin",
] as const;

const DISTRIBUTIONS: DistributionKind[] = ["fixed", "exponential", "uniform", "triangular", "normal"];

/**
 * Защита от формул в CSV (CSV/formula injection): текстовая ячейка, начинающаяся с «=», «+», «-», «@»,
 * табуляции или перевода строки, получает префикс-апостроф, и табличный редактор не исполнит её как формулу.
 * Числа (в том числе отрицательные) не изменяются.
 */
export function neutralizeFormula(v: string): string {
  if (/^-?\d+([.,]\d+)?$/.test(v.trim())) return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const fmt = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v).replace(".", ","));

function distributionCells(d: DurationDistribution): Record<"min" | "mode" | "max" | "mean" | "sd", number | undefined> {
  switch (d.kind) {
    case "fixed":
      return { min: undefined, mode: undefined, max: undefined, mean: d.value, sd: undefined };
    case "exponential":
      return { min: undefined, mode: undefined, max: undefined, mean: d.mean, sd: undefined };
    case "uniform":
      return { min: d.min, mode: undefined, max: d.max, mean: undefined, sd: undefined };
    case "triangular":
      return { min: d.min, mode: d.mode, max: d.max, mean: undefined, sd: undefined };
    case "normal":
      return { min: d.min, mode: undefined, max: undefined, mean: d.mean, sd: d.sd };
  }
}

/** Таблица параметров участков (по строке на участок) — шаблон для заполнения фактическими данными. */
export function stationsToCsv(p: ScenarioParameters): string {
  const lines = [CSV_COLUMNS.join(";")];
  for (const st of STATIONS) {
    const sp = p.stations[st.id];
    const c = distributionCells(sp.processTime);
    lines.push(
      [
        st.code,
        st.id,
        neutralizeFormula(st.name),
        sp.capacity,
        sp.processTime.kind,
        fmt(c.min),
        fmt(c.mode),
        fmt(c.max),
        fmt(c.mean),
        fmt(c.sd),
        fmt(sp.hourlyCostRub),
        fmt(sp.consumablesPerOperationRub),
        fmt(sp.failure?.mtbfMin),
        fmt(sp.failure?.mttrMin),
      ].join(";"),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export interface ImportResult {
  parameters: ScenarioParameters | null;
  errors: string[];
  /** Участки, параметры которых отличаются от исходных. */
  changedStations: StationId[];
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : Number.NaN;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Применяет таблицу участков к исходным параметрам. Строки ищутся по stationId или коду участка. */
export function parseStationsCsv(text: string, base: ScenarioParameters): ImportResult {
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { parameters: null, errors: ["Файл пуст: нужна строка заголовка и хотя бы одна строка участка"], changedStations: [] };
  const sep = lines[0]!.includes(";") ? ";" : lines[0]!.includes("\t") ? "\t" : ",";
  const header = splitCsvLine(lines[0]!, sep).map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  if (col("stationId") < 0 && col("code") < 0) errors.push("В заголовке нет столбца stationId или code");
  const PARAM_COLUMNS = ["capacity", "distribution", "hourlyCostRub", "consumablesPerOperationRub", "mtbfMin", "mttrMin"];
  if (!PARAM_COLUMNS.some((c) => col(c) >= 0)) errors.push(`В заголовке нет ни одного столбца параметров (${PARAM_COLUMNS.join(", ")})`);
  if (errors.length) return { parameters: null, errors, changedStations: [] };

  const stations = { ...base.stations };
  const seen = new Set<StationId>();
  lines.slice(1).forEach((line, idx) => {
    const rowNo = idx + 2;
    const cells = splitCsvLine(line, sep);
    const get = (name: string) => (col(name) >= 0 ? cells[col(name)]?.trim() : undefined);
    const id = get("stationId");
    const code = get("code");
    const def = STATIONS.find((s) => (id && s.id === id) || (code && s.code.toLowerCase() === code.toLowerCase()));
    if (!def) {
      errors.push(`Строка ${rowNo}: неизвестный участок «${id || code || "—"}»`);
      return;
    }
    if (seen.has(def.id)) {
      errors.push(`Строка ${rowNo}: участок ${def.code} указан повторно`);
      return;
    }
    seen.add(def.id);
    const prev = stations[def.id];
    const next: StationParameters = { ...prev };
    const where = `Строка ${rowNo} (${def.code})`;

    const cap = parseNumber(get("capacity"));
    if (cap !== undefined) {
      if (!Number.isInteger(cap) || cap < 1 || cap > ENGINE_LIMITS.maxCapacity) errors.push(`${where}: capacity — целое 1..${ENGINE_LIMITS.maxCapacity}`);
      else next.capacity = cap;
    }

    const kindRaw = get("distribution");
    if (kindRaw) {
      const kind = kindRaw.toLowerCase() as DistributionKind;
      if (!DISTRIBUTIONS.includes(kind)) errors.push(`${where}: distribution — одно из ${DISTRIBUTIONS.join(", ")}`);
      else {
        const n = (k: string) => parseNumber(get(k));
        const need = (k: string): number => {
          const v = n(k);
          if (v === undefined || Number.isNaN(v)) {
            errors.push(`${where}: для распределения ${kind} нужен столбец ${k}`);
            return Number.NaN;
          }
          return v;
        };
        let d: DurationDistribution;
        switch (kind) {
          case "fixed":
            d = { kind, value: need("mean") };
            break;
          case "exponential":
            d = { kind, mean: need("mean") };
            break;
          case "uniform":
            d = { kind, min: need("min"), max: need("max") };
            break;
          case "triangular":
            d = { kind, min: need("min"), mode: need("mode"), max: need("max") };
            break;
          case "normal":
            d = { kind, mean: need("mean"), sd: need("sd"), min: n("min") ?? 0 };
            break;
        }
        const derr = validateDistribution(d);
        if (derr.length) errors.push(`${where}: ${derr.join("; ")}`);
        else next.processTime = d;
      }
    }

    for (const key of ["hourlyCostRub", "consumablesPerOperationRub"] as const) {
      const v = parseNumber(get(key));
      if (v === undefined) continue;
      if (Number.isNaN(v) || v < 0) errors.push(`${where}: ${key} — неотрицательное число`);
      else next[key] = v;
    }

    if (col("mtbfMin") >= 0 || col("mttrMin") >= 0) {
      const mtbf = parseNumber(get("mtbfMin"));
      const mttr = parseNumber(get("mttrMin"));
      if (mtbf === undefined && mttr === undefined) {
        if (prev.failure) next.failure = null;
      }
      else if (mtbf === undefined || mttr === undefined || Number.isNaN(mtbf) || Number.isNaN(mttr) || mtbf < 10 || mttr < 0.5)
        errors.push(`${where}: отказы задаются парой mtbfMin ≥ 10 и mttrMin ≥ 0,5 (или оба пусты — без отказов)`);
      else next.failure = { mtbfMin: mtbf, mttrMin: mttr };
    }
    stations[def.id] = next;
  });

  if (errors.length) return { parameters: null, errors, changedStations: [] };
  const parameters = { ...base, stations };
  const engineIssues = validateConfig(buildSimulationConfig(parameters));
  if (engineIssues.length) return { parameters: null, errors: engineIssues, changedStations: [] };
  const changedStations = STATIONS.filter((s) => JSON.stringify(base.stations[s.id]) !== JSON.stringify(stations[s.id])).map((s) => s.id);
  return { parameters, errors: [], changedStations };
}

/** Разбирает экспортированный сценарий (JSON). Структуру окончательно проверяет сервер. */
export function parseScenarioJson(text: string): { scenario: ScenarioExport | null; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { scenario: null, errors: ["Файл не является корректным JSON"] };
  }
  const o = data as Partial<ScenarioExport>;
  if (!o || typeof o !== "object" || o.format !== SCENARIO_FORMAT)
    return { scenario: null, errors: [`Неизвестный формат: ожидается "${SCENARIO_FORMAT}"`] };
  if (typeof o.name !== "string" || !o.parameters || typeof o.parameters !== "object")
    return { scenario: null, errors: ["В файле нет названия или параметров сценария"] };
  const p = o.parameters as ScenarioParameters;
  const missing = STATIONS.filter((s) => !p.stations?.[s.id]).map((s) => s.code);
  if (missing.length) return { scenario: null, errors: [`Нет параметров участков: ${missing.join(", ")}`] };
  try {
    const issues = validateConfig(buildSimulationConfig(p));
    if (issues.length) return { scenario: null, errors: issues };
  } catch {
    return { scenario: null, errors: ["Параметры сценария повреждены"] };
  }
  return { scenario: { ...(o as ScenarioExport), description: typeof o.description === "string" ? o.description : "" }, errors: [] };
}
