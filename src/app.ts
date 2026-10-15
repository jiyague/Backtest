import { ChartView } from './chart/chart';
import { DataRepository } from './data/repository';
import { monthKeyOf } from './data/parse';
import { ReplayEngine } from './replay/engine';
import { aggregate, applyM1 } from './timeframes/aggregate';
import { formatNYFull, toNYInputValue } from './timeframes/format';
import { nyLocalToUtc } from './timeframes/ny';
import { Toolbar } from './ui/toolbar';
import type { Candle, PairIndex, Timeframe } from './types';

type Mode = 'browse' | 'replay';
type Source = 'm1' | 'h1' | 'd';
interface Window { lo: number; hi: number }

const LOW_TFS: Timeframe[] = ['M1', 'M3', 'M5', 'M15'];
const EDGE_BARS = 25; // distancia al borde a partir de la cual se carga más historia
const VIEW_BARS = 150;
const TICK_MS = 50;
const PRELOAD_M1 = 3000; // velas M1 restantes que disparan la carga del mes siguiente en el replay

const NO_DATA =
  'Aún no hay datos. Sube los CSV mensuales de HistData a data/raw/EURUSD/ (p. ej. DAT_NT_EURUSD_M1_202601.csv) y espera a que termine el despliegue.';

/** Último índice con valor <= key (o 0 si no hay ninguno). */
function lastLE<T>(list: T[], key: T): number {
  let r = 0;
  list.forEach((v, i) => { if (v <= key) r = i; });
  return r;
}

export class App {
  private repo = new DataRepository();
  private toolbar = new Toolbar({
    onPair: (p) => void this.loadPair(p),
    onTimeframe: (tf) => void this.setTimeframe(tf),
    onReplayStart: () => void this.startReplay(),
    onReplayStop: () => void this.stopReplay(),
    onPlayPause: () => (this.timer ? this.pause() : this.play()),
    onStep: () => { this.pause(); this.forward(); },
    onStepBack: () => void this.back(),
  });
  private view = new ChartView(document.getElementById('chart')!);
  private engine = new ReplayEngine();

  private pair = '';
  private index!: PairIndex;
  private tf: Timeframe = 'H1';
  private mode: Mode = 'browse';
  private win: Window = { lo: 0, hi: 0 }; // ventana de carga en navegación
  private rwin: Window = { lo: 0, hi: 0 }; // meses M1 cargados en el replay
  private display: Candle[] = [];
  private loading = false;
  private loadingNext = false;
  private gen = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private acc = 0;

  async init(): Promise<void> {
    this.toolbar.setTimeframe(this.tf);
    this.toolbar.setReplayActive(false);
    this.view.onLogicalRangeChange((r) => this.onRange(r));
    this.view.onClick((t) => {
      if (this.mode === 'browse' && t !== null) this.toolbar.start.value = toNYInputValue(t);
    });
    let pairs: string[] = [];
    try {
      pairs = await this.repo.pairs();
    } catch {
      /* sin índice publicado */
    }
    if (!pairs.length) return this.noData();
    this.toolbar.setPairs(pairs);
    await this.loadPair(pairs[0]);
  }

  private noData(): void {
    this.toolbar.showMessage(NO_DATA);
    this.toolbar.disableAll();
  }

  private async loadPair(pair: string): Promise<void> {
    this.stopReplay(false);
    this.pair = pair;
    this.index = await this.repo.index(pair);
    if (!this.index.months.length) return this.noData();
    this.toolbar.showMessage(null);
    const last = this.index.months[this.index.months.length - 1];
    const [y, m] = last.split('-').map(Number);
    this.toolbar.start.value = toNYInputValue(Date.UTC(y, m - 1, 1, 5) / 1000);
    await this.refresh(null);
  }

  // ---------- carga de datos ----------

  private sourceFor(): Source {
    if (LOW_TFS.includes(this.tf)) return 'm1';
    if (this.mode === 'replay' || this.tf === 'H1' || this.tf === 'H4') return 'h1';
    return 'd';
  }

