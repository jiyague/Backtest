import { describe, expect, it } from 'vitest';
import { aggregate } from '../src/timeframes/aggregate';
import type { Candle } from '../src/types';
import { hitBody, hitHandle } from '../src/drawing/geometry';
import { createDrawing, deserialize, handlePoints, moveHandle, serialize } from '../src/drawing/model';
import { weakSnap } from '../src/drawing/snap';
import { DrawingStore, storageKey } from '../src/drawing/store';
import { logicalToTime, timeToLogical } from '../src/drawing/timemap';

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('serialización', () => {
  it('ida y vuelta conserva anclas y estilo', () => {
    const d = createDrawing('rect', [{ time: 1700000000, price: 1.1 }, { time: 1700003600, price: 1.2 }], { text: 'Zona', fillOpacity: 0.4 });
    const back = deserialize(serialize('EURUSD', [d]))!;
    expect(back.pair).toBe('EURUSD');
    expect(back.drawings).toEqual([d]);
  });
  it('rechaza JSON o esquema inválido', () => {
    expect(deserialize('no json')).toBeNull();
    expect(deserialize('{"version":2,"pair":"X","drawings":[]}')).toBeNull();
    expect(deserialize('{"version":1,"pair":"X"}')).toBeNull();
  });
  it('descarta dibujos inválidos y sanea estilos', () => {
    const json = JSON.stringify({
      version: 1,
      pair: 'EURUSD',
      drawings: [
        { id: 'a', kind: 'ray', anchors: [{ time: 1, price: 2 }], style: { color: 'red', width: 99, dash: 'x', textPos: 'center' } },
        { id: 'b', kind: 'trend', anchors: [{ time: 1, price: 2 }] },
        { id: 'c', kind: 'otro', anchors: [] },
        { id: 'd', kind: 'trend', anchors: [{ time: NaN, price: 1 }, { time: 2, price: 1 }] },
      ],
    });
    const r = deserialize(json)!;
    expect(r.drawings).toHaveLength(1);
    const s = r.drawings[0].style;
    expect(s.color).toBe('#2962FF');
    expect(s.width).toBe(8);
    expect(s.dash).toBe('solid');
    expect(s.textPos).toBe('top');
  });
});

describe('imán débil', () => {
  const candle: Candle = [1000, 1.1, 1.15, 1.05, 1.12];
  const toY = (p: number) => (1.2 - p) * 1000; // 1 pip = 0.1 px
  it('ajusta al OHLC más cercano si está cerca', () => {
    const r = weakSnap({ time: 1003, price: 1.1496 }, candle, toY);
    expect(r.snapped).toBe(true);
    expect(r.anchor).toEqual({ time: 1000, price: 1.15 });
  });
  it('deja la posición libre si está lejos', () => {
    const free = { time: 1003, price: 1.135 };
    const r = weakSnap(free, candle, toY);
    expect(r.snapped).toBe(false);
    expect(r.anchor).toEqual(free);
  });
  it('sin vela no ajusta', () => {
    expect(weakSnap({ time: 1, price: 1 }, undefined, toY).snapped).toBe(false);
  });
});

describe('estabilidad temporal entre timeframes', () => {
  const m1: Candle[] = [];
  for (let i = 0; i < 60 * 24 * 3; i++) m1.push([1_700_000_000 + i * 60, 1, 2, 0.5, 1.5]);
  const t = m1[3000][0] + 17;

  it('timeToLogical y logicalToTime son inversas', () => {
    for (const tf of ['M1', 'M15', 'H1', 'H4', 'D'] as const) {
      const c = tf === 'M1' ? m1 : aggregate(m1, tf);
      const l = timeToLogical(c, t)!;
      expect(logicalToTime(c, l)).toBeCloseTo(t, 3);
    }
  });
  it('el mismo timestamp cae dentro de la vela correcta en cada timeframe', () => {
    const h1 = aggregate(m1, 'H1');
    const l = timeToLogical(h1, t)!;
    const bar = h1[Math.floor(l)];
    expect(bar[0]).toBeLessThanOrEqual(t);
    expect(t).toBeLessThan(bar[0] + 3600);
  });
  it('extrapola fuera de la serie (replay / futuro)', () => {
    const last = m1[m1.length - 1][0];
    expect(timeToLogical(m1, last + 600)).toBeCloseTo(m1.length - 1 + 10, 5);
    expect(logicalToTime(m1, -3)).toBe(m1[0][0] - 180);
  });
});

