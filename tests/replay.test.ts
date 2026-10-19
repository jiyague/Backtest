import { describe, expect, it } from 'vitest';
import { applyM1, aggregate, barCloseTime } from '../src/timeframes/aggregate';
import { ReplayEngine } from '../src/replay/engine';
import type { Candle, Timeframe } from '../src/types';

const base = Date.UTC(2026, 0, 6, 15, 0) / 1000;
const candles: Candle[] = Array.from({ length: 200 }, (_, i) => {
  const p = 1 + Math.sin(i / 7) / 100;
  return [base + i * 60 + (i > 100 ? 600 : 0), p, p + 0.001, p - 0.001, p + 0.0003];
});

describe('ReplayEngine', () => {
  it('no expone velas posteriores al instante actual', () => {
    const e = new ReplayEngine();
    e.setCandles(candles);
    e.seek(candles[50][0] + 30);
    expect(e.time).toBe(candles[50][0]);
    expect(e.revealed().every((c) => c[0] <= e.time)).toBe(true);
    expect(e.revealed()).toHaveLength(51);
    expect(e.remaining()).toBe(149);
  });

  it('avanza y retrocede sin mostrar el futuro', () => {
    const e = new ReplayEngine();
    e.setCandles(candles);
    e.seek(candles[10][0]);
    expect(e.stepForward()).toEqual(candles[11]);
    expect(e.stepBack()).toEqual(candles[11]);
    expect(e.time).toBe(candles[10][0]);
    expect(e.revealed()).toHaveLength(11);
  });

  it('al ampliar los datos conserva el instante', () => {
    const e = new ReplayEngine();
    e.setCandles(candles.slice(0, 20));
    e.seek(candles[19][0]);
    expect(e.stepForward()).toBeNull();
    e.setCandles(candles);
    expect(e.stepForward()).toEqual(candles[20]);
  });

  it.each(['M1', 'M5', 'M15', 'H1', 'H4', 'D'] as Timeframe[])(
    'la vela en formación en %s se construye desde M1 hasta el instante y coincide con la agregación',
    (tf) => {
      const e = new ReplayEngine();
      e.setCandles(candles);
      e.seek(candles[30][0]);
      const series = aggregate(e.revealed(), tf);
      for (let i = 0; i < 120; i++) {
        const c = e.stepForward()!;
        applyM1(series, c, tf);
        expect(series).toEqual(aggregate(e.revealed(), tf));
        expect(series.every((s) => s[0] <= e.time)).toBe(true);
      }
    },
  );

  it('cambiar de timeframe mantiene el instante', () => {
    const e = new ReplayEngine();
    e.setCandles(candles);
    e.seek(candles[77][0]);
    const m5 = aggregate(e.revealed(), 'M5');
    const h1 = aggregate(e.revealed(), 'H1');
    expect(m5[m5.length - 1][4]).toBe(candles[77][4]);
    expect(h1[h1.length - 1][4]).toBe(candles[77][4]);
  });
});

describe('selección de barra y avance por lotes', () => {
  const m1: Candle[] = Array.from({ length: 600 }, (_, i) => [i * 60, 1, 2, 0.5, 1.5] as Candle);

  it('seek al cierre de una H1 no revela velas posteriores', () => {
    const e = new ReplayEngine();
    e.setCandles(m1);
    e.seek(barCloseTime('H1', 3600));
    expect(e.time).toBe(7140);
    expect(e.revealed().every((c) => c[0] <= barCloseTime('H1', 3600))).toBe(true);
    expect(e.revealed().length).toBe(120);
  });

  it('stepForwardMany avanza varias velas sin pasar del final', () => {
    const e = new ReplayEngine();
    e.setCandles(m1);
    e.seek(0);
    expect(e.stepForwardMany(5).length).toBe(5);
    expect(e.time).toBe(5 * 60);
    expect(e.stepForwardMany(10000).length).toBe(594);
    expect(e.stepForwardMany(3)).toEqual([]);
  });
});
