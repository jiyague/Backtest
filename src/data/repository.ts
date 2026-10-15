import type { Candle, PairIndex } from '../types';
import { fromMonthRow } from './parse';

type PrecalcTf = 'H1' | 'D';

/** Acceso a los JSON publicados con la web, con caché en memoria. */
export class DataRepository {
  private cache = new Map<string, Promise<unknown>>();

  constructor(private baseUrl: string = `${import.meta.env.BASE_URL}data/`) {}

  private fetchJson<T>(path: string): Promise<T> {
    let p = this.cache.get(path);
    if (!p) {
      p = fetch(this.baseUrl + path).then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${path} (${r.status})`);
        return r.json();
      });
      p.catch(() => this.cache.delete(path));
      this.cache.set(path, p);
    }
    return p as Promise<T>;
  }

  async pairs(): Promise<string[]> {
    return (await this.fetchJson<{ pairs: string[] }>('pairs.json')).pairs;
  }

  index(pair: string): Promise<PairIndex> {
    return this.fetchJson<PairIndex>(`${pair}/index.json`);
  }

  /** Velas M1 de un mes (YYYY-MM) con tiempo UTC (la hora EST fija se convierte aquí). */
  async month(pair: string, month: string): Promise<Candle[]> {
    const file = await this.fetchJson<{ data: number[][] }>(`${pair}/${month}.json`);
    return file.data.map(fromMonthRow);
  }

  /** Velas H1 o D precalculadas de un año (tiempo UTC). */
  async year(pair: string, tf: PrecalcTf, year: number): Promise<Candle[]> {
    return (await this.fetchJson<{ data: Candle[] }>(`${pair}/${tf}-${year}.json`)).data;
  }
}
