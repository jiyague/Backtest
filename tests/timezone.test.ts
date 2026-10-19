import { describe, expect, it } from 'vitest';
import { barCloseTime, bucketStart, nextBucketStart } from '../src/timeframes/aggregate';
import { formatCrosshair, formatFull, formatTime } from '../src/timeframes/format';
import { histDataToUtc } from '../src/data/parse';
import { DEFAULT_TIME_ZONE, formatOffset, getTimeZone, setTimeZone, zoneLabel } from '../src/timeframes/timezone';
import { tzOffsetSeconds } from '../src/timeframes/ny';

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

describe('cadena de horas: HistData EST -> UTC -> etiqueta NY -> bucket', () => {
  it('verano (EDT): H4 de las 13:00 NY = 17:00 UTC', () => {
    // 12:00 EST fija de HistData = 17:00 UTC = 13:00 EDT
    const t = histDataToUtc(2026, 7, 15, 12, 0, 0);
    expect(iso(t)).toBe('2026-07-15T17:00Z');
    expect(getTimeZone()).toBe(DEFAULT_TIME_ZONE);
    expect(formatTime(t)).toBe('13:00');
    expect(iso(bucketStart('H4', t))).toBe('2026-07-15T17:00Z');
    expect(formatTime(bucketStart('H4', t))).toBe('13:00');
    // las H4 de verano abren a 21,01,05,09,13,17 UTC
    expect(iso(bucketStart('H4', utc(2026, 7, 15, 21, 30)))).toBe('2026-07-15T21:00Z');
    expect(formatTime(utc(2026, 7, 15, 21))).toBe('17:00');
    // D abre a las 17:00 NY = 21:00 UTC
    expect(iso(bucketStart('D', t))).toBe('2026-07-14T21:00Z');
  });

  it('invierno (EST): H4 de las 13:00 NY = 18:00 UTC', () => {
    const t = histDataToUtc(2026, 1, 15, 13, 0, 0);
    expect(iso(t)).toBe('2026-01-15T18:00Z');
    expect(formatTime(t)).toBe('13:00');
    expect(iso(bucketStart('H4', t))).toBe('2026-01-15T18:00Z');
    expect(formatTime(bucketStart('H4', utc(2026, 1, 15, 22, 0)))).toBe('17:00');
    expect(formatTime(bucketStart('H4', utc(2026, 1, 16, 2, 30)))).toBe('21:00');
    expect(iso(bucketStart('D', t))).toBe('2026-01-14T22:00Z');
  });

  it('cambio horario: H4 y D siguen abriendo a las 17:00 NY', () => {
    // domingo 8-mar-2026 (inicio de EDT) y domingo 1-nov-2026 (fin de EDT)
    expect(formatTime(bucketStart('D', utc(2026, 3, 9, 15)))).toBe('17:00');
    expect(iso(bucketStart('D', utc(2026, 3, 9, 15)))).toBe('2026-03-08T21:00Z');
    expect(formatTime(bucketStart('D', utc(2026, 11, 2, 15)))).toBe('17:00');
    expect(iso(bucketStart('D', utc(2026, 11, 2, 15)))).toBe('2026-11-01T22:00Z');
    expect(formatTime(bucketStart('H4', utc(2026, 3, 9, 14)))).toBe('09:00');
    expect(formatTime(bucketStart('H4', utc(2026, 11, 2, 14)))).toBe('09:00');
  });
});

describe('zona horaria seleccionable', () => {
  it('cambia las etiquetas y se restaura', () => {
    const t = utc(2026, 7, 15, 17);
    try {
      setTimeZone('UTC');
      expect(formatTime(t)).toBe('17:00');
      expect(formatFull(t)).toContain('17:00');
      setTimeZone('Europe/Madrid');
      expect(formatTime(t)).toBe('19:00');
    } finally {
      setTimeZone(DEFAULT_TIME_ZONE);
    }
    expect(formatTime(t)).toBe('13:00');
  });

  it('etiqueta con el desfase vigente', () => {
    expect(zoneLabel(utc(2026, 7, 15, 17))).toBe('NY (EDT, UTC-4)');
    expect(zoneLabel(utc(2026, 1, 15, 17))).toBe('NY (EST, UTC-5)');
    expect(zoneLabel(utc(2026, 7, 15), 'UTC')).toBe('UTC');
    expect(zoneLabel(utc(2026, 7, 15), 'Europe/Madrid')).toBe('Madrid (UTC+2)');
    expect(formatOffset(tzOffsetSeconds('America/New_York', utc(2026, 7, 1)))).toBe('UTC-4');
  });
});

describe('cierre de vela (selector de barra)', () => {
  it('M1: el propio minuto; M5/H1: último minuto del periodo', () => {
    const t = utc(2026, 1, 15, 10, 7);
    expect(barCloseTime('M1', t)).toBe(t);
    expect(iso(barCloseTime('M5', utc(2026, 1, 15, 10, 5)))).toBe('2026-01-15T10:09Z');
    expect(iso(barCloseTime('H1', utc(2026, 1, 15, 10, 0)))).toBe('2026-01-15T10:59Z');
  });

  it('H4 y D: final del periodo, también en días de cambio horario', () => {
    expect(iso(barCloseTime('H4', utc(2026, 7, 15, 17)))).toBe('2026-07-15T20:59Z');
    expect(iso(barCloseTime('D', utc(2026, 1, 14, 22)))).toBe('2026-01-15T21:59Z');
    // día de 23 h (8-mar-2026) y de 25 h (1-nov-2026)
    expect(iso(barCloseTime('D', utc(2026, 3, 8, 21)))).toBe('2026-03-09T20:59Z');
    expect(iso(barCloseTime('D', utc(2026, 10, 31, 21)))).toBe('2026-11-01T21:59Z');
    expect(iso(nextBucketStart('W', utc(2026, 1, 4, 22)))).toBe('2026-01-11T22:00Z');
    expect(iso(nextBucketStart('M', bucketStart('M', utc(2026, 1, 15))))).toBe(iso(bucketStart('M', utc(2026, 2, 15))));
  });
});

describe('formatCrosshair: día de la semana en español e inicio de vela', () => {
  it('formato y abreviaturas de días', () => {
    expect(formatCrosshair(utc(2026, 9, 28, 5, 0))).toBe("lun 28 sep '26 01:00");
    const days = [28, 29, 30, 1, 2, 3, 4].map((d, i) => formatCrosshair(utc(2026, i < 3 ? 9 : 10, d, 12)).slice(0, 3));
    expect(days).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
  });

  it('muestra el inicio de vela de cada timeframe', () => {
    const t = utc(2026, 9, 30, 15, 37);
    expect(formatCrosshair(bucketStart('H4', t))).toBe("mié 30 sep '26 09:00");
    expect(formatCrosshair(bucketStart('D', t))).toBe("mar 29 sep '26 17:00");
    expect(formatCrosshair(bucketStart('W', t)).slice(0, 3)).toBe('dom');
    expect(formatCrosshair(bucketStart('M', t))).toBe("lun 31 ago '26 17:00");
  });

  it('respeta la zona activa', () => {
    const t = utc(2026, 9, 28, 1, 0);
    try {
      setTimeZone('UTC');
      expect(formatCrosshair(t)).toBe("lun 28 sep '26 01:00");
      setTimeZone(DEFAULT_TIME_ZONE);
      expect(formatCrosshair(t)).toBe("dom 27 sep '26 21:00");
    } finally {
      setTimeZone(DEFAULT_TIME_ZONE);
    }
  });
});
