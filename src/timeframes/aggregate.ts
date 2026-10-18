import type { Candle, Timeframe } from '../types';
import { civilFromDays, daysFromCivil, nyLocalToUtc, nyOffsetSeconds } from './ny';

const FIXED_STEP: Partial<Record<Timeframe, number>> = {
  M1: 60,
  M3: 180,
  M5: 300,
  M15: 900,
  H1: 3600,
};

/** Segundos que hay que sumar a la hora local de NY para que las 17:00 pasen a ser medianoche. */
const SESSION_SHIFT = 7 * 3600;

/**
 * Inicio (UTC, segundos) de la vela de `tf` que contiene el instante `t`.
 * Las velas H4/D/W/M/12M se anclan a las 17:00 America/New_York (con EST/EDT reales).
 */
export function bucketStart(tf: Timeframe, t: number): number {
  const step = FIXED_STEP[tf];
  if (step) return Math.floor(t / step) * step;

  const local = t + nyOffsetSeconds(t);
  const shifted = local + SESSION_SHIFT;
  const day = Math.floor(shifted / 86400); // "día de sesión": 17:00 NY -> 17:00 NY
  let startLocal: number;
  switch (tf) {
    case 'H4':
      startLocal = Math.floor(shifted / 14400) * 14400 - SESSION_SHIFT;
      break;
    case 'D':
      startLocal = day * 86400 - SESSION_SHIFT;
      break;
    case 'W': {
      // 1970-01-01 fue jueves; el día de sesión del lunes empieza el domingo 17:00 NY.
      const sinceMonday = (((day + 3) % 7) + 7) % 7;
      startLocal = (day - sinceMonday) * 86400 - SESSION_SHIFT;
      break;
    }
    case 'M': {
      const { y, m } = civilFromDays(day);
      startLocal = daysFromCivil(y, m, 1) * 86400 - SESSION_SHIFT;
      break;
    }
    case '12M': {
      const { y } = civilFromDays(day);
      startLocal = daysFromCivil(y, 1, 1) * 86400 - SESSION_SHIFT;
      break;
    }
    default:
      throw new Error(`Timeframe desconocido: ${tf}`);
  }
  return nyLocalToUtc(startLocal);
}

/** Duración mínima (segundos) de una vela de cada timeframe, para localizar el siguiente periodo. */
const MIN_SPAN: Record<Timeframe, number> = {
  M1: 60, M3: 180, M5: 300, M15: 900, H1: 3600,
  H4: 3 * 3600, D: 23 * 3600, W: 6 * 86400, M: 27 * 86400, '12M': 360 * 86400,
};

/** Inicio (UTC) del periodo siguiente a la vela de `tf` que empieza en `start`. */
export function nextBucketStart(tf: Timeframe, start: number): number {
  let t = start + MIN_SPAN[tf];
  while (bucketStart(tf, t) <= start) t += 3600;
  return bucketStart(tf, t);
}

/**
 * Instante de cierre de la vela de `tf` que empieza en `start`, expresado como el tiempo
 * de su última vela M1 (para M1 es su propio minuto; para H4/D... el último minuto del periodo).
 */
export function barCloseTime(tf: Timeframe, start: number): number {
  return nextBucketStart(tf, start) - 60;
}

/** Incorpora la vela `c` (de menor timeframe) a la vela en formación `last`. */
export function mergeCandle(last: Candle, c: Candle): Candle {
  return [last[0], last[1], Math.max(last[2], c[2]), Math.min(last[3], c[3]), c[4]];
}

/**
 * Agrega velas ordenadas por tiempo a `tf`. No rellena huecos: solo se generan
 * velas para los periodos que contienen datos.
 */
export function aggregate(candles: readonly Candle[], tf: Timeframe): Candle[] {
  if (tf === 'M1') return candles.map((c) => [...c] as Candle);
  const out: Candle[] = [];
  for (const c of candles) {
    const b = bucketStart(tf, c[0]);
    const last = out[out.length - 1];
    if (last && last[0] === b) out[out.length - 1] = mergeCandle(last, c);
    else out.push([b, c[1], c[2], c[3], c[4]]);
  }
  return out;
}

/** Aplica una vela M1 nueva al final de una serie ya agregada a `tf` (para el replay). */
export function applyM1(series: Candle[], m1: Candle, tf: Timeframe): { candle: Candle; isNew: boolean } {
  const b = bucketStart(tf, m1[0]);
  const last = series[series.length - 1];
  if (last && last[0] === b) {
    const candle = mergeCandle(last, m1);
    series[series.length - 1] = candle;
    return { candle, isNew: false };
  }
  const candle: Candle = [b, m1[1], m1[2], m1[3], m1[4]];
  series.push(candle);
  return { candle, isNew: true };
}
