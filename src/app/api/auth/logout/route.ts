import { audit } from "@/server/services/auditService";
import { NextResponse } from "next/server";
import { assertSameOrigin, destroySession, getUserFromRequest } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/token";
import { handler } from "@/server/http";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const user = await getUserFromRequest(req);
  if (user) {
    await destroySession(user.sessionId);
    await audit(user, "logout");
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});
