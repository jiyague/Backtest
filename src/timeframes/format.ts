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
