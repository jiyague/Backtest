import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type MouseEventParams,
  type Time,
  LineStyle,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../types';
import { formatDayMonth, formatFull, formatMonth, formatTime, formatYear } from '../timeframes/format';

/** Tema claro (la estructura queda preparada para añadir otros). */
const THEME = {
  background: '#FFFFFF',
  text: '#131722',
  grid: '#F0F3FA',
  border: '#D1D4DC',
  crosshair: '#758696',
  crosshairLabel: '#131722',
  select: '#2962FF',
  up: '#089981',
  down: '#F23645',
} as const;

const tickMarkFormatter = (t: Time, type: number): string => {
  const s = t as number;
  switch (type) {
    case 0: return formatYear(s);
    case 1: return formatMonth(s);
    case 2: return formatDayMonth(s);
    default: return formatTime(s);
  }
};

const toBar = (c: Candle) => ({ time: c[0] as UTCTimestamp, open: c[1], high: c[2], low: c[3], close: c[4] });

/** Envuelve Lightweight Charts. Todo el tiempo es UTC y se muestra en la zona activa (por defecto America/New_York). */
export class ChartView {
  readonly chart: IChartApi;
  readonly series: ISeriesApi<'Candlestick'>;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: THEME.background }, textColor: THEME.text },
      grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.crosshair, labelBackgroundColor: THEME.crosshairLabel },
        horzLine: { color: THEME.crosshair, labelBackgroundColor: THEME.crosshairLabel },
      },
      rightPriceScale: { borderColor: THEME.border },
      localization: { timeFormatter: (t: Time) => formatFull(t as number) },
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter,
      },
    });
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: THEME.up,
      downColor: THEME.down,
      borderUpColor: THEME.up,
      borderDownColor: THEME.down,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
    });
  }

  /** Fuerza el redibujado de las etiquetas de tiempo (p. ej. tras cambiar de zona horaria). */
  refreshTimeLabels(): void {
    this.chart.applyOptions({
      localization: { timeFormatter: (t: Time) => formatFull(t as number) },
      timeScale: { tickMarkFormatter },
    });
  }

  /** Modo selección de barra: cursor de cruz y línea vertical resaltada sobre la vela bajo el ratón. */
  setSelecting(on: boolean): void {
    this.container.style.cursor = on ? 'crosshair' : '';
    this.chart.applyOptions({
      crosshair: {
        vertLine: on
          ? { color: THEME.select, width: 2, style: LineStyle.Solid, labelBackgroundColor: THEME.select }
          : { color: THEME.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: THEME.crosshairLabel },
      },
    });
  }

  onCrosshairMove(cb: (utc: number | null) => void): void {
    this.chart.subscribeCrosshairMove((p: MouseEventParams<Time>) => cb(p.time === undefined ? null : (p.time as number)));
  }

  setData(candles: readonly Candle[]): void {
    this.series.setData(candles.map(toBar));
  }

  update(c: Candle): void {
    this.series.update(toBar(c));
  }

  getLogicalRange(): { from: number; to: number } | null {
    return this.chart.timeScale().getVisibleLogicalRange();
  }

  setLogicalRange(r: { from: number; to: number }): void {
    this.chart.timeScale().setVisibleLogicalRange({ from: r.from as Logical, to: r.to as Logical });
  }

  onLogicalRangeChange(cb: (r: { from: number; to: number } | null) => void): void {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
  }

  onClick(cb: (utc: number | null) => void): void {
    this.chart.subscribeClick((p: MouseEventParams<Time>) => cb(p.time === undefined ? null : (p.time as number)));
  }
}
