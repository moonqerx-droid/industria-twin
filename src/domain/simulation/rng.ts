/**
 * Воспроизводимый генератор псевдослучайных чисел.
 *
 * Используется алгоритм sfc32 (Small Fast Counter, 128-битное состояние), инициализируемый
 * через splitmix32 из 32-битного seed. Один и тот же seed всегда даёт одну и ту же
 * последовательность на любой платформе (операции только над 32-битными целыми).
 */
export interface Rng {
  /** Равномерное число в полуинтервале [0, 1). */
  next(): number;
  readonly seed: number;
}

/** Шаг splitmix32 — используется для инициализации и вывода производных seed. */
export function splitmix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Производный seed для репликации с номером `index` (детерминированно).
 * Ограничен 31 битом, чтобы храниться в столбце INT базы данных.
 */
export function deriveSeed(baseSeed: number, index: number): number {
  return splitmix32((baseSeed >>> 0) ^ splitmix32(index + 1)) & 0x7fffffff;
}

export function createRng(seed: number): Rng {
  const normalized = seed >>> 0;
  let a = splitmix32(normalized);
  let b = splitmix32(a);
  let c = splitmix32(b);
  let d = splitmix32(c);
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Прогрев: отбрасываем первые значения, чтобы ослабить корреляцию близких seed.
  for (let i = 0; i < 12; i += 1) next();
  return { next, seed: normalized };
}
