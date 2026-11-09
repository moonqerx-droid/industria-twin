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
 * Попытки входа без cookie доверенного устройства: не более 10 за 15 минут на логин (с любых адресов).
 * Попытка регистрируется до проверки пароля (параллельные запросы не обходят лимит), успешный вход сбрасывает счётчик.
 */
export const loginLimiter = new SlidingWindowLimiter(10, 15 * 60_000);
/** Попытки входа с cookie доверенного устройства: не более 10 за 15 минут на пару «логин + устройство». */
export const deviceLoginLimiter = new SlidingWindowLimiter(10, 15 * 60_000);

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
