const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCaches = new Map<string, Map<number, number>>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** Desfase (segundos, con signo) de una zona IANA respecto a UTC en el instante dado. */
export function tzOffsetSeconds(zone: string, utc: number): number {
  // Los cambios de hora caen siempre en horas UTC exactas (o en medias): se cachea por hora.
  let cache = offsetCaches.get(zone);
  if (!cache) offsetCaches.set(zone, (cache = new Map()));
  const key = Math.floor(utc / 3600);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const p: Record<string, number> = {};
  for (const part of partsFormatter(zone).formatToParts(new Date(key * 3600 * 1000))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
  const offset = asUtc - key * 3600;
  cache.set(key, offset);
  return offset;
}

/** Desfase (segundos, negativo) de America/New_York respecto a UTC en el instante dado. */
export function nyOffsetSeconds(utc: number): number {
  return tzOffsetSeconds('America/New_York', utc);
}

/**
 * Convierte una hora local de NY (expresada como "segundos epoch si fuese UTC")
 * al instante UTC real. En horas ambiguas (fin de DST) devuelve la primera ocurrencia.
 */
export function nyLocalToUtc(local: number): number {
  for (const off of [-4 * 3600, -5 * 3600]) {
    const candidate = local - off;
    if (nyOffsetSeconds(candidate) === off) return candidate;
  }
  return local + 5 * 3600; // hora inexistente (salto de primavera)
}

/** Fecha civil (y, m, d) a partir de días desde 1970-01-01. */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

/** Días desde 1970-01-01 a partir de una fecha civil. */
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
