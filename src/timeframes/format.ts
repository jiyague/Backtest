import { getTimeZone } from './timezone';

type Opts = Intl.DateTimeFormatOptions;
const cache = new Map<string, Intl.DateTimeFormat>();

/** Formateador Intl para la zona activa (cacheado por zona y opciones). */
function fmt(locale: string, opts: Opts): Intl.DateTimeFormat {
  const timeZone = getTimeZone();
  const key = `${locale}|${timeZone}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale, { timeZone, hourCycle: 'h23', ...opts })));
  return f;
}

const ms = (t: number) => new Date(t * 1000);

/** Fecha y hora completas en la zona activa (por defecto America/New_York). */
export const formatFull = (t: number) =>
  fmt('es-ES', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms(t));

const WEEKDAYS_ES: Record<string, string> = { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' };
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta del cursor: "lun 28 sep '26 01:00" (día de la semana en español, zona activa). `t` es el inicio de vela. */
export function formatCrosshair(t: number): string {
  const p: Record<string, string> = {};
  for (const part of fmt('en-US', {
    weekday: 'short', year: '2-digit', month: 'numeric', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(ms(t))) {
    p[part.type] = part.value;
  }
  return `${WEEKDAYS_ES[p.weekday]} ${p.day} ${MONTHS_ES[Number(p.month) - 1]} '${p.year} ${p.hour}:${p.minute}`;
}
export const formatDate = (t: number) => fmt('es-ES', { year: 'numeric', month: 'short', day: '2-digit' }).format(ms(t));
export const formatDayMonth = (t: number) => fmt('es-ES', { day: 'numeric', month: 'short' }).format(ms(t));
export const formatMonth = (t: number) => fmt('es-ES', { month: 'short' }).format(ms(t));
export const formatYear = (t: number) => fmt('es-ES', { year: 'numeric' }).format(ms(t));
export const formatTime = (t: number) => fmt('es-ES', { hour: '2-digit', minute: '2-digit' }).format(ms(t));

/** Valor para <input type="datetime-local"> con la hora de NY (el campo de inicio siempre es NY). */
export function toNYInputValue(t: number): string {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ms(t))) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
