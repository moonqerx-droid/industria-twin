"use client";

import { useId, type ReactNode } from "react";

const inputCls =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-1.5 text-sm tabular-nums text-ink focus:border-accent focus:outline-none disabled:opacity-60";

/** Числовое поле со слайдером. `scale` — множитель отображения (например, 100 для долей → %). */
export function SliderField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  scale = 1,
  hint,
  disabled,
  testId,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  scale?: number;
  hint?: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  const shown = Math.round(value * scale * 1000) / 1000;
  const set = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(max, Math.max(min, raw));
    onChange(clamped / scale);
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <span className="text-xs text-faint">
          {min}–{max} {unit}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="range"
          aria-label={`${label}, ползунок`}
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          onChange={(e) => set(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <div className="flex w-32 shrink-0 items-center gap-1.5">
          <input
            id={id}
            data-testid={testId}
            type="number"
            min={min}
            max={max}
            step={step}
            value={shown}
            disabled={disabled}
            onChange={(e) => set(Number(e.target.value))}
            className={inputCls}
          />
          <span className="w-10 text-xs text-muted">{unit}</span>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled,
  unit,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  unit?: string;
  testId?: string;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      {unit ? `, ${unit}` : ""}
      <input
        type="number"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={`${inputCls} mt-1`}
      />
    </label>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  testId?: string;
}) {
  const btn =
    "h-8 w-8 rounded-[var(--radius-control)] border border-line-strong bg-raised text-ink hover:border-accent disabled:opacity-40";
  return (
    <div className="text-xs text-muted">
      {label}
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" className={btn} aria-label={`${label}: уменьшить`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output data-testid={testId} className="w-8 text-center text-base font-semibold text-ink tabular-nums" aria-live="polite">
          {value}
        </output>
        <button type="button" className={btn} aria-label={`${label}: увеличить`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
