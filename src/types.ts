/** Vela compacta: [tiempo UTC en segundos, open, high, low, close]. */
export type Candle = [number, number, number, number, number];

export const TIMEFRAMES = ['M1', 'M3', 'M5', 'M15', 'H1', 'H4', 'D', 'W', 'M', '12M'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Desfase fijo de HistData: EST = UTC-5 (sin horario de verano). */
export const HISTDATA_UTC_OFFSET_SECONDS = 5 * 3600;
export const HISTDATA_TZ = 'EST-fixed(UTC-5)';

export interface PairIndex {
  pair: string;
  tz: string;
  /** Meses disponibles (YYYY-MM) en M1, ordenados. */
  months: string[];
  /** Años con ficheros precalculados H1 y D. */
  years: number[];
}
