import { prisma } from "@/server/db";

/**
 * Журнал аудита. Запись никогда не прерывает основное действие: ошибка записи только логируется.
 * Хранятся логин-псевдоним, тип действия, объект и краткое описание без персональных данных.
 * Записи старше AUDIT_RETENTION_DAYS удаляются (минимизация хранимых данных).
 */
export const AUDIT_RETENTION_DAYS = 180;

export type AuditAction =
  | "login.success"
  | "login.failure"
  | "logout"
  | "scenario.create"
  | "scenario.update"
  | "scenario.copy"
  | "scenario.delete"
  | "simulation.run"
  | "run.delete"
  | "user.create"
  | "user.update"
  | "user.password"
  | "user.delete";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "login.success": "Вход",
  "login.failure": "Неуспешный вход",
  logout: "Выход",
  "scenario.create": "Создание сценария",
  "scenario.update": "Изменение сценария",
  "scenario.copy": "Копирование сценария",
  "scenario.delete": "Удаление сценария",
  "simulation.run": "Запуск моделирования",
  "run.delete": "Удаление прогона",
  "user.create": "Создание пользователя",
  "user.update": "Изменение пользователя",
  "user.password": "Смена пароля",
  "user.delete": "Удаление пользователя",
};

export interface AuditActor {
  id: string | null;
  login: string;
}

let writes = 0;

export async function audit(
  actor: AuditActor | null,
  action: AuditAction,
  opts: { entityType?: string; entityId?: string; details?: string } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor?.id ?? null,
        userLogin: actor?.login ?? "—",
        action,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details?.slice(0, 500) ?? null,
      },
    });
    writes += 1;
    if (writes % 50 === 1) {
      await prisma.auditLog.deleteMany({ where: { at: { lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000) } } });
    }
  } catch (err) {
    console.error("[audit] запись не сохранена", err);
  }
}

export interface AuditEntryDto {
  id: string;
  at: string;
  userLogin: string;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
}

export async function listAudit(opts: { limit?: number; action?: string } = {}): Promise<AuditEntryDto[]> {
  const rows = await prisma.auditLog.findMany({
    where: opts.action ? { action: { startsWith: opts.action } } : {},
    orderBy: { at: "desc" },
    take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    userLogin: r.userLogin,
    action: r.action,
    actionLabel: AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: r.details,
  }));
}
