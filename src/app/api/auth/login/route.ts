import { audit } from "@/server/services/auditService";
import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, assertSameOrigin } from "@/server/auth/session";
import { SESSION_COOKIE, type RoleId } from "@/server/auth/token";
import { ApiError, handler, parseJson } from "@/server/http";
import { clientKey, enforce, loginAccountLimiter, loginLimiter } from "@/server/rateLimit";
import { prisma } from "@/server/db";
import { loginSchema } from "@/server/validation/schemas";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const { login, password } = await parseJson(req, loginSchema);
  const normalized = login.toLowerCase();
  const key = `${normalized}|${clientKey(req)}`;
  // Попытка регистрируется до проверки пароля: параллельные запросы не обходят лимит.
  // Успешный вход затем сбрасывает счётчики, поэтому лимит фактически расходуют только неудачи.
  enforce(loginLimiter, key);
  enforce(loginAccountLimiter, normalized);
  const user = await verifyCredentials(login, password);
  if (!user) {
    // В журнал не пишем введённый текст, если такого логина нет (это может быть ошибочно введённый пароль), и не пишем адрес.
    const known = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true } });
    await audit(known ? { id: known.id, login: known.login } : { id: null, login: "неизвестный логин" }, "login.failure");
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  }
  loginLimiter.clear(key);
  loginAccountLimiter.clear(normalized);
  await audit({ id: user.id, login: user.login }, "login.success");
  const { token, expiresAt } = await createSession(user.id, user.roleId as RoleId);
  const res = NextResponse.json({ user: { login: user.login, displayName: user.displayName, role: user.roleId } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
