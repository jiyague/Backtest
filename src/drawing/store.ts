import { createDrawing, deserialize, handlePoints, moveHandle, serialize, translate } from './model';
import type { Anchor, Drawing, DrawingKind, DrawingStyle } from './model';

const KEY_PREFIX = 'backtest.drawings.v1.';

export const storageKey = (pair: string) => `${KEY_PREFIX}${pair}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Capa lógica: lista de dibujos, selección y persistencia en localStorage por par. Sin dependencias del DOM. */
export class DrawingStore {
  private items: Drawing[] = [];
  private sel: string | null = null;
  private pair = '';
  private listeners: (() => void)[] = [];

  constructor(private storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage) {}

  get drawings(): readonly Drawing[] { return this.items; }
  get selectedId(): string | null { return this.sel; }
  get selected(): Drawing | null { return this.items.find((d) => d.id === this.sel) ?? null; }
  get currentPair(): string { return this.pair; }

  subscribe(cb: () => void): void { this.listeners.push(cb); }
  private emit(save: boolean): void {
    if (save) this.save();
    for (const cb of this.listeners) cb();
  }

  /** Cambia de par: carga los dibujos guardados para él. */
  setPair(pair: string): void {
    this.pair = pair;
    this.sel = null;
    this.items = this.load(pair);
    this.emit(false);
  }

  private load(pair: string): Drawing[] {
    try {
      const raw = this.storage?.getItem(storageKey(pair));
      return raw ? (deserialize(raw)?.drawings ?? []) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    if (!this.pair) return;
    try {
      this.storage?.setItem(storageKey(this.pair), serialize(this.pair, this.items));
    } catch {
      /* almacenamiento lleno o no disponible */
    }
  }

  add(kind: DrawingKind, anchors: Anchor[], style: Partial<DrawingStyle> = {}): Drawing {
    const d = createDrawing(kind, anchors, style);
    this.items.push(d);
    this.sel = d.id;
    this.emit(true);
    return d;
  }

  select(id: string | null): void {
    if (id !== null && !this.items.some((d) => d.id === id)) id = null;
    if (id === this.sel) return;
    this.sel = id;
    this.emit(false);
  }

  remove(id: string): boolean {
    const n = this.items.length;
    this.items = this.items.filter((d) => d.id !== id);
    if (this.sel === id) this.sel = null;
    if (this.items.length === n) return false;
    this.emit(true);
    return true;
  }

  removeSelected(): boolean {
    return this.sel !== null && this.remove(this.sel);
  }

  /** Sustituye las anclas (p. ej. durante un arrastre). `persist` false evita guardar en cada movimiento. */
  setAnchors(id: string, anchors: Anchor[], persist = true): void {
    const d = this.items.find((x) => x.id === id);
    if (!d) return;
    d.anchors = anchors;
    this.emit(persist);
  }

  moveHandle(id: string, handle: number, pos: Anchor, persist = true): void {
    const d = this.items.find((x) => x.id === id);
    if (d) this.setAnchors(id, moveHandle(d, handle, pos), persist);
  }

  move(id: string, original: readonly Anchor[], dTime: number, dPrice: number, persist = true): void {
    this.setAnchors(id, translate(original, dTime, dPrice), persist);
  }

  commit(): void { this.save(); }

  updateStyle(id: string, patch: Partial<DrawingStyle>): void {
    const d = this.items.find((x) => x.id === id);
    if (!d) return;
    d.style = { ...d.style, ...patch };
    this.emit(true);
  }

  handles(d: Drawing): Anchor[] { return handlePoints(d); }

  exportJson(): string { return serialize(this.pair, this.items); }

  /** Reemplaza los dibujos del par actual con el contenido del JSON. Devuelve false (sin cambios) si no es válido. */
  importJson(json: string): boolean {
    const parsed = deserialize(json);
    if (!parsed) return false;
    this.items = parsed.drawings;
    this.sel = null;
    this.emit(true);
    return true;
  }
}
