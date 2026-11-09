"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: fd.get("login"), password: fd.get("password") }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Не удалось войти");
        return;
      }
      window.location.assign(next);
    } catch {
      setError("Сервер недоступен. Проверьте, что приложение запущено.");
    } finally {
      setPending(false);
    }
  }

  const input =
    "mt-1.5 block w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-3 py-2.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      <label className="block text-sm">
        Логин
        <input name="login" autoComplete="username" required className={input} placeholder="engineer" />
      </label>
      <label className="block text-sm">
        Пароль
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {error && (
        <p role="alert" className="rounded-[var(--radius-control)] border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Проверяем…" : "Войти"}
      </Button>
    </form>
  );
}
