import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromMonthRow, histDataToUtc, monthKeyOf, parseHistDataCsv, parseHistDataFilename, parseHistDataLine, toMonthRow } from '../src/data/parse';

const csv = readFileSync(new URL('./fixtures/DAT_NT_EURUSD_M1_202601.csv', import.meta.url), 'utf8');

describe('parseo del CSV de HistData', () => {
  it('parsea una línea', () => {
    const c = parseHistDataLine('20260101 170400;1.173870;1.174140;1.173870;1.174140;0');
    expect(c).toEqual([Date.UTC(2026, 0, 1, 22, 4, 0) / 1000, 1.17387, 1.17414, 1.17387, 1.17414]);
  });

  it('rechaza líneas inválidas', () => {
    expect(parseHistDataLine('basura')).toBeNull();
    expect(parseHistDataLine('20260101 170400;a;b;c;d;0')).toBeNull();
  });

  it('parsea el fixture sin rellenar huecos', () => {
    const { candles, invalid } = parseHistDataCsv(csv);
    expect(invalid).toBe(0);
    expect(candles).toHaveLength(54);
    const sorted = candles.every((c, i) => i === 0 || c[0] > candles[i - 1][0]);
    expect(sorted).toBe(true);
    // hueco entre 17:07 y 17:20 del 5 de enero: no hay velas inventadas
    expect(candles.some((c) => c[0] === histDataToUtc(2026, 1, 5, 17, 10, 0))).toBe(false);
  });

  it('extrae par y mes del nombre', () => {
    expect(parseHistDataFilename('DAT_NT_EURUSD_M1_202601.csv')).toEqual({ pair: 'EURUSD', year: 2026, month: 1 });
    expect(parseHistDataFilename('DAT_NT_EURUSD_M1_202601.txt')).toBeNull();
  });
});

describe('EST fija -> UTC', () => {
  it('suma 5 horas', () => {
    expect(histDataToUtc(2026, 1, 1, 17, 4, 0)).toBe(Date.UTC(2026, 0, 1, 22, 4, 0) / 1000);
    // en verano la hora de HistData sigue siendo UTC-5 (no UTC-4)
    expect(histDataToUtc(2026, 7, 1, 12, 0, 0)).toBe(Date.UTC(2026, 6, 1, 17, 0, 0) / 1000);
  });

  it('el JSON mensual conserva la hora EST y es reversible', () => {
    const c = parseHistDataLine('20260101 170400;1;2;0.5;1.5;0')!;
    const row = toMonthRow(c);
    expect(row[0]).toBe(Date.UTC(2026, 0, 1, 17, 4, 0) / 1000);
    expect(fromMonthRow(row)).toEqual(c);
  });

  it('clave de mes en EST fija', () => {
    expect(monthKeyOf(histDataToUtc(2026, 1, 31, 23, 59, 0))).toBe('2026-01');
    expect(monthKeyOf(histDataToUtc(2026, 2, 1, 0, 0, 0))).toBe('2026-02');
  });
});
