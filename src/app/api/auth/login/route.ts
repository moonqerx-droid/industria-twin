import { audit } from "@/server/services/auditService";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, assertSameOrigin } from "@/server/auth/session";
import { DEVICE_COOKIE, DEVICE_TTL_SECONDS, SESSION_COOKIE, signDeviceToken, verifyDeviceToken, type RoleId } from "@/server/auth/token";
import { ApiError, handler, parseJson } from "@/server/http";
import { deviceLoginLimiter, enforce, loginLimiter } from "@/server/rateLimit";
import { prisma } from "@/server/db";
import { loginSchema } from "@/server/validation/schemas";

/** Отпечаток текущего пароля для cookie устройства: HMAC от bcrypt-хеша (сам хеш не раскрывается). */
function passwordVersion(passwordHash: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(passwordHash).digest("base64url").slice(0, 22);
}

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
  // Устройство доверенное, если на нём был успешный вход в эту учётную запись с текущим паролем,
  // а учётная запись активна: смена пароля, блокировка и удаление отзывают все устройства.
  const device = await verifyDeviceToken(readCookie(req, DEVICE_COOKIE));
  const account = device ? await prisma.user.findUnique({ where: { login }, select: { id: true, passwordHash: true, isActive: true } }) : null;
  const trusted =
    device !== null &&
    account !== null &&
    account.isActive &&
    device.userId === account.id &&
    device.passwordVersion === passwordVersion(account.passwordHash);
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
  const deviceToken = await signDeviceToken(user.id, passwordVersion(user.passwordHash), trusted ? device!.deviceId : crypto.randomUUID());
  res.cookies.set(DEVICE_COOKIE, deviceToken, { ...sessionCookieOptions(new Date(Date.now() + DEVICE_TTL_SECONDS * 1000)) });
  return res;
});
