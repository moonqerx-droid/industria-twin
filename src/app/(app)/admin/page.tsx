import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ENGINE_LIMITS, ENGINE_VERSION } from "@/domain/simulation/types";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { PERMISSIONS, ROLE_LABELS } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import type { RoleId } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { RunAdminTable } from "./RunAdminTable";

export const metadata: Metadata = { title: "Администрирование" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");
  const [users, runs, counts] = await Promise.all([
    prisma.user.findMany({ select: { id: true, login: true, displayName: true, roleId: true, isActive: true, lastLoginAt: true }, orderBy: { login: "asc" } }),
    prisma.simulationRun.findMany({ select: { id: true, scenarioName: true, createdAt: true, replications: true, durationMs: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    Promise.all([prisma.scenario.count(), prisma.simulationRun.count(), prisma.session.count()]),
  ]);
  const roles: RoleId[] = ["admin", "engineer", "viewer"];
  return (
    <>
      <PageHeader title="Администрирование" description="Пользователи, права ролей, прогоны и параметры системы." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Пользователи">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-normal">Логин</th>
                <th className="py-2 font-normal">Псевдоним</th>
                <th className="py-2 font-normal">Роль</th>
                <th className="py-2 font-normal">Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2">{u.login}</td>
                  <td className="py-2 text-muted">{u.displayName}</td>
                  <td className="py-2">{ROLE_LABELS[u.roleId as RoleId]}</td>
                  <td className="py-2 text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt.toISOString()) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-faint">Хранятся только логин, псевдоним и хеш пароля. Активных сессий: {counts[2]}.</p>
        </Panel>
        <Panel title="Права ролей">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-normal">Действие</th>
                {roles.map((r) => (
                  <th key={r} className="py-2 text-center font-normal">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([perm, allowed]) => (
                <tr key={perm} className="border-b border-line/70 last:border-0">
                  <td className="py-1.5"><code className="text-xs">{perm}</code></td>
                  {roles.map((r) => (
                    <td key={r} className="py-1.5 text-center">
                      {(allowed as readonly string[]).includes(r) ? <span className="text-ok">да</span> : <span className="text-faint">нет</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Прогоны моделирования" subtitle={`Всего: ${counts[1]}, сценариев: ${counts[0]}`} className="lg:col-span-2">
          <RunAdminTable runs={runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
        </Panel>
        <Panel title="Параметры системы" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-muted">Версия движка</dt>
            <dd>{ENGINE_VERSION}</dd>
            <dt className="text-muted">Макс. горизонт</dt>
            <dd>{fmtNumber(ENGINE_LIMITS.maxHorizonMin, 0)} мин</dd>
            <dt className="text-muted">Лимит событий</dt>
            <dd>{fmtNumber(ENGINE_LIMITS.maxEvents, 0)}</dd>
            <dt className="text-muted">Запусков в минуту</dt>
            <dd>12 на пользователя</dd>
          </dl>
        </Panel>
      </div>
    </>
  );
}
