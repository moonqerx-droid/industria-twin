import { ApiError } from "./http";

/**
 * Ограничитель частоты по скользящему окну (в памяти процесса).
 * Достаточен для однопроцессного демонстрационного развёртывания; для кластера
 * требуется внешнее хранилище (ограничение отражено в FINAL_REPORT.md).
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      const retry = Math.ceil((list[0]! + this.windowMs - now) / 1000);
      return { allowed: false, retryAfterSec: Math.max(1, retry) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Сброс счётчика ключа (например, после успешного входа). */
  clear(key: string): void {
    this.hits.delete(key);
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Не более 12 запусков моделирования в минуту на пользователя. */
export const simulationLimiter = new SlidingWindowLimiter(12, 60_000);
/**
 * Не более 10 попыток входа за 5 минут на «логин + достоверный адрес» (только при TRUST_PROXY=1);
 * успешный вход сбрасывает счётчик. Защита по логину без адреса — src/server/auth/loginThrottle.ts.
 */
export const loginLimiter = new SlidingWindowLimiter(10, 5 * 60_000);
/**
 * Адрес клиента для ограничителя. Заголовку X-Forwarded-For доверяем только при TRUST_PROXY=1
 * (приложение за собственным обратным прокси), и берём последний адрес — добавленный нашим прокси;
 * иначе заголовок подделывается клиентом и не используется.
 */
export function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
    return req.headers.get("x-real-ip")?.trim() || "proxy";
  }
  return "direct";
}

export function enforce(limiter: SlidingWindowLimiter, key: string): void {
  const r = limiter.check(key);
  if (!r.allowed) {
    throw new ApiError(429, "RATE_LIMITED", `Слишком много запросов. Повторите через ${r.retryAfterSec} с`, {
      retryAfterSec: r.retryAfterSec,
    });
  }
}

/** Не более 5 попыток смены пароля за 15 минут на пользователя (защита от подбора текущего пароля). */
export const passwordChangeLimiter = new SlidingWindowLimiter(5, 15 * 60_000);

/** Не более 20 запросов советника и кривой мощности в минуту на пользователя (результаты кэшируются). */
export const adviceLimiter = new SlidingWindowLimiter(20, 60_000);
