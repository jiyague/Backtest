import { describe, expect, it } from 'vitest';
import { aggregate, bucketStart } from '../src/timeframes/aggregate';
import { nyLocalToUtc, nyOffsetSeconds } from '../src/timeframes/ny';
import type { Candle } from '../src/types';

const ny = (y: number, m: number, d: number, h = 0, mi = 0) => nyLocalToUtc(Date.UTC(y, m - 1, d, h, mi) / 1000);
const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

describe('zona America/New_York', () => {
  it('EST en invierno y EDT en verano', () => {
    expect(nyOffsetSeconds(ny(2026, 1, 15, 12))).toBe(-5 * 3600);
    expect(nyOffsetSeconds(ny(2026, 7, 15, 12))).toBe(-4 * 3600);
  });
  it('17:00 NY en UTC', () => {
    expect(iso(ny(2026, 1, 5, 17))).toBe('2026-01-05T22:00Z');
    expect(iso(ny(2026, 7, 6, 17))).toBe('2026-07-06T21:00Z');
  });
});

describe('agrupación con cierre de NY a las 17:00', () => {
  it('D: de 17:00 a 17:00', () => {
    expect(bucketStart('D', ny(2026, 1, 6, 16, 59))).toBe(ny(2026, 1, 5, 17));
    expect(bucketStart('D', ny(2026, 1, 6, 17, 0))).toBe(ny(2026, 1, 6, 17));
    expect(bucketStart('D', ny(2026, 1, 6, 3, 0))).toBe(ny(2026, 1, 5, 17));
  });

  it('H4: ancladas a 17, 21, 01, 05, 09, 13', () => {
    const cases: [number, number, number, number, number][] = [
      // [día, hora, min, día ancla, hora ancla]
      [5, 17, 0, 5, 17], [5, 20, 59, 5, 17], [5, 21, 0, 5, 21], [6, 0, 30, 5, 21], [6, 1, 0, 6, 1],
      [6, 4, 59, 6, 1], [6, 5, 0, 6, 5], [6, 9, 15, 6, 9], [6, 13, 0, 6, 13], [6, 16, 59, 6, 13],
    ];
    for (const [d, h, mi, ad, ah] of cases) {
      expect(iso(bucketStart('H4', ny(2026, 1, d, h, mi)))).toBe(iso(ny(2026, 1, ad, ah)));
    }
  });

  it('W: abre el domingo a las 17:00 NY', () => {
    const open = ny(2026, 1, 4, 17); // domingo
    expect(bucketStart('W', open)).toBe(open);
    expect(bucketStart('W', ny(2026, 1, 9, 16, 59))).toBe(open); // viernes
    expect(bucketStart('W', ny(2026, 1, 11, 16, 59))).toBe(open); // domingo antes de abrir
    expect(bucketStart('W', ny(2026, 1, 11, 17))).toBe(ny(2026, 1, 11, 17));
  });

  it('M: abre con la primera sesión del mes', () => {
    // 1 ene 2026 es jueves: la sesión empieza el 31 dic a las 17:00 NY
    expect(bucketStart('M', ny(2026, 1, 15, 10))).toBe(ny(2025, 12, 31, 17));
    expect(bucketStart('M', ny(2026, 1, 1, 12))).toBe(ny(2025, 12, 31, 17));
    // 1 feb 2026 es domingo: la sesión del domingo 17:00 pertenece a febrero
    expect(bucketStart('M', ny(2026, 2, 1, 18))).toBe(ny(2026, 1, 31, 17));
  });

  it('12M: por año', () => {
    expect(bucketStart('12M', ny(2026, 6, 1))).toBe(ny(2025, 12, 31, 17));
  });

  it('cambio EST/EDT: D, H4 y W respetan la hora real de NY', () => {
    // El 8 de marzo de 2026 (domingo) empieza el horario de verano a las 02:00 NY.
    const sunOpen = ny(2026, 3, 8, 17); // 21:00 UTC (EDT)
    expect(iso(sunOpen)).toBe('2026-03-08T21:00Z');
    expect(bucketStart('D', ny(2026, 3, 9, 16, 59))).toBe(sunOpen);
    // la sesión del viernes 6 al domingo 8 sigue en EST
    expect(iso(bucketStart('D', ny(2026, 3, 6, 17)))).toBe('2026-03-06T22:00Z');
    // semana: abre el domingo 1 mar a las 17:00 EST (22:00 UTC); la del 8 mar abre 21:00 UTC
    expect(iso(bucketStart('W', ny(2026, 3, 6, 12)))).toBe('2026-03-01T22:00Z');
    expect(iso(bucketStart('W', ny(2026, 3, 10, 12)))).toBe('2026-03-08T21:00Z');
    // H4 del domingo 8: 01:00 NY es EST (06:00 UTC) y 05:00 NY es EDT (09:00 UTC)
    expect(iso(bucketStart('H4', ny(2026, 3, 8, 1, 30)))).toBe('2026-03-08T06:00Z');
    expect(iso(bucketStart('H4', ny(2026, 3, 8, 6, 0)))).toBe('2026-03-08T09:00Z');
    // fin del horario de verano: 1 nov 2026 (domingo)
    expect(iso(bucketStart('D', ny(2026, 11, 1, 10)))).toBe('2026-10-31T21:00Z'); // abre en EDT
    expect(iso(bucketStart('D', ny(2026, 11, 2, 16, 59)))).toBe('2026-11-01T22:00Z'); // abre en EST
  });
});

describe('aggregate', () => {
  const m1 = (t: number, p: number): Candle => [t, p, p + 2, p - 1, p + 1];

  it('agrega OHLC y no rellena huecos', () => {
    const t0 = ny(2026, 1, 6, 10, 0);
    const c = aggregate([m1(t0, 10), m1(t0 + 60, 11), m1(t0 + 15 * 60, 20)], 'M15');
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual([t0, 10, 13, 9, 12]);
    expect(c[1][0]).toBe(t0 + 900);
  });

  it('D mantiene los huecos de fin de semana', () => {
    const fri = ny(2026, 1, 9, 12);
    const sun = ny(2026, 1, 11, 17, 5);
    const d = aggregate([m1(fri, 1), m1(sun, 2)], 'D');
    expect(d.map((c) => c[0])).toEqual([ny(2026, 1, 8, 17), ny(2026, 1, 11, 17)]);
  });
});
