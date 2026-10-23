import { Match } from './sim/match';
import { PHYSICS_DT, type ModeConfig } from './sim/modes';
import type { RefEvent, RulesConfig } from './sim/referee';
import type { ControlFrame, RobotSpec } from './sim/types';
import type { Controller } from './control/controller';
import { KeyboardController, KEYMAPS, KeyboardState } from './control/keyboard';
import { SparringBot, type BotLevel } from './control/sparringBot';
import type { ArenaView } from './render/arenaView';
import { CAMERA_LABELS } from './render/arenaView';
import type { Hud } from './ui/hud';
import type { Sfx } from './audio';

export type Opponent = 'p2' | `bot-${BotLevel}`;

export interface GameOptions {
  specs: [RobotSpec, RobotSpec];
  mode: ModeConfig;
  opponent: Opponent;
  rules: Partial<RulesConfig>;
  replay: boolean;
  debug: boolean;
}

const TEAM = ['Vermelho', 'Azul'];
const MAX_STEPS_PER_FRAME = 96;
const REPLAY_SPEED = 0.3;

/**
 * Laço do jogo: tempo real -> ticks fixos de física (com escala de tempo do modo),
 * controladores -> Match, eventos -> HUD/áudio, replay em câmera lenta.
 */
export class Game {
  match!: Match;
  private controllers!: [Controller, Controller];
  private acc = 0;
  paused = false;
  private replayT = -1;
  private replayStartDelay = -1;
  onEnd: (winner: number | null, reason: string) => void = () => {};
  private pendingEnd: { winner: number | null; reason: string; delay: number } | null = null;

  constructor(
    private view: ArenaView,
    private hud: Hud,
    private sfx: Sfx,
    private keys: KeyboardState,
    readonly opts: GameOptions,
  ) {}

  async start() {
    const o = this.opts;
    this.match = await Match.create({ specs: o.specs, mode: o.mode, rules: o.rules });
    const p1 = new KeyboardController(this.keys, KEYMAPS[0], o.mode, 'Jogador 1');
    const p2: Controller =
      o.opponent === 'p2' ? new KeyboardController(this.keys, KEYMAPS[1], o.mode, 'Jogador 2') : new SparringBot(o.opponent.slice(4) as BotLevel);
    this.controllers = [p1, p2];
    this.view.setRobots(o.specs);
    this.view.setOrbit(false);
    this.view.setDebug(o.debug);
    this.view.showPlacementZones(true);
    this.view.applySnapshot(this.match.lastSnapshot);
    this.view.snapCamera();
    this.hud.setup(o.specs, [p1.label, p2.label]);
    this.hud.setDebug(o.debug);
    this.hud.show();
    this.keys.clearPressed();
    this.updateHelp();
    this.hud.flash('SHIKIRI', `Round 1 · ${o.mode.label}`, null, 1.6);
  }

  private updateHelp() {
    const bot = this.opts.opponent !== 'p2';
    const placing = this.match.ref.s.phase === 'placement';
    const p1 = placing
      ? '<b>Vermelho</b> W/S mover · A/D girar · Q/E deslizar · <kbd>Espaço</kbd> pronto'
      : '<b>Vermelho</b> W/A/S/D · Shift ajuste fino';
    const p2 = bot
      ? '<b>Azul</b> bot'
      : placing
        ? '<b>Azul</b> ↑/↓ mover · ←/→ girar · , . deslizar · <kbd>Enter</kbd> pronto'
        : '<b>Azul</b> setas · Shift dir. ajuste fino';
    this.hud.setHelp(`${p1}<span class="sep"></span>${p2}<span class="sep"></span><kbd>C</kbd> câmera (${CAMERA_LABELS[this.view.cameraMode]}) · <kbd>F2</kbd> debug · <kbd>Esc</kbd> pausa`);
  }

  setDebug(on: boolean) {
    this.opts.debug = on;
    this.view.setDebug(on);
    this.hud.setDebug(on);
  }

  /** Chamado a cada quadro com o tempo real decorrido */
  frame(realDt: number) {
    const m = this.match;
    if (!m) return;
    if (this.keys.consume('KeyC')) {
      this.view.cycleCamera();
      this.updateHelp();
    }
    if (this.keys.consume('F2')) this.setDebug(!this.opts.debug);

    if (!this.paused) {
      if (this.replayT >= 0) this.stepReplay(realDt);
      else if (this.replayStartDelay >= 0) {
        this.replayStartDelay -= realDt;
        this.simulate(realDt * 0.25); // desacelera enquanto o replay "engata"
        if (this.replayStartDelay < 0) this.beginReplay();
      } else this.simulate(realDt);
    }

    if (this.pendingEnd && !this.replaying && !this.paused) {
      this.pendingEnd.delay -= realDt;
      if (this.pendingEnd.delay <= 0) {
        const { winner, reason } = this.pendingEnd;
        this.pendingEnd = null;
        this.onEnd(winner, reason);
      }
    }

    const s = m.lastSnapshot;
    const [a, b] = s.robots;
    if (this.replayT < 0) this.view.applySnapshot(s);
    this.view.updateCamera(realDt, { x: (a.position.x + b.position.x) / 2, z: (a.position.z + b.position.z) / 2 });
    this.hud.update(realDt, m.ref, s, this.opts.specs, this.replayT >= 0);
  }

