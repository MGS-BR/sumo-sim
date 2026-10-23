import type { Controller, ControlContext } from './controller';
import type { ControlFrame } from '../sim/types';
import type { ModeConfig } from '../sim/modes';
import { clamp } from '../sim/math';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  /** segurar = velocidade reduzida (ajuste fino) */
  precision: string[];
  /** posicionamento: deslizar de lado */
  slideLeft: string[];
  slideRight: string[];
  ready: string[];
}

export const KEYMAPS: [KeyMap, KeyMap] = [
  {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    precision: ['ShiftLeft'],
    slideLeft: ['KeyQ'],
    slideRight: ['KeyE'],
    ready: ['Space'],
  },
  {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    precision: ['ShiftRight', 'Slash'],
    slideLeft: ['Comma', 'Delete'],
    slideRight: ['Period', 'PageDown'],
    ready: ['Enter', 'NumpadEnter'],
  },
];

export const KEY_LABELS: Record<string, string> = {
  KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', Space: 'Espaço', ShiftLeft: 'Shift esq.',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftRight: 'Shift dir.', Slash: ';',
  Comma: ',', Period: '.', Delete: 'Delete', PageDown: 'PgDn', Enter: 'Enter', NumpadEnter: 'Enter',
};

const GAME_CODES = new Set(KEYMAPS.flatMap((m) => Object.values(m).flat()));

/** Estado global de teclas (um listener para os dois jogadores) */
export class KeyboardState {
  readonly down = new Set<string>();
  private pressed = new Set<string>();
  private onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (typing) return;
    // setas/espaço não devem rolar a página durante o jogo
    if (GAME_CODES.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressed.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();

  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }
  any(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  /** true uma única vez por pressionamento */
  consume(codes: string | string[]): boolean {
    let had = false;
    for (const c of typeof codes === 'string' ? [codes] : codes) {
      if (this.pressed.has(c)) had = true;
      this.pressed.delete(c);
    }
    return had;
  }
  clearPressed() {
    this.pressed.clear();
  }
  dispose() {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}

/**
 * Teclado é liga/desliga; motor real é PWM. A rampa de entrada simula o dedo
 * no gatilho do rádio: segurar a tecla acelera até 100% em ~1/rampRate s.
 */
export class KeyboardController implements Controller {
  readonly kind = 'keyboard' as const;
  readonly label: string;
  private throttle = 0;
  private turn = 0;

  constructor(
    private keys: KeyboardState,
    private map: KeyMap,
    private mode: ModeConfig,
    label: string,
  ) {
    this.label = label;
  }

  poll(ctx: ControlContext): ControlFrame {
    const k = this.keys;
    const m = this.map;
    const ty = (k.any(m.up) ? 1 : 0) - (k.any(m.down) ? 1 : 0);
    const tt = (k.any(m.left) ? 1 : 0) - (k.any(m.right) ? 1 : 0);
    const fine = k.any(m.precision);
    const frame: ControlFrame = { drive: { left: 0, right: 0 }, place: { forward: 0, side: 0, yaw: 0 }, ready: false };

    if (ctx.phase === 'placement') {
      const v = fine ? 0.02 : 0.08; // m/s
      frame.place.forward = ty * v;
      frame.place.side = ((k.any(m.slideRight) ? 1 : 0) - (k.any(m.slideLeft) ? 1 : 0)) * v;
      frame.place.yaw = tt * (fine ? 0.4 : 1.6);
      frame.ready = this.keys.consume(m.ready);
      this.throttle = 0;
      this.turn = 0;
      return frame;
    }

    const rate = this.mode.inputRampRate * ctx.dt;
    const approach = (cur: number, target: number) =>
      // soltar a tecla zera mais rápido do que acelera (como soltar o gatilho)
      target === 0 ? (Math.abs(cur) <= rate * 3 ? 0 : cur - Math.sign(cur) * rate * 3) : clamp(cur + clamp(target - cur, -rate, rate), -1, 1);
    this.throttle = approach(this.throttle, ty);
    this.turn = approach(this.turn, tt);
    const scale = fine ? 0.4 : 1;
    const th = this.throttle * scale;
    const tu = this.turn * scale * (th === 0 ? 1 : this.mode.turnGain);
    let left = th - tu;
    let right = th + tu;
    const mx = Math.max(1, Math.abs(left), Math.abs(right));
    left /= mx;
    right /= mx;
    frame.drive = { left, right };
    return frame;
  }
}
