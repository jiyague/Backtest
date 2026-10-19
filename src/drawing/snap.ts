import type { Candle } from '../types';
import type { Anchor } from './model';

/** Distancia máxima (px) al precio OHLC para que el imán débil actúe. Fuera de ella la posición queda libre. */
export const SNAP_THRESHOLD_PX = 10;

export interface SnapResult {
  anchor: Anchor;
  snapped: boolean;
}

/**
 * Imán débil: si el precio está a menos de `thresholdPx` (en píxeles) de algún OHLC de la vela, se ajusta al más cercano
 * (y el tiempo a la apertura de esa vela). Si no, devuelve la posición libre.
 */
export function weakSnap(
  free: Anchor,
  candle: Candle | undefined,
  priceToY: (price: number) => number | null,
  thresholdPx = SNAP_THRESHOLD_PX,
): SnapResult {
  if (!candle) return { anchor: free, snapped: false };
  const y = priceToY(free.price);
  if (y === null) return { anchor: free, snapped: false };
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 1; i <= 4; i++) {
    const py = priceToY(candle[i]);
    if (py === null) continue;
    const d = Math.abs(py - y);
    if (d < bestDist) {
      bestDist = d;
      best = candle[i];
    }
  }
  if (best === null || bestDist > thresholdPx) return { anchor: free, snapped: false };
  return { anchor: { time: candle[0], price: best }, snapped: true };
}
