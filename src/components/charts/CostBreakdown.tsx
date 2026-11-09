import { fmtRub } from "@/lib/format";

/** Структура полной стоимости: горизонтальная полоса с подписями (без цвета как единственного носителя смысла). */
export function CostBreakdown({
  items,
  total,
}: {
  items: Array<{ key: string; label: string; value: number }>;
  total: number;
}) {
  const shades = ["#276da8", "#6999bf", "#9bb8d1", "#ccdae7"];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-field" aria-hidden>
        {items.map((it, i) => (
          <div
            key={it.key}
            style={{ width: `${total > 0 ? (it.value / total) * 100 : 0}%`, background: shades[i % shades.length] }}
            className="h-full border-r-2 border-surface last:border-r-0"
          />
        ))}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {items.map((it, i) => (
          <div key={it.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: shades[i % shades.length] }} aria-hidden />
              {it.label}
            </dt>
            <dd className="tabular-nums">
              {fmtRub(it.value)}
              <span className="ml-2 text-faint">{total > 0 ? `${((it.value / total) * 100).toFixed(0)}%` : ""}</span>
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line pt-2 font-semibold">
          <dt>Итого за горизонт</dt>
          <dd>{fmtRub(total)}</dd>
        </div>
      </dl>
    </div>
  );
}
