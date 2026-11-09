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
  enforce(loginLimiter, `${login.toLowerCase()}|${ip}`);
  const user = await verifyCredentials(login, password);
  if (!user) throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
  const { token, expiresAt } = await createSession(user.id, user.roleId as RoleId);
  const res = NextResponse.json({ user: { login: user.login, displayName: user.displayName, role: user.roleId } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
