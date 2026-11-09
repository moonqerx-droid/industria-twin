"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg rounded-[var(--radius-panel)] border border-crit/40 bg-crit/5 p-6">
      <h1 className="text-lg font-semibold">Страница не загрузилась</h1>
      <p className="mt-2 text-sm text-muted">
        {error.message || "Внутренняя ошибка"}. Проверьте, что база данных создана (npm run setup), и повторите попытку.
      </p>
      <button onClick={reset} className="mt-4 rounded-[var(--radius-control)] bg-accent px-3.5 py-1.5 text-sm font-semibold text-field">
        Повторить
      </button>
    </div>
  );
}
