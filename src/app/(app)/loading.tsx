export default function Loading() {
  return (
    <div role="status" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-panel)] border border-line bg-surface" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-[var(--radius-panel)] border border-line bg-surface" />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
