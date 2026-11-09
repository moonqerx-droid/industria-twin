import { hashPassword } from "@/server/auth/session";
import type { RoleId } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { ApiError, notFound } from "@/server/http";
import { audit, type AuditActor } from "./auditService";

export interface UserDto {
  id: string;
  login: string;
  displayName: string;
  role: RoleId;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessions: number;
}

const select = {
  id: true,
  login: true,
  displayName: true,
  roleId: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  _count: { select: { sessions: true } },
} as const;

type Row = { id: string; login: string; displayName: string; roleId: string; isActive: boolean; createdAt: Date; lastLoginAt: Date | null; _count: { sessions: number } };

const toDto = (u: Row): UserDto => ({
  id: u.id,
  login: u.login,
  displayName: u.displayName,
  role: u.roleId as RoleId,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  activeSessions: u._count.sessions,
});

export async function listUsers(): Promise<UserDto[]> {
  return (await prisma.user.findMany({ select, orderBy: { login: "asc" } })).map(toDto);
}

/** Должен остаться хотя бы один активный администратор. */
async function assertAdminRemains(excludingUserId: string): Promise<void> {
  const others = await prisma.user.count({ where: { roleId: "admin", isActive: true, id: { not: excludingUserId } } });
  if (others === 0) throw new ApiError(409, "LAST_ADMIN", "Нельзя оставить систему без активного администратора");
}

export async function createUser(
  actor: AuditActor,
  input: { login: string; displayName: string; role: RoleId; password: string },
): Promise<UserDto> {
  const exists = await prisma.user.findUnique({ where: { login: input.login } });
  if (exists) throw new ApiError(409, "LOGIN_TAKEN", "Пользователь с таким логином уже существует");
  const u = await prisma.user.create({
    data: { login: input.login, displayName: input.displayName, roleId: input.role, passwordHash: await hashPassword(input.password) },
    select,
  });
  await audit(actor, "user.create", { entityType: "user", entityId: u.id, details: `${u.login}, роль ${u.roleId}` });
  return toDto(u);
}

export async function updateUser(
  actor: AuditActor & { id: string },
  id: string,
  input: { displayName?: string; role?: RoleId; isActive?: boolean; password?: string },
): Promise<UserDto> {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw notFound("Пользователь");
  const demotes = input.role !== undefined && input.role !== "admin" && current.roleId === "admin";
  const deactivates = input.isActive === false && current.isActive;
  if ((demotes || deactivates) && id === actor.id) throw new ApiError(409, "SELF_LOCKOUT", "Нельзя снять права администратора или заблокировать самого себя");
  if ((demotes || deactivates) && current.roleId === "admin") await assertAdminRemains(id);

  const u = await prisma.user.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.role !== undefined ? { roleId: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select,
  });
  // Блокировка и смена пароля отзывают все сессии пользователя.
  if (deactivates || input.password !== undefined) await prisma.session.deleteMany({ where: { userId: id } });
  const changes = [
    input.displayName !== undefined && input.displayName !== current.displayName ? "псевдоним" : null,
    input.role !== undefined && input.role !== current.roleId ? `роль ${current.roleId} → ${input.role}` : null,
    input.isActive !== undefined && input.isActive !== current.isActive ? (input.isActive ? "разблокирован" : "заблокирован") : null,
  ].filter(Boolean);
  if (changes.length) await audit(actor, "user.update", { entityType: "user", entityId: id, details: `${u.login}: ${changes.join(", ")}` });
  if (input.password !== undefined) await audit(actor, "user.password", { entityType: "user", entityId: id, details: `${u.login}: пароль задан администратором, сессии отозваны` });
  return toDto({ ...u, _count: { sessions: deactivates || input.password !== undefined ? 0 : u._count.sessions } });
}

/**
 * Удаление учётной записи (152-ФЗ: прекращение обработки по требованию субъекта).
 * Сценарии и прогоны сохраняются без автора; записи аудита обезличиваются.
 */
export async function deleteUser(actor: AuditActor & { id: string }, id: string): Promise<void> {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw notFound("Пользователь");
  if (id === actor.id) throw new ApiError(409, "SELF_LOCKOUT", "Нельзя удалить собственную учётную запись");
  if (current.roleId === "admin" && current.isActive) await assertAdminRemains(id);
  await prisma.$transaction([
    prisma.auditLog.updateMany({ where: { userId: id }, data: { userLogin: "удалённый пользователь" } }),
    prisma.auditLog.updateMany({ where: { entityType: "user", entityId: id }, data: { details: "данные удалённого пользователя обезличены" } }),
    prisma.user.delete({ where: { id } }),
  ]);
  await audit(actor, "user.delete", { entityType: "user", entityId: id, details: "учётная запись удалена, записи аудита обезличены" });
}
