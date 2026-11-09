import { jwtVerify, SignJWT } from "jose";

/**
 * Подписанный токен сессии (HS256). Модуль совместим с Edge Runtime (используется в middleware),
 * поэтому не обращается к базе данных: проверка существования сессии выполняется в session.ts.
 */
export const SESSION_COOKIE = "it_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type RoleId = "admin" | "engineer" | "viewer";

export interface SessionClaims {
  sid: string;
  sub: string;
  role: RoleId;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET не задан или короче 32 символов (см. .env.example)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("industria-twin")
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "industria-twin", algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    if (role !== "admin" && role !== "engineer" && role !== "viewer") return null;
    return { sid: payload.sid, sub: payload.sub, role };
  } catch {
    return null;
  }
}
