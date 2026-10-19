import { DASHES, TEXT_POSITIONS, type Drawing, type DrawingKind, type DrawingStyle, type LineDash, type TextPos } from './model';

export type Tool = 'select' | DrawingKind;

export interface UIHandlers {
  onTool(t: Tool): void;
  onDelete(): void;
  onMagnet(on: boolean): void;
  onExport(): void;
  onImport(text: string): void;
  onStyle(patch: Partial<DrawingStyle>): void;
}

const TOOLS: { tool: Tool; icon: string; title: string }[] = [
  { tool: 'select', icon: '↖', title: 'Selector (seleccionar y editar)' },
  { tool: 'trend', icon: '╱', title: 'Línea de tendencia' },
  { tool: 'ray', icon: '→', title: 'Rayo horizontal' },
  { tool: 'rect', icon: '▭', title: 'Rectángulo' },
];
const DASH_LABEL: Record<LineDash, string> = { solid: 'Sólida', dashed: 'Discontinua', dotted: 'Punteada' };
const POS_LABEL: Record<TextPos, string> = { top: 'Arriba', bottom: 'Abajo', center: 'Centro', left: 'Izquierda', right: 'Derecha' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, attrs: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  parent.append(e);
  return e;
}

/** Barra izquierda de herramientas y panel flotante de propiedades (DOM puro, textos en español). */
export class DrawingUI {
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private magnetBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private props = document.getElementById('draw-props')!;
  private fields: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  private fillRows: HTMLElement[] = [];
  private posSel!: HTMLSelectElement;
  private shownId: string | null = null;
  private shownKind: DrawingKind | null = null;

  constructor(private h: UIHandlers) {
    const bar = document.getElementById('draw-tools')!;
    for (const t of TOOLS) {
      const b = el<'button'>('button', bar, { textContent: t.icon, title: t.title });
      b.onclick = () => h.onTool(t.tool);
      this.toolBtns.set(t.tool, b);
    }
    this.deleteBtn = el<'button'>('button', bar, { textContent: '🗑', title: 'Borrar elemento seleccionado (Supr)', disabled: true });
    this.deleteBtn.onclick = () => h.onDelete();
    this.magnetBtn = el<'button'>('button', bar, { textContent: '🧲', title: 'Imán débil (ajusta a OHLC cercano)' });
    this.magnetBtn.onclick = () => {
      const on = !this.magnetBtn.classList.contains('active');
      this.setMagnet(on);
      h.onMagnet(on);
    };
    const exp = el<'button'>('button', bar, { textContent: '⤓', title: 'Exportar dibujos a JSON' });
    exp.onclick = () => h.onExport();
    const file = el<'input'>('input', bar, { type: 'file', accept: 'application/json,.json', hidden: true });
    const imp = el<'button'>('button', bar, { textContent: '⤒', title: 'Importar dibujos desde JSON' });
    imp.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) h.onImport(await f.text());
    };
    this.buildProps();
  }

  setTool(t: Tool): void {
    this.toolBtns.forEach((b, k) => b.classList.toggle('active', k === t));
  }

  setMagnet(on: boolean): void {
    this.magnetBtn.classList.toggle('active', on);
  }

  private row(label: string, make: (box: HTMLElement) => HTMLInputElement | HTMLSelectElement, fill = false): HTMLInputElement | HTMLSelectElement {
    const r = el<'label'>('label', this.props, { textContent: label });
    const input = make(r);
    if (fill) this.fillRows.push(r);
    return input;
  }

  private buildProps(): void {
    const style = (key: keyof DrawingStyle, parse: (v: string) => unknown = (v) => v) =>
      (e: Event) => this.h.onStyle({ [key]: parse((e.target as HTMLInputElement).value) });
    const color = (key: keyof DrawingStyle, label: string, fill = false) => {
      this.fields[key] = this.row(label, (b) => el<'input'>('input', b, { type: 'color', oninput: style(key) }), fill);
    };
    color('color', 'Color de línea');
    this.fields.width = this.row('Grosor', (b) => {
      const s = el<'select'>('select', b, { onchange: style('width', Number) });
      for (let i = 1; i <= 6; i++) el<'option'>('option', s, { value: String(i), textContent: `${i} px` });
      return s;
    });
    this.fields.dash = this.row('Estilo', (b) => {
      const s = el<'select'>('select', b, { onchange: style('dash') });
      for (const d of DASHES) el<'option'>('option', s, { value: d, textContent: DASH_LABEL[d] });
      return s;
    });
    color('fillColor', 'Relleno', true);
    this.fields.fillOpacity = this.row('Opacidad', (b) => el<'input'>('input', b, { type: 'range', min: '0', max: '1', step: '0.05', oninput: style('fillOpacity', Number) }), true);
    this.fields.text = this.row('Texto', (b) => el<'input'>('input', b, { type: 'text', maxLength: 200, oninput: style('text') }));
    color('textColor', 'Color del texto');
    this.fields.textSize = this.row('Tamaño del texto', (b) => el<'input'>('input', b, { type: 'number', min: '8', max: '48', onchange: style('textSize', (v) => Math.min(48, Math.max(8, Number(v) || 12))) }));
    this.posSel = this.row('Posición del texto', (b) => el<'select'>('select', b, { onchange: style('textPos') })) as HTMLSelectElement;
    this.fields.textPos = this.posSel;
  }

  /** Muestra (o esconde) las propiedades del dibujo seleccionado. */
  showProperties(d: Drawing | null): void {
    this.deleteBtn.disabled = !d;
    this.props.hidden = !d;
    if (!d) {
      this.shownId = null;
      return;
    }
    if (this.shownKind !== d.kind) {
      this.posSel.replaceChildren();
      for (const p of TEXT_POSITIONS[d.kind]) el<'option'>('option', this.posSel, { value: p, textContent: POS_LABEL[p] });
      this.shownKind = d.kind;
    }
    this.fillRows.forEach((r) => (r.hidden = d.kind !== 'rect'));
    // no se pisa el campo que el usuario está editando
    const active = document.activeElement;
    for (const [k, f] of Object.entries(this.fields)) {
      if (f === active && this.shownId === d.id) continue;
      f.value = String(d.style[k as keyof DrawingStyle]);
    }
    this.shownId = d.id;
  }
}
