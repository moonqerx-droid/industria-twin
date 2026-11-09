import { audit } from "@/server/services/auditService";
import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, assertSameOrigin } from "@/server/auth/session";
import { SESSION_COOKIE, type RoleId } from "@/server/auth/token";
import { ApiError, handler, parseJson } from "@/server/http";
import { enforce, loginLimiter } from "@/server/rateLimit";
import { loginSchema } from "@/server/validation/schemas";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const { login, password } = await parseJson(req, loginSchema);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${login.toLowerCase()}|${ip}`;
  // Блокируется ключ, исчерпавший лимит неуспешных попыток; успешный вход счётчик не расходует.
  enforce(loginLimiter, key, { record: false });
  const user = await verifyCredentials(login, password);
  if (!user) {
    loginLimiter.check(key);
    // Пароль не записывается; логин — псевдоним, ПДн не содержит.
    await audit({ id: null, login: login.slice(0, 64) }, "login.failure", { details: `адрес ${ip}` });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  }
  loginLimiter.clear(key);
  await audit({ id: user.id, login: user.login }, "login.success");
  const { token, expiresAt } = await createSession(user.id, user.roleId as RoleId);
  const res = NextResponse.json({ user: { login: user.login, displayName: user.displayName, role: user.roleId } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
