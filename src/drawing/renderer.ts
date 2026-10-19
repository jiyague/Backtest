import type { IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { Candle } from '../types';
import { HANDLE_RADIUS, type Pt } from './geometry';
import { handlePoints, type Anchor, type Drawing, type LineDash } from './model';
import { logicalToTime, timeToLogical } from './timemap';

const DASH: Record<LineDash, number[]> = { solid: [], dashed: [8, 4], dotted: [2, 3] };

export interface RenderState {
  drawings: readonly Drawing[];
  selectedId: string | null;
  preview: Drawing | null;
}

/** Primitive de Lightweight Charts: se dibuja dentro del propio ciclo de render del gráfico (sin canvas aparte ni bucles). */
export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly view: IPrimitivePaneView;

  constructor(private getCandles: () => readonly Candle[], private getState: () => RenderState) {
    this.view = { zOrder: () => 'top', renderer: () => this.renderer() };
  }

  attached(p: SeriesAttachedParameter<Time>): void {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = p.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] { return [this.view]; }

  update(): void { this.requestUpdate?.(); }

  /** Anclaje (tiempo, precio) -> píxeles del panel, o null si no se puede convertir. */
  toPixel(a: Anchor): Pt | null {
    if (!this.chart || !this.series) return null;
    const l = timeToLogical(this.getCandles(), a.time);
    if (l === null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(l as never);
    const y = this.series.priceToCoordinate(a.price);
    return x === null || y === null ? null : { x, y };
  }

  /** Píxeles -> (tiempo, precio) libres. */
  fromPixel(p: Pt): Anchor | null {
    if (!this.chart || !this.series) return null;
    const l = this.chart.timeScale().coordinateToLogical(p.x);
    const price = this.series.coordinateToPrice(p.y);
    if (l === null || price === null) return null;
    const time = logicalToTime(this.getCandles(), l);
    return time === null ? null : { time, price };
  }

  private renderer(): IPrimitivePaneRenderer | null {
    const state = this.getState();
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const all = state.preview ? [...state.drawings, state.preview] : state.drawings;
          for (const d of all) {
            const pts = d.anchors.map((a) => this.toPixel(a));
            if (pts.some((p) => p === null)) continue;
            drawOne(ctx, d, pts as Pt[], mediaSize.width);
          }
          const sel = state.drawings.find((d) => d.id === state.selectedId);
          if (sel) {
            for (const a of handlePoints(sel)) {
              const p = this.toPixel(a);
              if (p) drawHandle(ctx, p, sel.style.color);
            }
          }
        });
      },
    };
  }
}

function drawHandle(ctx: CanvasRenderingContext2D, p: Pt, color: string): void {
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, HANDLE_RADIUS - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawOne(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], right: number): void {
  const s = d.style;
  ctx.save();
  ctx.lineWidth = s.width;
  ctx.strokeStyle = s.color;
  ctx.setLineDash(DASH[s.dash]);
  let box: { x1: number; y1: number; x2: number; y2: number };
  if (d.kind === 'rect') {
    const x1 = Math.min(pts[0].x, pts[1].x);
    const x2 = Math.max(pts[0].x, pts[1].x);
    const y1 = Math.min(pts[0].y, pts[1].y);
    const y2 = Math.max(pts[0].y, pts[1].y);
    ctx.globalAlpha = s.fillOpacity;
    ctx.fillStyle = s.fillColor;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    box = { x1, y1, x2, y2 };
  } else {
    const a = pts[0];
    const b = d.kind === 'ray' ? { x: Math.max(right, a.x), y: a.y } : pts[1];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    box = { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
  }
  if (s.text) drawText(ctx, d, box, pts);
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, d: Drawing, box: { x1: number; y1: number; x2: number; y2: number }, pts: Pt[]): void {
  const s = d.style;
  const pad = 4;
  ctx.setLineDash([]);
  ctx.fillStyle = s.textColor;
  ctx.font = `${s.textSize}px system-ui, sans-serif`;
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  let x = cx;
  let y = cy;
  let align: CanvasTextAlign = 'center';
  let base: CanvasTextBaseline = 'middle';
  const line = d.kind !== 'rect';
  switch (s.textPos) {
    case 'top':
      y = line ? cy - s.width - pad : box.y1 + pad;
      base = line ? 'bottom' : 'top';
      break;
    case 'bottom':
      y = line ? cy + s.width + pad : box.y2 - pad;
      base = line ? 'top' : 'bottom';
      break;
    case 'left':
      x = box.x1 + pad;
      align = 'left';
      if (line) { y = (pts[0].x <= (pts[1]?.x ?? Infinity) ? pts[0] : pts[1]).y; base = 'bottom'; }
      break;
    case 'right':
      x = box.x2 - pad;
      align = 'right';
      if (line) { y = (pts[0].x >= (pts[1]?.x ?? -Infinity) ? pts[0] : pts[1]).y; base = 'bottom'; }
      break;
    default:
      break;
  }
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s.text, x, y);
}
