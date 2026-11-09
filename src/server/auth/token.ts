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

/**
 * Cookie доверенного устройства (OWASP «device cookies»): выдаётся после успешного входа и привязана к id пользователя
 * и отпечатку текущего пароля (`pv`) — смена пароля, блокировка или удаление учётной записи отзывают все устройства.
 * Попытки входа с такой cookie учитываются отдельно по устройству, поэтому посторонний, исчерпавший лимит
 * неудачных попыток по логину, не блокирует владельцу вход с уже знакомого устройства.
 */
export const DEVICE_COOKIE = "it_device";
export const DEVICE_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEVICE_AUDIENCE = "industria-twin/device";

export async function signDeviceToken(userId: string, passwordVersion: string, deviceId: string): Promise<string> {
  return new SignJWT({ typ: "device", pv: passwordVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(deviceId)
    .setIssuedAt()
    .setExpirationTime(`${DEVICE_TTL_SECONDS}s`)
    .setIssuer("industria-twin")
    .setAudience(DEVICE_AUDIENCE)
    .sign(secretKey());
}

export async function verifyDeviceToken(
  token: string | undefined | null,
): Promise<{ userId: string; passwordVersion: string; deviceId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "industria-twin", audience: DEVICE_AUDIENCE, algorithms: ["HS256"] });
    if (payload.typ !== "device" || typeof payload.sub !== "string" || typeof payload.jti !== "string" || typeof payload.pv !== "string") return null;
    return { userId: payload.sub, passwordVersion: payload.pv, deviceId: payload.jti };
  } catch {
    return null;
  }
}
