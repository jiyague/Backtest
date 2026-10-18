import { HISTDATA_TZ, HISTDATA_UTC_OFFSET_SECONDS, type Candle } from '../types';

/** Convierte hora HistData (EST fija, UTC-5) a timestamp UTC en segundos. */
export function histDataToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000 + HISTDATA_UTC_OFFSET_SECONDS;
}

const LINE = /^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2});([^;]+);([^;]+);([^;]+);([^;]+)(?:;[^;]*)?$/;

/**
 * Parsea una línea `YYYYMMDD HHMMSS;open;high;low;close;volume`.
 * Devuelve la vela con el tiempo en UTC, o null si la línea no es válida.
 */
export function parseHistDataLine(line: string): Candle | null {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const o = Number(m[7]);
  const hi = Number(m[8]);
  const lo = Number(m[9]);
  const c = Number(m[10]);
  if ([o, hi, lo, c].some((v) => !Number.isFinite(v))) return null;
  return [histDataToUtc(y, mo, d, h, mi, s), o, hi, lo, c];
}

/** Parsea un CSV completo (ordenado, sin duplicados). Los huecos se conservan como huecos. */
export function parseHistDataCsv(text: string): { candles: Candle[]; invalid: number } {
  const candles: Candle[] = [];
  let invalid = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = parseHistDataLine(raw);
    if (c) candles.push(c);
    else invalid++;
  }
  candles.sort((a, b) => a[0] - b[0]);
  const unique: Candle[] = [];
  for (const c of candles) {
    if (unique.length && unique[unique.length - 1][0] === c[0]) unique[unique.length - 1] = c;
    else unique.push(c);
  }
  return { candles: unique, invalid };
}

/**
 * `DAT_NT_EURUSD_M1_202601.csv` -> { pair: 'EURUSD', year: 2026, month: 1 } (mensual)
 * `DAT_NT_EURUSD_M1_2025.csv`   -> { pair: 'EURUSD', year: 2025, month: null } (anual)
 */
export function parseHistDataFilename(name: string): { pair: string; year: number; month: number | null } | null {
  const m = /^DAT_NT_([A-Za-z0-9]+)_M1_(\d{4})(\d{2})?\.csv$/i.exec(name);
  if (!m) return null;
  const month = m[3] === undefined ? null : Number(m[3]);
  if (month !== null && (month < 1 || month > 12)) return null;
  return { pair: m[1].toUpperCase(), year: Number(m[2]), month };
}

/**
 * Reparte velas (tiempo UTC) por mes HistData (EST fija) y fusiona por timestamp.
 * `annual` se aplica primero y `monthly` prevalece en caso de duplicado. Cada lista de salida queda ordenada.
 */
export function mergeIntoMonths(annual: Candle[][], monthly: Candle[][]): Map<string, Candle[]> {
  const byTime = new Map<string, Map<number, Candle>>();
  for (const list of [...annual, ...monthly]) {
    for (const c of list) {
      const key = monthKeyOf(c[0]);
      let m = byTime.get(key);
      if (!m) byTime.set(key, (m = new Map()));
      m.set(c[0], c);
    }
  }
  const out = new Map<string, Candle[]>();
  for (const key of [...byTime.keys()].sort()) out.set(key, [...byTime.get(key)!.values()].sort((a, b) => a[0] - b[0]));
  return out;
}

/** JSON mensual compacto: filas [t, o, h, l, c] con t en hora EST fija como segundos "si fuese UTC". */
export interface MonthFile {
  pair: string;
  month: string;
  tz: typeof HISTDATA_TZ;
  fields: ['t', 'o', 'h', 'l', 'c'];
  note: string;
  data: Candle[];
}

export const MONTH_NOTE = 't = segundos epoch de la hora de HistData (EST fija, UTC-5) leída como si fuese UTC; UTC real = t + 18000';

/** Candle UTC -> fila del JSON mensual (hora EST fija sin convertir). */
export function toMonthRow(c: Candle): Candle {
  return [c[0] - HISTDATA_UTC_OFFSET_SECONDS, c[1], c[2], c[3], c[4]];
}

/** Fila del JSON mensual -> vela con tiempo UTC. */
export function fromMonthRow(r: readonly number[]): Candle {
  return [r[0] + HISTDATA_UTC_OFFSET_SECONDS, r[1], r[2], r[3], r[4]];
}

/** Clave de mes HistData (YYYY-MM, en EST fija) de un instante UTC. */
export function monthKeyOf(utc: number): string {
  const d = new Date((utc - HISTDATA_UTC_OFFSET_SECONDS) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