describe('operaciones básicas', () => {
  it('crear, seleccionar y borrar', () => {
    const s = new DrawingStore(new MemStorage());
    s.setPair('EURUSD');
    const a = s.add('trend', [{ time: 1, price: 1 }, { time: 2, price: 2 }]);
    const b = s.add('ray', [{ time: 3, price: 1 }]);
    expect(s.selectedId).toBe(b.id);
    s.select(a.id);
    expect(s.selected?.id).toBe(a.id);
    expect(s.removeSelected()).toBe(true);
    expect(s.drawings.map((d) => d.id)).toEqual([b.id]);
    expect(s.selectedId).toBeNull();
    expect(s.remove('nope')).toBe(false);
  });
  it('mover cuerpo y anclas', () => {
    const s = new DrawingStore(new MemStorage());
    s.setPair('EURUSD');
    const r = s.add('rect', [{ time: 10, price: 1 }, { time: 20, price: 2 }]);
    s.move(r.id, r.anchors.map((a) => ({ ...a })), 5, 0.5);
    expect(s.drawings[0].anchors).toEqual([{ time: 15, price: 1.5 }, { time: 25, price: 2.5 }]);
    const corners = handlePoints(s.drawings[0]);
    expect(corners).toHaveLength(4);
    expect(moveHandle(s.drawings[0], 2, { time: 30, price: 3 })[1]).toEqual({ time: 30, price: 3 });
    expect(moveHandle(s.drawings[0], 0, { time: 1, price: 9 })[0]).toEqual({ time: 1, price: 9 });
  });
  it('persiste por par y restaura', () => {
    const st = new MemStorage();
    const s = new DrawingStore(st);
    s.setPair('EURUSD');
    s.add('ray', [{ time: 1, price: 1 }], { text: 'hola' });
    expect(st.data.has(storageKey('EURUSD'))).toBe(true);
    const s2 = new DrawingStore(st);
    s2.setPair('EURUSD');
    expect(s2.drawings).toHaveLength(1);
    expect(s2.drawings[0].style.text).toBe('hola');
    s2.setPair('GBPUSD');
    expect(s2.drawings).toHaveLength(0);
  });
  it('importa/exporta y no rompe con JSON inválido', () => {
    const s = new DrawingStore(new MemStorage());
    s.setPair('EURUSD');
    s.add('ray', [{ time: 1, price: 1 }]);
    const json = s.exportJson();
    expect(s.importJson('{"x":1}')).toBe(false);
    expect(s.drawings).toHaveLength(1);
    s.removeSelected();
    s.select(s.drawings[0]?.id ?? null);
    expect(s.importJson(json)).toBe(true);
    expect(s.drawings).toHaveLength(1);
  });
});

describe('hit-testing', () => {
  it('detecta cuerpo y puntos de control', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(hitBody('trend', pts, { x: 50, y: 3 }, 500)).toBe(true);
    expect(hitBody('trend', pts, { x: 50, y: 30 }, 500)).toBe(false);
    expect(hitBody('ray', [{ x: 10, y: 10 }], { x: 400, y: 10 }, 500)).toBe(true);
    expect(hitBody('ray', [{ x: 10, y: 10 }], { x: 0, y: 10 }, 500)).toBe(false);
    expect(hitBody('rect', [{ x: 0, y: 0 }, { x: 10, y: 10 }], { x: 5, y: 5 }, 500)).toBe(true);
    expect(hitHandle(pts, { x: 98, y: 2 })).toBe(1);
    expect(hitHandle(pts, { x: 50, y: 50 })).toBe(-1);
  });
});
