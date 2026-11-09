import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/token";

/**
 * Первичная проверка доступа к страницам: подпись и срок действия токена (Edge Runtime, без БД).
 * Окончательная проверка (сессия не отозвана, пользователь активен, роль) выполняется на сервере
 * в каждом API-маршруте и в серверных компонентах страниц.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  // API-маршруты проверяют сессию самостоятельно и отвечают JSON 401.
  if (pathname.startsWith("/api/")) return NextResponse.next();
  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!claims) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
