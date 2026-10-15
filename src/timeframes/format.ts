const base = { timeZone: 'America/New_York', hourCycle: 'h23' } as const;
const full = new Intl.DateTimeFormat('es-ES', { ...base, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const date = new Intl.DateTimeFormat('es-ES', { ...base, year: 'numeric', month: 'short', day: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('es-ES', { ...base, day: 'numeric', month: 'short' });
const month = new Intl.DateTimeFormat('es-ES', { ...base, month: 'short' });
const year = new Intl.DateTimeFormat('es-ES', { ...base, year: 'numeric' });
const time = new Intl.DateTimeFormat('es-ES', { ...base, hour: '2-digit', minute: '2-digit' });

const ms = (t: number) => new Date(t * 1000);

/** Fecha y hora completas en America/New_York. */
export const formatNYFull = (t: number) => full.format(ms(t));
export const formatNYDate = (t: number) => date.format(ms(t));
export const formatNYDayMonth = (t: number) => dayMonth.format(ms(t));
export const formatNYMonth = (t: number) => month.format(ms(t));
export const formatNYYear = (t: number) => year.format(ms(t));
export const formatNYTime = (t: number) => time.format(ms(t));

/** Valor para <input type="datetime-local"> con la hora de NY. */
export function toNYInputValue(t: number): string {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', { ...base, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(ms(t))) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
