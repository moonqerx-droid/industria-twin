import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { ApiError, forbidden, unauthorized } from "@/server/http";
import { can, type Permission } from "./permissions";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
  type RoleId,
} from "./token";

export interface CurrentUser {
  id: string;
  login: string;
  displayName: string;
  role: RoleId;
  sessionId: string;
}

const BCRYPT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// Хеш-пустышка для выравнивания времени ответа при несуществующем логине.
let dummyHash: string | null = null;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync("industria-twin-dummy", BCRYPT_ROUNDS);
  return dummyHash;
}

export async function verifyCredentials(login: string, password: string) {
  const user = await prisma.user.findUnique({ where: { login } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !ok || !user.isActive) return null;
  return user;
}

export async function createSession(userId: string, role: RoleId): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  // Попутно удаляем просроченные сессии (минимизация хранимых данных).
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const token = await signSessionToken({ sid: session.id, sub: userId, role });
  return { token, expiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires: expiresAt,
  };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function resolveToken(token: string | null): Promise<CurrentUser | null> {
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const session = await prisma.session.findUnique({ where: { id: claims.sid }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive || session.userId !== claims.sub) return null;
  return {
    id: session.user.id,
    login: session.user.login,
    displayName: session.user.displayName,
    role: session.user.roleId as RoleId,
    sessionId: session.id,
  };
}

/** Пользователь из cookie HTTP-запроса (для API-маршрутов). */
export function getUserFromRequest(req: Request): Promise<CurrentUser | null> {
  return resolveToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
}

/** Пользователь из cookie текущего запроса (для серверных компонентов). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  return resolveToken(store.get(SESSION_COOKIE)?.value ?? null);
}

/**
 * Проверка доступа для API: сессия + право. Для изменяющих методов дополнительно
 * проверяется заголовок Origin (защита от CSRF поверх SameSite=Lax).
 */
export async function requireUser(req: Request, permission: Permission): Promise<CurrentUser> {
  const user = await getUserFromRequest(req);
  if (!user) throw unauthorized();
  if (!can(user.role, permission)) throw forbidden();
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  return user;
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // запросы без Origin (curl, тесты) не несут cookie жертвы из браузера
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return;
  } catch {
    /* некорректный Origin */
  }
  throw new ApiError(403, "CSRF_REJECTED", "Запрос с чужого источника отклонён");
}