  private simulate(realDt: number) {
    const m = this.match;
    this.acc += Math.min(realDt, 0.1) * this.opts.mode.timeScale;
    let n = 0;
    while (this.acc >= PHYSICS_DT && n < MAX_STEPS_PER_FRAME) {
      this.acc -= PHYSICS_DT;
      n++;
      const frames = this.controllers.map((c, i) =>
        c.poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] }),
      ) as [ControlFrame, ControlFrame];
      const events = m.step(frames);
      if (events.length) this.handleEvents(events);
      if (this.replayStartDelay >= 0) break;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0; // máquina lenta: não acumula atraso
  }

  private handleEvents(events: RefEvent[]) {
    const s = this.match.ref.s;
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          this.view.showPlacementZones(e.phase === 'placement');
          if (e.phase === 'placement') {
            this.keys.clearPressed();
            this.updateHelp();
          }
          if (e.phase === 'countdown') {
            this.updateHelp();
            this.sfx.tick();
            setTimeout(() => this.match.ref.s.phase === 'countdown' && this.sfx.tick(), 1000 / this.opts.mode.timeScale);
            setTimeout(() => this.match.ref.s.phase === 'countdown' && this.sfx.tick(), 2000 / this.opts.mode.timeScale);
          }
          break;
        case 'bip':
          this.sfx.start();
          this.hud.flash('NOKOTTA!', 'Hakke yoi, nokotta!', null, 0.9);
          break;
        case 'roundStart':
          break;
        case 'yuko': {
          this.sfx.yuko();
          const both = e.to.length === 2;
          const team = both ? null : e.to[0];
          const sub = s.lastResult;
          const big = e.reason === 'yusei' ? 'YUSEI' : e.reason === 'shinitai' ? 'SHINITAI' : e.reason.startsWith('hansoku') ? 'HANSOKU' : 'YUKO!';
          this.hud.flash(big, sub, team, 2.6);
          const physicalPoint = e.reason === 'yuko' || e.reason === 'iniciativa';
          if (this.opts.replay && physicalPoint && this.match.replay.length > 20) this.replayStartDelay = 0.6;
          break;
        }
        case 'torinaoshi':
          this.sfx.torinaoshi();
          this.hud.flash('TORINAOSHI', e.reason, null, 2.2);
          break;
        case 'keikoku':
          this.sfx.keikoku();
          this.hud.toast(`Keikoku — ${TEAM[e.to]}: ${e.reason}`, e.to);
          break;
        case 'falseStart':
          this.hud.flash('QUEIMOU!', `${TEAM[e.who]} mexeu antes do bip`, e.who, 1.8);
          break;
        case 'timeUp':
          this.hud.flash('TEMPO', 'Round sem ponto', null, 1.8);
          break;
        case 'extension':
          this.hud.toast('Empate — prorrogação de 3 min, morte súbita');
          break;
        case 'matchEnd':
          // a tela de resultado espera o replay e a mensagem do último ponto
          this.pendingEnd = { winner: e.winner, reason: e.reason, delay: 1.8 };
          break;
      }
    }
  }

  private beginReplay() {
    this.replayStartDelay = -1;
    this.replayT = 0;
    this.keys.clearPressed();
  }

  get replaying() {
    return this.replayT >= 0 || this.replayStartDelay >= 0;
  }

  private stepReplay(realDt: number) {
    const frames = this.match.replay;
    if (!frames.length) return this.endReplay();
    const t0 = frames[0].t;
    const t1 = frames[frames.length - 1].t;
    const start = Math.max(t0, t1 - 2.6);
    this.replayT += realDt * REPLAY_SPEED;
    const t = start + this.replayT;
    if (t >= t1 || this.keys.down.size > 0 && this.replayT > 0.15) return this.endReplay();
    // busca binária do quadro
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    this.view.applyReplay(frames[lo]);
  }

  private endReplay() {
    this.replayT = -1;
    this.view.setDebug(this.opts.debug);
    this.keys.clearPressed();
  }

  dispose() {
    this.match?.dispose();
    this.controllers?.forEach((c) => c.dispose?.());
  }
}
