import type { DrawingKind } from './model';

export interface Pt { x: number; y: number }

export const HANDLE_RADIUS = 7;
export const HIT_TOLERANCE = 6;

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** ¿El punto toca el cuerpo del dibujo? `pts` son las anclas en píxeles y `right` el borde derecho del panel (para el rayo). */
export function hitBody(kind: DrawingKind, pts: readonly Pt[], p: Pt, right: number, tol = HIT_TOLERANCE): boolean {
  if (kind === 'trend') return distToSegment(p, pts[0], pts[1]) <= tol;
  if (kind === 'ray') return distToSegment(p, pts[0], { x: Math.max(right, pts[0].x), y: pts[0].y }) <= tol;
  const x1 = Math.min(pts[0].x, pts[1].x) - tol;
  const x2 = Math.max(pts[0].x, pts[1].x) + tol;
  const y1 = Math.min(pts[0].y, pts[1].y) - tol;
  const y2 = Math.max(pts[0].y, pts[1].y) + tol;
  return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
}

/** Índice del punto de control más cercano dentro del radio, o -1. */
export function hitHandle(handles: readonly Pt[], p: Pt, r = HANDLE_RADIUS): number {
  let best = -1;
  let bestD = Infinity;
  handles.forEach((h, i) => {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= r && d < bestD) { best = i; bestD = d; }
  });
  return best;
}