  private windowFor(src: Source, focus: number | null): Window {
    if (src === 'm1') {
      const m = focus === null ? this.index.months.length - 1 : lastLE(this.index.months, monthKeyOf(focus));
      return { lo: Math.max(0, m - 1), hi: m };
    }
    if (src === 'h1') {
      const y = focus === null ? this.index.years.length - 1 : lastLE(this.index.years, new Date(focus * 1000).getUTCFullYear());
      return { lo: y, hi: y };
    }
    return { lo: 0, hi: this.index.years.length - 1 };
  }

  private async months(w: Window): Promise<Candle[]> {
    const parts = await Promise.all(this.index.months.slice(w.lo, w.hi + 1).map((m) => this.repo.month(this.pair, m)));
    const out: Candle[] = [];
    for (const p of parts) for (const c of p) out.push(c);
    return out;
  }

  private async years(tf: 'H1' | 'D', w: Window): Promise<Candle[]> {
    const parts = await Promise.all(this.index.years.slice(w.lo, w.hi + 1).map((y) => this.repo.year(this.pair, tf, y)));
    const out: Candle[] = [];
    for (const p of parts) for (const c of p) out.push(c);
    return out;
  }

  /** Serie a mostrar para el timeframe y modo actuales. En replay nunca incluye velas posteriores al instante. */
  private async buildDisplay(): Promise<Candle[]> {
    const src = this.sourceFor();
    if (this.mode === 'browse') {
      if (src === 'm1') return aggregate(await this.months(this.win), this.tf);
      const base = await this.years(src === 'h1' ? 'H1' : 'D', this.win);
      return this.tf === 'H1' || this.tf === 'D' ? base : aggregate(base, this.tf);
    }
    if (src === 'm1') return aggregate(this.engine.revealed(), this.tf);
    // timeframes >= H1: H1 precalculadas hasta la hora anterior + hora actual construida desde M1
    const t = this.engine.time;
    const hourStart = Math.floor(t / 3600) * 3600;
    const yearIdx = lastLE(this.index.years, new Date(t * 1000).getUTCFullYear());
    const history = (await this.years('H1', { lo: 0, hi: yearIdx })).filter((c) => c[0] < hourStart);
    const h1 = history.concat(aggregate(this.engine.revealedSince(hourStart), 'H1'));
    return this.tf === 'H1' ? h1 : aggregate(h1, this.tf);
  }

  private async refresh(focus: number | null): Promise<void> {
    const g = ++this.gen;
    this.loading = true;
    try {
      if (this.mode === 'browse') this.win = this.windowFor(this.sourceFor(), focus);
      const data = await this.buildDisplay();
      if (g !== this.gen) return;
      this.display = data;
      this.view.setData(data);
      this.showAround(focus);
      this.updateStatus();
    } finally {
      if (g === this.gen) this.loading = false;
    }
  }

  private showAround(focus: number | null): void {
    if (!this.display.length) return;
    let idx = this.display.length - 1;
    if (focus !== null) {
      idx = 0;
      this.display.forEach((c, i) => { if (c[0] <= focus) idx = i; });
    }
    const to = idx + 10;
    this.view.setLogicalRange({ from: to - VIEW_BARS, to });
  }

  private rightEdgeTime(): number | null {
    const r = this.view.getLogicalRange();
    if (!r || !this.display.length) return null;
    return this.display[Math.min(this.display.length - 1, Math.max(0, Math.floor(r.to)))][0];
  }

  // ---------- navegación ----------

  private async setTimeframe(tf: Timeframe): Promise<void> {
    if (tf === this.tf) return;
    const focus = this.mode === 'replay' ? this.engine.time : this.rightEdgeTime();
    this.tf = tf;
    this.toolbar.setTimeframe(tf);
    await this.refresh(focus);
  }

  private canExtend(dir: 'older' | 'newer'): boolean {
    const src = this.sourceFor();
    if (this.mode === 'replay') return dir === 'older' && src === 'm1' && this.rwin.lo > 0;
    if (src === 'd') return false;
    const n = src === 'm1' ? this.index.months.length : this.index.years.length;
    return dir === 'older' ? this.win.lo > 0 : this.win.hi < n - 1;
  }

  private onRange(r: { from: number; to: number } | null): void {
    if (!r || this.loading || !this.display.length) return;
    if (r.from < EDGE_BARS && this.canExtend('older')) void this.extend('older');
    else if (r.to > this.display.length - EDGE_BARS && this.canExtend('newer')) void this.extend('newer');
  }

