import { audit } from "@/server/services/auditService";
import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, assertSameOrigin } from "@/server/auth/session";
import { SESSION_COOKIE, type RoleId } from "@/server/auth/token";
import { ApiError, handler, parseJson } from "@/server/http";
import { clientKey, enforce, loginLimiter } from "@/server/rateLimit";
import { throttledLogin } from "@/server/auth/loginThrottle";
import { prisma } from "@/server/db";
import { loginSchema } from "@/server/validation/schemas";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const { login, password } = await parseJson(req, loginSchema);
  const normalized = login.toLowerCase();
  // Жёсткий лимит по адресу — только когда адрес клиента достоверно известен (TRUST_PROXY=1).
  // Иначе все клиенты делили бы один ключ и посторонний мог бы заблокировать вход в чужую учётную запись.
  const source = clientKey(req);
  const ipKey = source === "direct" ? null : `${normalized}|${source}`;
  if (ipKey) enforce(loginLimiter, ipKey);
  // Попытки по логину: не больше одной одновременно и нарастающая задержка после неудач (без блокировки).
  const user = await throttledLogin(normalized, () => verifyCredentials(login, password));
  if (!user) {
    // В журнал не пишем введённый текст, если такого логина нет (это может быть ошибочно введённый пароль), и не пишем адрес.
    const known = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true } });
    await audit(known ? { id: known.id, login: known.login } : { id: null, login: "неизвестный логин" }, "login.failure");
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  }
  if (ipKey) loginLimiter.clear(ipKey);
  await audit({ id: user.id, login: user.login }, "login.success");
  const { token, expiresAt } = await createSession(user.id, user.roleId as RoleId);
  const res = NextResponse.json({ user: { login: user.login, displayName: user.displayName, role: user.roleId } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
