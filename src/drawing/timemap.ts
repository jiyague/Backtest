import type { Candle } from '../types';

/**
 * Conversión entre tiempo UTC (continuo) y posición lógica en la serie actual.
 * Entre velas se interpola linealmente y fuera de la serie se extrapola con el paso típico, de modo que un
 * timestamp conserva su posición al cambiar de timeframe, aunque no coincida con la apertura de ninguna vela.
 */
function step(c: readonly Candle[]): number {
  let min = Infinity;
  for (let i = Math.max(1, c.length - 200); i < c.length; i++) {
    const d = c[i][0] - c[i - 1][0];
    if (d > 0 && d < min) min = d;
  }
  return Number.isFinite(min) ? min : 60;
}

/** Último índice con tiempo <= t (-1 si t es anterior a la primera vela). */
function lastIndexLE(c: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = c.length - 1;
  let r = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid][0] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return r;
}

export function timeToLogical(c: readonly Candle[], t: number): number | null {
  if (!c.length) return null;
  const i = lastIndexLE(c, t);
  if (i < 0) return (t - c[0][0]) / step(c);
  if (i === c.length - 1) return i + (t - c[i][0]) / step(c);
  return i + (t - c[i][0]) / (c[i + 1][0] - c[i][0]);
}

export function logicalToTime(c: readonly Candle[], l: number): number | null {
  if (!c.length) return null;
  const last = c.length - 1;
  if (l <= 0) return c[0][0] + l * step(c);
  if (l >= last) return c[last][0] + (l - last) * step(c);
  const i = Math.floor(l);
  return c[i][0] + (l - i) * (c[i + 1][0] - c[i][0]);
}
