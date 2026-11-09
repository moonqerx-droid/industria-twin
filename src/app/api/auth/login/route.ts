import { audit } from "@/server/services/auditService";
import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, assertSameOrigin } from "@/server/auth/session";
import { DEVICE_COOKIE, DEVICE_TTL_SECONDS, SESSION_COOKIE, signDeviceToken, verifyDeviceToken, type RoleId } from "@/server/auth/token";
import { ApiError, handler, parseJson } from "@/server/http";
import { deviceLoginLimiter, enforce, loginLimiter } from "@/server/rateLimit";
import { prisma } from "@/server/db";
import { loginSchema } from "@/server/validation/schemas";

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const { login, password } = await parseJson(req, loginSchema);
  const normalized = login.toLowerCase();
  // Устройство считается доверенным, если на нём уже был успешный вход в эту же учётную запись.
  const device = await verifyDeviceToken(readCookie(req, DEVICE_COOKIE));
  const trusted = device !== null && device.login === normalized;
  const [limiter, key] = trusted ? [deviceLoginLimiter, `${normalized}|${device.deviceId}`] : [loginLimiter, normalized];
  // Попытка регистрируется до проверки пароля: параллельные запросы не обходят лимит.
  enforce(limiter, key);
  const user = await verifyCredentials(login, password);
  if (!user) {
    // В журнал не пишем введённый текст, если такого логина нет (это может быть ошибочно введённый пароль), и не пишем адрес.
    const known = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true } });
    await audit(known ? { id: known.id, login: known.login } : { id: null, login: "неизвестный логин" }, "login.failure");
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  }
  limiter.clear(key);
  await audit({ id: user.id, login: user.login }, "login.success");
  const { token, expiresAt } = await createSession(user.id, user.roleId as RoleId);
  const res = NextResponse.json({ user: { login: user.login, displayName: user.displayName, role: user.roleId } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  const deviceToken = await signDeviceToken(normalized, trusted ? device.deviceId : crypto.randomUUID());
  res.cookies.set(DEVICE_COOKIE, deviceToken, { ...sessionCookieOptions(new Date(Date.now() + DEVICE_TTL_SECONDS * 1000)) });
  return res;
});
