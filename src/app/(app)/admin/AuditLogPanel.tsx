"use client";

import { useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import type { AuditEntryDto } from "@/server/services/auditService";

const FILTERS: Array<[string, string]> = [
  ["", "Все действия"],
  ["login", "Входы"],
  ["scenario", "Сценарии"],
  ["simulation", "Моделирование"],
  ["run", "Прогоны"],
  ["user", "Пользователи"],
];

/** Журнал аудита: последние действия пользователей с фильтром по типу. */
export function AuditLogPanel({ initial }: { initial: AuditEntryDto[] }) {
  const [filter, setFilter] = useState("");
  const [entries, setEntries] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filter === "") {
      setEntries(initial);
      return;
    }
    let alive = true;
    fetch(`/api/admin/audit?limit=200&action=${encodeURIComponent(filter)}`)
      .then((r) => r.json() as Promise<{ entries?: AuditEntryDto[]; error?: { message?: string } }>)
      .then((d) => {
        if (!alive) return;
        if (d.entries) setEntries(d.entries);
        else setError(d.error?.message ?? "Не удалось загрузить журнал");
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [filter, initial]);

  return (
    <div data-testid="audit-log">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр журнала">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={
              filter === value
                ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs text-ink"
                : "rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink"
            }
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-crit">{error}</p>}
      <div className="-mx-4 mt-3 max-h-[420px] overflow-auto sm:mx-0">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-xs">
              <th className="py-2 pl-4 sm:pl-0">Время</th>
              <th className="py-2">Пользователь</th>
              <th className="py-2">Действие</th>
              <th className="py-2 pr-4 sm:pr-0">Подробности</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  Записей нет
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-line/70 align-top last:border-0">
                <td className="whitespace-nowrap py-1.5 pl-4 tabular-nums text-muted sm:pl-0">{fmtDateTime(e.at)}</td>
                <td className="py-1.5">{e.userLogin}</td>
                <td className={e.action === "login.failure" ? "py-1.5 text-crit" : "py-1.5"}>{e.actionLabel}</td>
                <td className="py-1.5 pr-4 text-muted [overflow-wrap:anywhere] sm:pr-0">{e.details ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
