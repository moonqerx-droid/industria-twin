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

  /** Проверка без регистрации попытки (для счёта только неуспешных попыток). */
  peek(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (list.length >= this.limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((list[0]! + this.windowMs - now) / 1000)) };
    }
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
/** Не более 10 неуспешных попыток входа за 5 минут на логин+адрес; успешный вход сбрасывает счётчик. */
export const loginLimiter = new SlidingWindowLimiter(10, 5 * 60_000);

export function enforce(limiter: SlidingWindowLimiter, key: string, opts: { record?: boolean } = {}): void {
  const r = opts.record === false ? limiter.peek(key) : limiter.check(key);
  if (!r.allowed) {
    throw new ApiError(429, "RATE_LIMITED", `Слишком много запросов. Повторите через ${r.retryAfterSec} с`, {
      retryAfterSec: r.retryAfterSec,
    });
  }
}

/** Не более 40 запросов советника в минуту на пользователя (результаты кэшируются, расчёт — до ~0,5 с). */
export const adviceLimiter = new SlidingWindowLimiter(40, 60_000);
