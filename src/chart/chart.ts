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
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../types';
import { formatNYDayMonth, formatNYFull, formatNYMonth, formatNYTime, formatNYYear } from '../timeframes/format';

const toBar = (c: Candle) => ({ time: c[0] as UTCTimestamp, open: c[1], high: c[2], low: c[3], close: c[4] });

/** Envuelve Lightweight Charts. Todo el tiempo es UTC y se muestra siempre en America/New_York. */
export class ChartView {
  readonly chart: IChartApi;
  readonly series: ISeriesApi<'Candlestick'>;

  constructor(container: HTMLElement) {
    this.chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0f1218' }, textColor: '#aab2c0' },
      grid: { vertLines: { color: '#1b212b' }, horzLines: { color: '#1b212b' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a3140' },
      localization: { timeFormatter: (t: Time) => formatNYFull(t as number) },
      timeScale: {
        borderColor: '#2a3140',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: Time, type: number) => {
          const s = t as number;
          switch (type) {
            case 0: return formatNYYear(s);
            case 1: return formatNYMonth(s);
            case 2: return formatNYDayMonth(s);
            default: return formatNYTime(s);
          }
        },
      },
    });
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
    });
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
