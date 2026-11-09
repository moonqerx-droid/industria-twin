import { formatMetricValue, type MetricDefinition } from "@/domain/model/metrics";

export function fmtNumber(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

export function fmtPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;
}

export function fmtRub(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("ru-RU")} ₽`;
}

export function fmtMinutes(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 120) return `${(v / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
  return `${v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мин`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Значение метрики с единицей измерения согласно каталогу метрик. */
export function fmtMetric(def: MetricDefinition<string>, v: number | null | undefined): string {
  const s = formatMetricValue(def, v);
  return s === "—" ? s : `${s} ${def.unit}`;
}

export function fmtSigned(v: number | null, digits = 1, suffix = ""): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("ru-RU", { maximumFractionDigits: digits });
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${s}${suffix}`;
}
