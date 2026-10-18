/**
 * Convierte los CSV mensuales (…_YYYYMM.csv) y anuales (…_YYYY.csv) de HistData (data/raw/<PAR>/*.csv) en JSON compactos:
 *  - data/json/<PAR>/<YYYY>-<MM>.json  (M1, hora EST fija tal cual HistData)
 *  - data/json/<PAR>/index.json        (meses y años disponibles)
 *  - data/json/<PAR>/H1-<YYYY>.json y D-<YYYY>.json (precalculados, tiempo UTC)
 *  - data/json/pairs.json              (pares disponibles)
 * y copia todo a public/data para servirlo con la web.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aggregate } from '../src/timeframes/aggregate';
import {
  MONTH_NOTE,
  parseHistDataCsv,
  mergeIntoMonths,
  parseHistDataFilename,
  toMonthRow,
  type MonthFile,
} from '../src/data/parse';
import { HISTDATA_TZ, type Candle, type PairIndex } from '../src/types';

const root = resolve(import.meta.dirname, '..');
const RAW = join(root, 'data/raw');
const OUT = join(root, 'data/json');
const PUBLIC = join(root, 'public/data');

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value) + '\n');
}

function splitByYear(candles: Candle[]): Map<number, Candle[]> {
  const byYear = new Map<number, Candle[]>();
  for (const c of candles) {
    const y = new Date(c[0] * 1000).getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(c);
  }
  return byYear;
}

function convertPair(dirName: string): PairIndex | null {
  const pair = dirName.toUpperCase();
  const dir = join(RAW, dirName);
  const files = readdirSync(dir)
    .map((name) => ({ name, info: parseHistDataFilename(name) }))
    .filter((f) => {
      if (!f.info && f.name.toLowerCase().endsWith('.csv')) console.warn(`Ignorado (nombre no reconocido): ${pair}/${f.name}`);
      return f.info && f.info.pair === pair;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) return null;

  const pairOut = join(OUT, pair);
  rmSync(pairOut, { recursive: true, force: true });
  const annual: Candle[][] = [];
  const monthly: Candle[][] = [];
  for (const { name, info } of files) {
    const { candles, invalid } = parseHistDataCsv(readFileSync(join(dir, name), 'utf8'));
    if (invalid) console.warn(`${pair}/${name}: ${invalid} líneas no válidas ignoradas`);
    (info!.month === null ? annual : monthly).push(candles);
  }
  const byMonth = mergeIntoMonths(annual, monthly);
  const months: string[] = [];
  const all: Candle[] = [];
  for (const [month, candles] of byMonth) {
    const file: MonthFile = {
      pair,
      month,
      tz: HISTDATA_TZ,
      fields: ['t', 'o', 'h', 'l', 'c'],
      note: MONTH_NOTE,
      data: candles.map(toMonthRow),
    };
    writeJson(join(pairOut, `${month}.json`), file);
    months.push(month);
    for (const c of candles) all.push(c);
    console.log(`${pair} ${month}: ${candles.length} velas M1`);
  }

  const years = new Set<number>();
  for (const tf of ['H1', 'D'] as const) {
    for (const [year, data] of splitByYear(aggregate(all, tf))) {
      years.add(year);
      writeJson(join(pairOut, `${tf}-${year}.json`), {
        pair,
        tf,
        year,
        tz: 'UTC',
        fields: ['t', 'o', 'h', 'l', 'c'],
        note: 't = timestamp UTC en segundos; D y H1 agrupados con cierre de NY a las 17:00 America/New_York',
        data,
      });
    }
  }
  const index: PairIndex = { pair, tz: HISTDATA_TZ, months: [...new Set(months)].sort(), years: [...years].sort() };
  writeJson(join(pairOut, 'index.json'), index);
  return index;
}

const pairs: string[] = [];
if (existsSync(RAW)) {
  for (const name of readdirSync(RAW).sort()) {
    if (!statSync(join(RAW, name)).isDirectory()) continue;
    if (convertPair(name)) pairs.push(name.toUpperCase());
  }
}
writeJson(join(OUT, 'pairs.json'), { pairs });

rmSync(PUBLIC, { recursive: true, force: true });
mkdirSync(PUBLIC, { recursive: true });
cpSync(OUT, PUBLIC, { recursive: true });
console.log(pairs.length ? `Pares convertidos: ${pairs.join(', ')}` : 'No hay CSV en data/raw/: se genera un índice vacío.');
