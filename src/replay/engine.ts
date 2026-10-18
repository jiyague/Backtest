import type { Candle } from '../types';

/** Índice del primer elemento con tiempo > t. */
function upperBound(candles: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid][0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Motor de replay sobre velas M1 (UTC, ordenadas). Solo expone las velas con
 * tiempo <= instante actual; el futuro nunca sale de `revealed()`.
 */
export class ReplayEngine {
  private candles: Candle[] = [];
  private cursor = -Infinity;

  /** Sustituye los datos disponibles (p. ej. al cargar otro mes) conservando el instante. */
  setCandles(candles: Candle[]): void {
    this.candles = candles;
  }

  /** Instante actual (tiempo UTC de la última vela revelada). */
  get time(): number {
    return this.cursor;
  }

  /** Coloca el replay en la última vela con tiempo <= t (o en la primera si t es anterior). */
  seek(t: number): void {
    if (!this.candles.length) return;
    const i = Math.max(0, upperBound(this.candles, t) - 1);
    this.cursor = this.candles[i][0];
  }

  private get count(): number {
    return upperBound(this.candles, this.cursor);
  }

  /** Velas reveladas hasta el instante actual (inclusive). */
  revealed(): Candle[] {
    return this.candles.slice(0, this.count);
  }

  /** Velas reveladas con tiempo >= from. */
  revealedSince(from: number): Candle[] {
    return this.candles.slice(upperBound(this.candles, from - 1), this.count);
  }

  /** Velas que quedan por revelar en los datos cargados. */
  remaining(): number {
    return this.candles.length - this.count;
  }

  stepForward(): Candle | null {
    const i = this.count;
    if (i >= this.candles.length) return null;
    this.cursor = this.candles[i][0];
    return this.candles[i];
  }

  /** Revela hasta `n` velas de golpe (sin pasar de los datos cargados) y las devuelve. */
  stepForwardMany(n: number): Candle[] {
    const i = this.count;
    const end = Math.min(this.candles.length, i + Math.max(0, Math.floor(n)));
    if (end <= i) return [];
    this.cursor = this.candles[end - 1][0];
    return this.candles.slice(i, end);
  }

  stepBack(): Candle | null {
    const i = this.count;
    if (i <= 1) return null;
    const removed = this.candles[i - 1];
    this.cursor = this.candles[i - 2][0];
    return removed;
  }
}
