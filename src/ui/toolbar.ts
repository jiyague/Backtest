import { TIMEFRAMES, type Timeframe } from '../types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface ToolbarHandlers {
  onPair(pair: string): void;
  onTimeframe(tf: Timeframe): void;
  onReplayStart(): void;
  onReplayStop(): void;
  onPlayPause(): void;
  onStep(): void;
  onStepBack(): void;
}

/** Barra superior: par, timeframes y controles del replay. */
export class Toolbar {
  readonly pair = $<HTMLSelectElement>('pair');
  readonly start = $<HTMLInputElement>('start');
  readonly speed = $<HTMLSelectElement>('speed');
  private tfBox = $('timeframes');
  private status = $('status');
  private message = $('message');
  private replayStart = $<HTMLButtonElement>('replay-start');
  private replayStop = $<HTMLButtonElement>('replay-stop');
  private play = $<HTMLButtonElement>('play');
  private step = $<HTMLButtonElement>('step');
  private stepBack = $<HTMLButtonElement>('step-back');

  constructor(h: ToolbarHandlers) {
    for (const tf of TIMEFRAMES) {
      const b = document.createElement('button');
      b.textContent = tf;
      b.dataset.tf = tf;
      b.onclick = () => h.onTimeframe(tf);
      this.tfBox.append(b);
    }
    this.pair.onchange = () => h.onPair(this.pair.value);
    this.replayStart.onclick = h.onReplayStart;
    this.replayStop.onclick = h.onReplayStop;
    this.play.onclick = h.onPlayPause;
    this.step.onclick = h.onStep;
    this.stepBack.onclick = h.onStepBack;
  }

  setPairs(pairs: string[]): void {
    this.pair.replaceChildren(...pairs.map((p) => new Option(p, p)));
  }

  setTimeframe(tf: Timeframe): void {
    for (const b of this.tfBox.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tf === tf);
  }

  setReplayActive(active: boolean, playing = false): void {
    this.replayStart.disabled = active;
    this.start.disabled = active;
    this.replayStop.disabled = !active;
    this.play.disabled = !active;
    this.step.disabled = !active;
    this.stepBack.disabled = !active;
    this.play.textContent = playing ? '⏸' : '▶';
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showMessage(text: string | null): void {
    this.message.hidden = text === null;
    this.message.textContent = text ?? '';
  }

  disableAll(): void {
    for (const el of document.querySelectorAll<HTMLElement>('.toolbar button, .toolbar select, .toolbar input')) {
      (el as HTMLButtonElement).disabled = true;
    }
  }
}
