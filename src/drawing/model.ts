/** Modelos de dibujo. Las anclas se guardan por (tiempo UTC en segundos, precio), nunca por píxel ni por índice de vela. */

export type DrawingKind = 'trend' | 'ray' | 'rect';
export type LineDash = 'solid' | 'dashed' | 'dotted';
export type TextPos = 'top' | 'bottom' | 'center' | 'left' | 'right';

export interface Anchor {
  time: number;
  price: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  dash: LineDash;
  fillColor: string;
  fillOpacity: number;
  text: string;
  textColor: string;
  textSize: number;
  textPos: TextPos;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  anchors: Anchor[];
  style: DrawingStyle;
}

export const DRAWING_KINDS: readonly DrawingKind[] = ['trend', 'ray', 'rect'];
export const DASHES: readonly LineDash[] = ['solid', 'dashed', 'dotted'];
export const TEXT_POSITIONS: Record<DrawingKind, readonly TextPos[]> = {
  trend: ['top', 'bottom', 'left', 'right'],
  ray: ['top', 'bottom', 'left', 'right'],
  rect: ['top', 'bottom', 'center', 'left', 'right'],
};
export const ANCHOR_COUNT: Record<DrawingKind, number> = { trend: 2, ray: 1, rect: 2 };
export const MAX_DRAWINGS = 2000;

export const DEFAULT_STYLE: DrawingStyle = {
  color: '#2962FF',
  width: 2,
  dash: 'solid',
  fillColor: '#2962FF',
  fillOpacity: 0.15,
  text: '',
  textColor: '#131722',
  textSize: 12,
  textPos: 'top',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let counter = 0;
export function newId(): string {
  counter++;
  return `d${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createDrawing(kind: DrawingKind, anchors: Anchor[], style: Partial<DrawingStyle> = {}, id = newId()): Drawing {
  return { id, kind, anchors: anchors.slice(0, ANCHOR_COUNT[kind]).map((a) => ({ ...a })), style: { ...DEFAULT_STYLE, ...style } };
}

/** Puntos de control visibles: el rectángulo expone sus 4 esquinas, el resto sus anclas. */
export function handlePoints(d: Drawing): Anchor[] {
  if (d.kind !== 'rect') return d.anchors.map((a) => ({ ...a }));
  const [a, b] = d.anchors;
  return [
    { time: a.time, price: a.price },
    { time: b.time, price: a.price },
    { time: b.time, price: b.price },
    { time: a.time, price: b.price },
  ];
}

/** Mueve el punto de control `i` a `pos` y devuelve las nuevas anclas (no muta el original). */
export function moveHandle(d: Drawing, i: number, pos: Anchor): Anchor[] {
  const anchors = d.anchors.map((a) => ({ ...a }));
  if (d.kind !== 'rect') {
    if (anchors[i]) anchors[i] = { ...pos };
    return anchors;
  }
  // esquinas: 0 = (a.t, a.p), 1 = (b.t, a.p), 2 = (b.t, b.p), 3 = (a.t, b.p)
  const [a, b] = anchors;
  if (i === 0 || i === 3) a.time = pos.time;
  else b.time = pos.time;
  if (i === 0 || i === 1) a.price = pos.price;
  else b.price = pos.price;
  return anchors;
}

/** Desplaza todas las anclas del dibujo (tiempo y precio). */
export function translate(anchors: readonly Anchor[], dTime: number, dPrice: number): Anchor[] {
  return anchors.map((a) => ({ time: a.time + dTime, price: a.price + dPrice }));
}

// ---------- serialización ----------

export interface DrawingsFile {
  version: 1;
  pair: string;
  drawings: Drawing[];
}

export function serialize(pair: string, drawings: readonly Drawing[]): string {
  const file: DrawingsFile = { version: 1, pair, drawings: drawings.map((d) => ({ ...d, anchors: d.anchors.map((a) => ({ ...a })), style: { ...d.style } })) };
  return JSON.stringify(file);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sanitizeStyle(raw: unknown, kind: DrawingKind): DrawingStyle {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const color = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v : def);
  return {
    color: color(s.color, DEFAULT_STYLE.color),
    width: isNum(s.width) ? clamp(Math.round(s.width), 1, 8) : DEFAULT_STYLE.width,
    dash: DASHES.includes(s.dash as LineDash) ? (s.dash as LineDash) : DEFAULT_STYLE.dash,
    fillColor: color(s.fillColor, DEFAULT_STYLE.fillColor),
    fillOpacity: isNum(s.fillOpacity) ? clamp(s.fillOpacity, 0, 1) : DEFAULT_STYLE.fillOpacity,
    text: typeof s.text === 'string' ? s.text.slice(0, 200) : '',
    textColor: color(s.textColor, DEFAULT_STYLE.textColor),
    textSize: isNum(s.textSize) ? clamp(Math.round(s.textSize), 8, 48) : DEFAULT_STYLE.textSize,
    textPos: TEXT_POSITIONS[kind].includes(s.textPos as TextPos) ? (s.textPos as TextPos) : DEFAULT_STYLE.textPos,
  };
}

/** Valida un dibujo suelto; devuelve null si el esquema básico no se cumple. */
export function sanitizeDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!DRAWING_KINDS.includes(r.kind as DrawingKind)) return null;
  const kind = r.kind as DrawingKind;
  if (!Array.isArray(r.anchors) || r.anchors.length !== ANCHOR_COUNT[kind]) return null;
  const anchors: Anchor[] = [];
  for (const a of r.anchors) {
    if (!a || typeof a !== 'object' || !isNum((a as Anchor).time) || !isNum((a as Anchor).price)) return null;
    anchors.push({ time: (a as Anchor).time, price: (a as Anchor).price });
  }
  const id = typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64 ? r.id : newId();
  return { id, kind, anchors, style: sanitizeStyle(r.style, kind) };
}

/** Interpreta un JSON de dibujos. Devuelve null si no es válido; descarta los dibujos individuales no válidos. */
export function deserialize(json: string): { pair: string; drawings: Drawing[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const f = data as Record<string, unknown>;
  if (f.version !== 1 || typeof f.pair !== 'string' || !Array.isArray(f.drawings)) return null;
  const drawings: Drawing[] = [];
  const seen = new Set<string>();
  for (const raw of f.drawings.slice(0, MAX_DRAWINGS)) {
    const d = sanitizeDrawing(raw);
    if (!d) continue;
    if (seen.has(d.id)) d.id = newId();
    seen.add(d.id);
    drawings.push(d);
  }
  return { pair: f.pair, drawings };
}
