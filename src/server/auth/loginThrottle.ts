import { ApiError } from "@/server/http";

/**
 * Защита входа от перебора без блокировки учётной записи посторонним.
 *
 * - Одновременно выполняется не больше одной попытки входа на логин: параллельный перебор невозможен (429).
 * - После FREE_FAILURES неуспешных попыток каждая следующая попытка для этого логина задерживается
 *   (экспоненциально, до MAX_DELAY_MS). Перебор замедляется до единиц попыток в минуту,
 *   а владелец с верным паролем входит с задержкой в несколько секунд, но не блокируется.
 * - Счётчик сбрасывается успешным входом или через DECAY_MS без неудач.
 * Состояние хранится в памяти процесса (ограничение отражено в FINAL_REPORT.md).
 */
export const THROTTLE = { FREE_FAILURES: 5, BASE_DELAY_MS: 250, MAX_DELAY_MS: 5_000, DECAY_MS: 15 * 60_000 };

const failures = new Map<string, { count: number; last: number }>();
const inFlight = new Set<string>();
let baseDelayMs = THROTTLE.BASE_DELAY_MS;

/** Задержка перед проверкой пароля для логина, мс. */
export function throttleDelayMs(login: string, now = Date.now()): number {
  const f = failures.get(login);
  if (!f || now - f.last > THROTTLE.DECAY_MS) return 0;
  const over = f.count - THROTTLE.FREE_FAILURES;
  if (over < 0) return 0;
  return Math.min(THROTTLE.MAX_DELAY_MS, baseDelayMs * 2 ** over);
}

/** Выполняет попытку входа с ограничением параллелизма и задержкой; результат fn — успех проверки. */
export async function throttledLogin<T>(login: string, fn: () => Promise<T | null>): Promise<T | null> {
  if (inFlight.has(login)) {
    throw new ApiError(429, "LOGIN_IN_PROGRESS", "Предыдущая попытка входа ещё проверяется. Повторите через несколько секунд", { retryAfterSec: 2 });
  }
  inFlight.add(login);
  try {
    const delay = throttleDelayMs(login);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const result = await fn();
    if (result) failures.delete(login);
    else {
      const now = Date.now();
      const f = failures.get(login);
      const count = f && now - f.last <= THROTTLE.DECAY_MS ? f.count + 1 : 1;
      failures.set(login, { count, last: now });
    }
    return result;
  } finally {
    inFlight.delete(login);
  }
}

/** Для тестов: сброс состояния и масштаб задержек. */
export function resetLoginThrottle(opts: { baseDelayMs?: number } = {}): void {
  failures.clear();
  inFlight.clear();
  baseDelayMs = opts.baseDelayMs ?? THROTTLE.BASE_DELAY_MS;
}
