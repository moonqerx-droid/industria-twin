"use client";

import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const mismatch = form.repeat !== "" && form.repeat !== form.newPassword;

  return (
    <form
      className="max-w-md space-y-4"
      aria-label="Смена пароля"
      onSubmit={async (e) => {
        e.preventDefault();
        if (mismatch) return;
        setBusy(true);
        setMessage(null);
        try {
          const res = await fetch("/api/auth/password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            revokedSessions?: number;
            error?: { message?: string; details?: Array<{ message: string }> | null };
          };
          if (!res.ok) {
            const det = Array.isArray(data.error?.details) ? data.error!.details!.map((d) => d.message).join("; ") : "";
            throw new Error(`${data.error?.message ?? `Ошибка ${res.status}`}${det ? `: ${det}` : ""}`);
          }
          setMessage({ tone: "ok", text: `Пароль изменён. Других сессий завершено: ${data.revokedSessions ?? 0}.` });
          setForm({ currentPassword: "", newPassword: "", repeat: "" });
        } catch (err) {
          setMessage({ tone: "error", text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={clsx(
            "rounded-[var(--radius-control)] border px-3 py-2 text-sm",
            message.tone === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-crit/40 bg-crit/10 text-crit",
          )}
        >
          {message.text}
        </p>
      )}
      {(
        [
          ["currentPassword", "Текущий пароль", "current-password"],
          ["newPassword", "Новый пароль", "new-password"],
          ["repeat", "Повторите новый пароль", "new-password"],
        ] as const
      ).map(([key, label, ac]) => (
        <label key={key} className="block text-sm">
          {label}
          <input
            type="password"
            required
            autoComplete={ac}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="mt-1.5 w-full rounded-[var(--radius-control)] border border-line-strong bg-field px-2.5 py-2 text-ink"
            aria-invalid={key === "repeat" && mismatch ? true : undefined}
          />
        </label>
      ))}
      {mismatch && <p className="text-sm text-crit">Пароли не совпадают</p>}
      <p className="text-xs text-muted">Не короче 10 символов, буквы и цифры. После смены пароля сеансы на других устройствах завершаются.</p>
      <Button type="submit" variant="primary" disabled={busy || mismatch}>
        {busy ? "Сохраняем…" : "Сменить пароль"}
      </Button>
    </form>
  );
}