  /** Carga el mes/año anterior (o siguiente) y conserva la posición visible. */
  private async extend(dir: 'older' | 'newer'): Promise<void> {
    const range = this.view.getLogicalRange();
    const oldLen = this.display.length;
    const g = ++this.gen;
    this.loading = true;
    try {
      if (this.mode === 'replay') {
        this.rwin.lo--;
        await this.loadEngineCandles();
      } else if (dir === 'older') this.win.lo--;
      else this.win.hi++;
      const data = await this.buildDisplay();
      if (g !== this.gen) return;
      this.display = data;
      this.view.setData(data);
      if (range) {
        const shift = dir === 'older' ? data.length - oldLen : 0;
        this.view.setLogicalRange({ from: range.from + shift, to: range.to + shift });
      }
    } finally {
      if (g === this.gen) this.loading = false;
    }
  }

  // ---------- replay ----------

  private async loadEngineCandles(): Promise<void> {
    const w = { ...this.rwin };
    const candles = await this.months(w);
    if (w.lo === this.rwin.lo && w.hi === this.rwin.hi) this.engine.setCandles(candles);
  }

  private async startReplay(): Promise<void> {
    const v = this.toolbar.start.value;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) return;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const startUtc = nyLocalToUtc(Date.UTC(y, mo - 1, d, h, mi) / 1000);
    const g = ++this.gen;
    this.loading = true;
    this.mode = 'replay';
    this.toolbar.setReplayActive(true);
    try {
      const n = this.index.months.length;
      const idx = lastLE(this.index.months, monthKeyOf(startUtc));
      this.rwin = { lo: Math.max(0, idx - 1), hi: Math.min(n - 1, idx + 1) };
      await this.loadEngineCandles();
      this.engine.seek(startUtc);
      const data = await this.buildDisplay();
      if (g !== this.gen) return;
      this.display = data;
      this.view.setData(data);
      this.showAround(null);
      this.updateStatus();
    } finally {
      if (g === this.gen) this.loading = false;
    }
  }

  private stopReplay(reload = true): void {
    this.pause();
    if (this.mode !== 'replay') return;
    const focus = this.engine.time;
    this.mode = 'browse';
    this.toolbar.setReplayActive(false);
    if (reload) void this.refresh(focus);
  }

  private play(): void {
    if (this.mode !== 'replay' || this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.toolbar.setReplayActive(true, true);
  }

  private pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.acc = 0;
    if (this.mode === 'replay') this.toolbar.setReplayActive(true, false);
  }

  private tick(): void {
    if (this.loading) return;
    this.acc += (Number(this.toolbar.speed.value) * TICK_MS) / 1000;
    while (this.acc >= 1 && this.timer) {
      this.acc -= 1;
      if (!this.forward()) break;
    }
  }

  /** Revela la siguiente vela M1 y actualiza (o abre) la vela en formación. */
  private forward(): boolean {
    if (this.mode !== 'replay' || this.loading) return false;
    const c = this.engine.stepForward();
    if (!c) {
      if (!this.loadingNext) this.pause(); // fin de los datos disponibles
      return false;
    }
    this.view.update(applyM1(this.display, c, this.tf).candle);
    this.updateStatus();
    if (this.engine.remaining() < PRELOAD_M1 && this.rwin.hi < this.index.months.length - 1 && !this.loadingNext) {
      this.loadingNext = true;
      this.rwin.hi++;
      this.loadEngineCandles().finally(() => (this.loadingNext = false));
    }
    return true;
  }

  private async back(): Promise<void> {
    if (this.mode !== 'replay' || this.loading) return;
    this.pause();
    if (!this.engine.stepBack()) return;
    const range = this.view.getLogicalRange();
    const g = ++this.gen;
    this.loading = true;
    try {
      const data = await this.buildDisplay();
      if (g !== this.gen) return;
      this.display = data;
      this.view.setData(data);
      if (range) this.view.setLogicalRange(range);
      this.updateStatus();
    } finally {
      if (g === this.gen) this.loading = false;
    }
  }

  private updateStatus(): void {
    this.toolbar.setStatus(
      this.mode === 'replay'
        ? `Replay · ${formatNYFull(this.engine.time)} (hora de Nueva York)`
        : 'Hora mostrada: America/New_York (EST/EDT)',
    );
  }
}
