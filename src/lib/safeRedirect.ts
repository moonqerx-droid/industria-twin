/**
 * Безопасный адрес возврата после входа: только относительный путь внутри приложения.
 * Отклоняются протокол-относительные адреса («//host»), обратные слэши («/\host» браузеры трактуют как «//host»),
 * управляющие символы и всё, что после разбора указывает на другой источник.
 */
const BASE = "http://app.invalid";

export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    const out = url.pathname + url.search + url.hash;
    // Проверяем и нормализованный результат: «/.//host» после разбора превращается в «//host».
    if (!out.startsWith("/") || out.startsWith("//") || out.includes("\\")) return fallback;
    return out;
  } catch {
    return fallback;
  }
}
