import bcrypt from "bcryptjs";
import { hashPassword, requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError, handler, json, parseJson } from "@/server/http";
import { enforce, passwordChangeLimiter } from "@/server/rateLimit";
import { audit } from "@/server/services/auditService";
import { passwordChangeSchema } from "@/server/validation/schemas";

/** Смена собственного пароля: нужен текущий пароль; остальные сессии пользователя отзываются. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req, "model:read");
  enforce(passwordChangeLimiter, user.id);
  const { currentPassword, newPassword } = await parseJson(req, passwordChangeSchema);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
    throw new ApiError(400, "WRONG_PASSWORD", "Текущий пароль указан неверно");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  const revoked = await prisma.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
  passwordChangeLimiter.clear(user.id);
  await audit(user, "user.password", { entityType: "user", entityId: user.id, details: `смена собственного пароля, других сессий отозвано: ${revoked.count}` });
  return json({ ok: true, revokedSessions: revoked.count });
});
