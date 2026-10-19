import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../types';
import { hitBody, hitHandle, type Pt } from './geometry';
import { createDrawing, handlePoints, type Anchor, type Drawing, type DrawingKind } from './model';
import { DrawingPrimitive } from './renderer';
import { weakSnap } from './snap';
import { DrawingStore } from './store';
import { DrawingUI, type Tool } from './ui';

const DRAG_PX = 5; // desplazamiento mínimo para que un arrastre cuente como "crear con drag"

interface Deps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  container: HTMLElement;
  getCandles: () => readonly Candle[];
  /** true si otro modo (p. ej. seleccionar barra del replay) debe recibir los clics. */
  isBlocked: () => boolean;
}

type Drag =
  | { mode: 'handle'; id: string; handle: number; original: Anchor[] }
  | { mode: 'body'; id: string; original: Anchor[]; start: Pt; moved: boolean };

/** Controlador de interacción: herramienta activa, creación, hit-testing, arrastre y atajos. */
export class DrawingController {
  readonly store: DrawingStore;
  private readonly prim: DrawingPrimitive;
  private readonly ui: DrawingUI;
  private tool: Tool = 'select';
  private magnet = true;
  private creating: { drawing: Drawing; start: Pt } | null = null;
  private drag: Drag | null = null;

  constructor(private d: Deps) {
    this.store = new DrawingStore();
    this.prim = new DrawingPrimitive(d.getCandles, () => ({
      drawings: this.store.drawings,
      selectedId: this.store.selectedId,
      preview: this.creating?.drawing ?? null,
    }));
    d.series.attachPrimitive(this.prim);
    this.ui = new DrawingUI({
      onTool: (t) => this.setTool(t),
      onDelete: () => this.store.removeSelected(),
      onMagnet: (on) => { this.magnet = on; },
      onExport: () => this.exportFile(),
      onImport: (text) => { if (!this.store.importJson(text)) alert('El archivo no es un JSON de dibujos válido.'); },
      onStyle: (patch) => { const id = this.store.selectedId; if (id) this.store.updateStyle(id, patch); },
    });
    this.ui.setMagnet(this.magnet);
    this.ui.setTool(this.tool);
    this.store.subscribe(() => {
      this.ui.showProperties(this.store.selected);
      this.prim.update();
    });

    d.container.addEventListener('mousedown', (e) => this.onDown(e), true);
    d.container.addEventListener('mousemove', (e) => this.onMove(e), true);
    window.addEventListener('mouseup', (e) => this.onUp(e), true);
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  setPair(pair: string): void {
    this.cancel();
    this.store.setPair(pair);
  }

  /** Fuerza un redibujado de los dibujos (p. ej. tras cambiar datos). */
  refresh(): void { this.prim.update(); }

  private setTool(t: Tool): void {
    this.cancel();
    this.tool = t;
    this.ui.setTool(t);
    this.d.container.style.cursor = t === 'select' ? '' : 'crosshair';
  }

  // ---------- coordenadas ----------

  private point(e: MouseEvent): Pt | null {
    const r = this.d.container.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const size = this.d.chart.paneSize();
    return p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height ? p : null;
  }

  private anchorAt(p: Pt, snap: boolean): Anchor | null {
    const free = this.prim.fromPixel(p);
    if (!free) return null;
    if (!snap || !this.magnet) return free;
    const l = this.d.chart.timeScale().coordinateToLogical(p.x);
    const candle = l === null ? undefined : this.d.getCandles()[Math.round(l)];
    return weakSnap(free, candle, (price) => this.d.series.priceToCoordinate(price)).anchor;
  }

  private pixels(d: Drawing): Pt[] | null {
    const pts = d.anchors.map((a) => this.prim.toPixel(a));
    return pts.every((p) => p !== null) ? (pts as Pt[]) : null;
  }

  /** Dibujo (y punto de control) bajo el puntero; el seleccionado tiene prioridad. */
  private hit(p: Pt): { drawing: Drawing; handle: number } | null {
    const width = this.d.chart.paneSize().width;
    const sel = this.store.selected;
    if (sel) {
      const hp = handlePoints(sel).map((a) => this.prim.toPixel(a));
      if (hp.every((x) => x !== null)) {
        const h = hitHandle(hp as Pt[], p);
        if (h >= 0) return { drawing: sel, handle: h };
      }
    }
    const list = this.store.drawings;
    for (let i = list.length - 1; i >= 0; i--) {
      const pts = this.pixels(list[i]);
      if (pts && hitBody(list[i].kind, pts, p, width)) return { drawing: list[i], handle: -1 };
    }
    return null;
  }

  // ---------- eventos ----------

  private onDown(e: MouseEvent): void {
    if (e.button !== 0 || this.d.isBlocked()) return;
    const p = this.point(e);
    if (!p) return;
    if (this.tool === 'select') {
      const h = this.hit(p);
      if (!h) {
        this.store.select(null);
        return; // el gráfico gestiona el arrastre normal
      }
      this.swallow(e);
      this.store.select(h.drawing.id);
      this.drag = h.handle >= 0
        ? { mode: 'handle', id: h.drawing.id, handle: h.handle, original: h.drawing.anchors.map((a) => ({ ...a })) }
        : { mode: 'body', id: h.drawing.id, original: h.drawing.anchors.map((a) => ({ ...a })), start: p, moved: false };
      return;
    }
    this.swallow(e);
    const a = this.anchorAt(p, true);
    if (!a) return;
    const kind = this.tool as DrawingKind;
    if (kind === 'ray') {
      this.store.add('ray', [a]);
      this.setTool('select');
    } else if (!this.creating) {
      this.creating = { drawing: createDrawing(kind, [a, a]), start: p };
      this.prim.update();
    } else {
      this.finishCreating(a);
    }
  }

  private onMove(e: MouseEvent): void {
    if (!this.drag && !this.creating) return;
    const p = this.point(e) ?? this.clampedPoint(e);
    if (this.drag) {
      this.swallow(e);
      this.applyDrag(this.drag, p, !e.altKey);
    } else if (this.creating) {
      const a = this.anchorAt(p, true);
      if (a) {
        this.creating.drawing.anchors = [this.creating.drawing.anchors[0], a];
        this.prim.update();
      }
    }
  }

  private clampedPoint(e: MouseEvent): Pt {
    const r = this.d.container.getBoundingClientRect();
    const size = this.d.chart.paneSize();
    return {
      x: Math.min(size.width, Math.max(0, e.clientX - r.left)),
      y: Math.min(size.height, Math.max(0, e.clientY - r.top)),
    };
  }

  private onUp(e: MouseEvent): void {
    if (this.drag) {
      this.swallow(e);
      this.store.commit();
      this.drag = null;
      return;
    }
    if (this.creating) {
      const p = this.point(e) ?? this.clampedPoint(e);
      const s = this.creating.start;
      if (Math.hypot(p.x - s.x, p.y - s.y) >= DRAG_PX) {
        this.swallow(e);
        const a = this.anchorAt(p, true);
        if (a) this.finishCreating(a);
      }
    }
  }

  private applyDrag(drag: Drag, p: Pt, snap: boolean): void {
    if (drag.mode === 'handle') {
      const a = this.anchorAt(p, snap);
      if (a) this.store.moveHandle(drag.id, drag.handle, a, false);
      return;
    }
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 2) return;
    drag.moved = true;
    const from = this.prim.fromPixel(drag.start);
    const to = this.prim.fromPixel(p);
    if (from && to) this.store.move(drag.id, drag.original, to.time - from.time, to.price - from.price, false);
  }

  private finishCreating(end: Anchor): void {
    const c = this.creating;
    if (!c) return;
    this.creating = null;
    const [a] = c.drawing.anchors;
    if (a.time === end.time && a.price === end.price) {
      this.prim.update();
      return;
    }
    this.store.add(c.drawing.kind, [a, end]);
    this.setTool('select');
  }

  /** Cancela creación o edición en curso, restaurando la geometría original. */
  private cancel(): boolean {
    let did = false;
    if (this.creating) {
      this.creating = null;
      this.prim.update();
      did = true;
    }
    if (this.drag) {
      this.store.setAnchors(this.drag.id, this.drag.original, false);
      this.drag = null;
      did = true;
    }
    return did;
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'Escape') {
      if (!this.cancel() && this.tool !== 'select') this.setTool('select');
    } else if (e.key === 'Delete') {
      this.store.removeSelected();
    }
  }

  private swallow(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
  }

  private exportFile(): void {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dibujos-${this.store.currentPair || 'par'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
