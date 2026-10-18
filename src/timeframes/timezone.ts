import { tzOffsetSeconds } from './ny';

export interface TimeZoneOption {
  id: string;
  /** Nombre corto para mostrar en pantalla. */
  name: string;
}

export const TIME_ZONES: readonly TimeZoneOption[] = [
  { id: 'America/New_York', name: 'NY' },
  { id: 'UTC', name: 'UTC' },
  { id: 'Europe/Madrid', name: 'Madrid' },
  { id: 'Europe/London', name: 'Londres' },
];

export const DEFAULT_TIME_ZONE = 'America/New_York';

let current = DEFAULT_TIME_ZONE;

/** Zona horaria activa para eje, crosshair y tooltips. */
export const getTimeZone = (): string => current;

export function setTimeZone(zone: string): void {
  if (!TIME_ZONES.some((z) => z.id === zone)) throw new Error(`Zona horaria no soportada: ${zone}`);
  current = zone;
}

const abbrFormatters = new Map<string, Intl.DateTimeFormat>();

function abbreviation(zone: string, t: number): string {
  let f = abbrFormatters.get(zone);
  if (!f) abbrFormatters.set(zone, (f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })));
  return f.formatToParts(new Date(t * 1000)).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** "UTC-4", "UTC+5:30", "UTC+0". */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** Etiqueta de la zona con el desfase vigente en el instante t, p. ej. "NY (EDT, UTC-4)". */
export function zoneLabel(t: number, zone: string = current): string {
  if (zone === 'UTC') return 'UTC';
  const name = TIME_ZONES.find((z) => z.id === zone)?.name ?? zone;
  const off = formatOffset(tzOffsetSeconds(zone, t));
  const abbr = abbreviation(zone, t);
  // Intl da "EDT"/"EST" para NY y "GMT+2" para otras; solo se muestra si aporta algo.
  return /^[A-Z]{2,5}$/.test(abbr) && abbr !== 'UTC' ? `${name} (${abbr}, ${off})` : `${name} (${off})`;
}
