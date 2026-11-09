"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fmtDateTime } from "@/lib/format";
import type { UserDto } from "@/server/services/userService";

type Role = UserDto["role"];
const ROLE_LABELS: Record<Role, string> = { admin: "Администратор", engineer: "Инженер-технолог", viewer: "Наблюдатель" };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: Array<{ path: string; message: string }> | null } };
  if (!res.ok) {
    const det = Array.isArray(data.error?.details) ? data.error!.details!.map((d) => d.message).join("; ") : "";
    throw new Error(`${data.error?.message ?? `Ошибка ${res.status}`}${det ? `: ${det}` : ""}`);
  }
  return data as { user?: UserDto };
}

/** Управление учётными записями: создание, роль, блокировка, пароль, удаление (с защитой от самоблокировки). */
export function UserAdmin({ users: initialUsers, currentUserId }: { users: UserDto[]; currentUserId: string }) {
  const router = useRouter();
  // Список обновляется сразу по ответу API, а затем синхронизируется с сервером (router.refresh).
  const [users, setUsers] = useState(initialUsers);
  useEffect(() => setUsers(initialUsers), [initialUsers]);
  const upsert = (u: UserDto) => setUsers((list) => (list.some((x) => x.id === u.id) ? list.map((x) => (x.id === u.id ? u : x)) : [...list, u].sort((a, b) => a.login.localeCompare(b.login))));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ login: "", displayName: "", role: "viewer" as Role, password: "" });

  async function run(key: string, fn: () => Promise<{ user?: UserDto } | void>, ok: string, removeId?: string) {
    setBusy(key);
    setMessage(null);
    try {
      const data = await fn();
      if (data && data.user) upsert(data.user);
      if (removeId) setUsers((list) => list.filter((x) => x.id !== removeId));
      setMessage({ tone: "ok", text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="user-admin">
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={clsx(
            "mb-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
            message.tone === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-crit/40 bg-crit/10 text-crit",
          )}
        >
          {message.text}
        </p>
      )}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs">
              <th className="py-2 pl-4 sm:pl-0">Логин</th>
              <th className="py-2">Псевдоним</th>
              <th className="py-2">Роль</th>
              <th className="py-2">Последний вход</th>
              <th className="py-2">Состояние</th>
              <th className="py-2 pr-4 text-right sm:pr-0">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-line/70 last:border-0" data-login={u.login}>
                  <td className="py-2 pl-4 font-medium sm:pl-0">
                    {u.login}
                    {self && <span className="ml-1.5 text-xs text-faint">(вы)</span>}
                  </td>
                  <td className="py-2 text-muted">{u.displayName}</td>
                  <td className="py-2">
                    <select
                      aria-label={`Роль ${u.login}`}
                      value={u.role}
                      disabled={busy !== null || self}
                      onChange={(e) =>
                        run(`role-${u.id}`, () => call(`/api/admin/users/${u.id}`, "PATCH", { role: e.target.value }), `Роль ${u.login} изменена`)
                      }
                      className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1 text-sm"
                    >
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}</td>
                  <td className="py-2">
                    {u.isActive ? <span className="text-ok">активен</span> : <span className="text-crit">заблокирован</span>}
                    {u.activeSessions > 0 && <span className="ml-1 text-xs text-faint">· сессий: {u.activeSessions}</span>}
                  </td>
                  <td className="py-2 pr-4 sm:pr-0">
                    <div className="flex justify-end gap-1.5">
                      {!self && (
                        <Button
                          className="min-h-8 px-2.5 py-1 text-xs"
                          disabled={busy !== null}
                          onClick={() =>
                            run(
                              `active-${u.id}`,
                              () => call(`/api/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive }),
                              u.isActive ? `${u.login} заблокирован, сессии отозваны` : `${u.login} разблокирован`,
                            )
                          }
                        >
                          {u.isActive ? "Заблокировать" : "Разблокировать"}
                        </Button>
                      )}
                      <Button
                        className="min-h-8 px-2.5 py-1 text-xs"
                        disabled={busy !== null}
                        onClick={() => {
                          const password = window.prompt(`Новый пароль для ${u.login} (не короче 10 символов, буквы и цифры):`);
                          if (password) void run(`pwd-${u.id}`, () => call(`/api/admin/users/${u.id}`, "PATCH", { password }), `Пароль ${u.login} изменён, сессии отозваны`);
                        }}
                      >
                        Пароль
                      </Button>
                      {!self && (
                        <Button
                          variant="danger"
                          className="min-h-8 px-2.5 py-1 text-xs"
                          disabled={busy !== null}
                          onClick={() => {
                            if (window.confirm(`Удалить учётную запись ${u.login}? Сценарии сохранятся без автора, записи аудита будут обезличены.`))
                              void run(`del-${u.id}`, () => call(`/api/admin/users/${u.id}`, "DELETE").then(() => undefined), `Учётная запись ${u.login} удалена`, u.id);
                          }}
                        >
                          Удалить
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_1fr_auto] lg:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run("create", () => call("/api/admin/users", "POST", form), `Пользователь ${form.login} создан`);
          if (ok) setForm({ login: "", displayName: "", role: "viewer", password: "" });
        }}
        aria-label="Новый пользователь"
      >
        <label className="block text-xs text-muted">
          Логин
          <input required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })} className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-sm text-ink" placeholder="ivanov" autoComplete="off" />
        </label>
        <label className="block text-xs text-muted">
          Псевдоним (без ФИО)
          <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-sm text-ink" placeholder="Технолог участка B" autoComplete="off" />
        </label>
        <label className="block text-xs text-muted">
          Роль
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-sm text-ink">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Пароль
          <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-sm text-ink" autoComplete="new-password" />
        </label>
        <Button type="submit" variant="primary" disabled={busy !== null}>
          {busy === "create" ? "Создаём…" : "Создать"}
        </Button>
      </form>
      <p className="mt-3 text-xs text-faint">
        Хранятся только логин, псевдоним и bcrypt-хеш пароля. Блокировка и смена пароля сразу отзывают сессии. Удаление учётной записи
        обезличивает её записи в журнале аудита (152-ФЗ). Нельзя заблокировать, понизить или удалить себя и последнего администратора.
      </p>
    </div>
  );
}
