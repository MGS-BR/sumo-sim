import { Match } from './sim/match';
import { PHYSICS_DT, type ModeConfig } from './sim/modes';
import type { RefEvent, RulesConfig } from './sim/referee';
import type { ControlFrame, RobotSpec, SimSnapshot } from './sim/types';
import type { OutTouch } from './sim/match';
import type { Controller } from './control/controller';
import { KeyboardController, KEYMAPS, KeyboardState, mergedKeyMap } from './control/keyboard';
import { SparringBot, type BotLevel } from './control/sparringBot';
import { MousePlacement } from './control/mousePlacement';
import { randomSeed } from './sim/rng';
import type { ArenaView } from './render/arenaView';
import { CAMERA_LABELS } from './render/arenaView';
import { icon, kbdArrow } from './ui/icons';
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
  /** sorteia a posição dos dois robôs a cada round (jogadores e bot) */
  randomPlacement: boolean;
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
  private replayStartDelay = -1;
  onEnd: (winner: number | null, reason: string) => void = () => {};
  private pendingEnd: { winner: number | null; reason: string; delay: number } | null = null;
  private mouse: MousePlacement | null = null;

  constructor(
    private view: ArenaView,
    private hud: Hud,
    private sfx: Sfx,
    private keys: KeyboardState,
    readonly opts: GameOptions,
  ) {}

  async start() {
    const o = this.opts;
    this.match = await Match.create({
      specs: o.specs,
      mode: o.mode,
      rules: o.rules,
      randomPlacement: o.randomPlacement,
      seed: randomSeed(),
    });
    const vsBot = o.opponent !== 'p2';
    // sozinho contra o bot: WASD e setas controlam o mesmo robô
    const p1 = new KeyboardController(this.keys, vsBot ? mergedKeyMap(KEYMAPS[0], KEYMAPS[1]) : KEYMAPS[0], o.mode, 'Jogador 1');
    const p2: Controller =
      o.opponent === 'p2' ? new KeyboardController(this.keys, KEYMAPS[1], o.mode, 'Jogador 2') : new SparringBot(o.opponent.slice(4) as BotLevel);
    this.controllers = [p1, p2];
    this.mouse = new MousePlacement(this.view, {
      active: () => this.match.ref.s.phase === 'placement' && !this.paused && !this.replaying,
      canEdit: (i) => this.controllers[i].kind === 'keyboard' && !this.match.ref.s.ready[i] && !this.match.randomPlacement,
      pose: (i) => this.match.placements[i],
    });
    this.hud.onReady = (i) => this.mouse?.requestReady(i);
    this.view.setRobots(o.specs);
    this.view.setOrbit(false);
    this.view.setDebug(o.debug);
    this.view.showPlacementZones(true);
    this.view.applySnapshot(this.match.lastSnapshot);
    this.view.snapCamera();
    this.hud.drawnPlacement = this.match.randomPlacement;
    this.hud.setup(o.specs, [p1.label, p2.label], [true, p2.kind === 'keyboard']);
    this.hud.setDebug(o.debug);
    this.hud.show();
    this.keys.clearPressed();
    this.updateHelp();
    this.hud.toast(`Round 1 · modo ${o.mode.label}${o.randomPlacement ? ' · posições sorteadas' : ''}`);
  }

  private updateHelp() {
    const bot = this.opts.opponent !== 'p2';
    const placing = this.match.ref.s.phase === 'placement';
    const arrows = `${kbdArrow('up', 'cima')}${kbdArrow('left', 'esquerda')}${kbdArrow('down', 'baixo')}${kbdArrow('right', 'direita')}`;
    const wasd = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>';
    const drawn = placing && this.match.randomPlacement;
    let p1: string;
    let p2: string;
    if (drawn) {
      // posições sorteadas: não há o que ajustar, só confirmar
      p1 = bot ? `<b>Você</b> posição sorteada · <kbd>Espaço</kbd> pronto` : `<b>Vermelho</b> posição sorteada · <kbd>Espaço</kbd> pronto`;
      p2 = bot ? '<b>Azul</b> bot · posição sorteada' : `<b>Azul</b> posição sorteada · <kbd>Enter</kbd> pronto`;
    } else if (bot) {
      p1 = placing
        ? `<b>Você</b> ${wasd} ou ${arrows} posicionar · <kbd>Q</kbd><kbd>E</kbd> deslizar · <kbd>Espaço</kbd> pronto`
        : `<b>Você</b> ${wasd} ou ${arrows} · Shift ajuste fino`;
      p2 = '<b>Azul</b> bot';
    } else {
      p1 = placing
        ? `<b>Vermelho</b> ${wasd} · <kbd>Q</kbd><kbd>E</kbd> deslizar · <kbd>Espaço</kbd> pronto`
        : `<b>Vermelho</b> ${wasd} · Shift fino`;
      p2 = placing
        ? `<b>Azul</b> ${arrows} · <kbd>,</kbd><kbd>.</kbd> deslizar · <kbd>Enter</kbd> pronto`
        : `<b>Azul</b> ${arrows} · Shift dir. fino`;
    }
    const mouse = placing && !drawn ? `${icon('mouse')} arraste o robô · roda gira<span class="sep"></span>` : '';
    this.hud.setHelp(`${mouse}${p1}<span class="sep"></span>${p2}<span class="sep"></span><kbd>C</kbd> câmera (${CAMERA_LABELS[this.view.cameraMode]}) · <kbd>F2</kbd> debug · <kbd>Esc</kbd> pausa`);
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
      if (this.rp) this.stepReplay(realDt);
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
    const phase = m.ref.s.phase;
    if (!this.rp) {
      this.view.applySnapshot(s);
      // marca ao vivo onde o primeiro robô encostou fora (fica até o próximo posicionamento)
      const touch = this.firstTouch();
      // depois do replay de evidência a marca não volta (o robô já está em outro lugar)
      const live = (phase === 'deciding' || phase === 'point' || phase === 'over') && !this.evidenceReplayed;
      this.view.setEvidence(touch && live ? touch.touch.point : null);
    }
    const focus = this.rp?.focus ?? {
      x: (s.robots[0].position.x + s.robots[1].position.x) / 2,
      z: (s.robots[0].position.z + s.robots[1].position.z) / 2,
    };
    this.view.updateCamera(realDt, focus);
    this.hud.update(realDt, m.ref, s, this.opts.specs, !!this.rp);

    const audible = !this.paused && !this.rp && phase !== 'placement';
    this.sfx.updateLoops(audible ? s : null, this.opts.specs, this.replayStartDelay >= 0 ? this.opts.mode.timeScale * 0.25 : this.opts.mode.timeScale);
  }

  /** Primeiro toque fora do round atual */
  private firstTouch(): { who: number; touch: OutTouch } | null {
    const [a, b] = this.match.outTouches;
    if (a && (!b || a.t <= b.t)) return { who: 0, touch: a };
    if (b) return { who: 1, touch: b };
    return null;
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
      if (m.ref.s.phase === 'placement') this.mouse?.apply(frames);
      const events = m.step(frames);
      this.detectImpact(m.lastSnapshot);
      if (events.length) this.handleEvents(events);
      if (this.replayStartDelay >= 0) break;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0; // máquina lenta: não acumula atraso
  }

  private wasInContact = false;
  private impactCooldown = 0;
  /** Batida quando os robôs se encostam, proporcional à velocidade de aproximação */
  private detectImpact(s: SimSnapshot) {
    this.impactCooldown -= PHYSICS_DT;
    if (s.inContact && !this.wasInContact && this.impactCooldown <= 0 && this.match.ref.s.phase !== 'placement') {
      const [a, b] = s.robots;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const closing = ((a.linvel.x - b.linvel.x) * dx + (a.linvel.z - b.linvel.z) * dz) / d;
      this.sfx.impact(closing / 1.6);
      this.impactCooldown = 0.08;
    }
    this.wasInContact = s.inContact;
  }

  private handleEvents(events: RefEvent[]) {
    const s = this.match.ref.s;
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          this.view.showPlacementZones(e.phase === 'placement');
          if (e.phase !== 'placement') this.mouse?.cancel();
          if (e.phase === 'placement') {
            this.evidenceReplayed = false;
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
          this.hud.flash('NOKOTTA!', 'Hakke yoi, nokotta!', null, 1.2, true);
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
          // evidência: o toque fora de quem perdeu o ponto
          const loser = both ? null : 1 - e.to[0];
          const touch = loser !== null ? this.match.outTouches[loser] : null;
          this.evidence = physicalPoint && touch ? { who: loser!, touch } : null;
          if (this.evidence) this.hud.toast(`${TEAM[this.evidence.who]} encostou fora do dohyo`, this.evidence.who);
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

  private evidence: { who: number; touch: OutTouch } | null = null;
  private evidenceReplayed = false;
  private rp: {
    t: number;
    start: number;
    end: number;
    hold: number;
    held: boolean;
    focus: { x: number; z: number };
  } | null = null;

  private beginReplay() {
    this.replayStartDelay = -1;
    const frames = this.match.replay;
    if (!frames.length) return;
    const t0 = frames[0].t;
    const t1 = frames[frames.length - 1].t;
    const ev = this.evidence;
    // com evidência: começa antes do toque, congela no toque, termina logo depois
    const start = Math.max(t0, ev ? ev.touch.t - 1.3 : t1 - 2.6);
    const end = ev ? Math.min(t1, ev.touch.t + 0.6) : t1;
    this.rp = { t: start, start, end, hold: 0, held: false, focus: { x: 0, z: 0 } };
    this.view.setEvidence(null);
    this.keys.clearPressed();
  }

  get replaying() {
    return !!this.rp || this.replayStartDelay >= 0;
  }

  private stepReplay(realDt: number) {
    const rp = this.rp!;
    const frames = this.match.replay;
    const ev = this.evidence;
    // pula com uma tecla apertada DEPOIS do início do replay (quem segura o W não perde o lance)
    if (this.keys.anyPressed() && rp.t - rp.start > 0.05) return this.endReplay();
    if (rp.hold > 0) {
      rp.hold -= realDt;
    } else {
      const next = rp.t + realDt * REPLAY_SPEED;
      if (ev && !rp.held && next >= ev.touch.t) {
        // congela no instante do toque e destaca o ponto
        rp.t = ev.touch.t;
        rp.held = true;
        rp.hold = 1.6;
        this.view.setEvidence(ev.touch.point);
        this.sfx.click();
        this.hud.flash('TOCOU FORA', `${TEAM[ev.who]} encostou no chão fora do dohyo`, ev.who, 1.6);
      } else rp.t = next;
    }
    if (rp.t >= rp.end && rp.hold <= 0) return this.endReplay();

    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < rp.t) lo = mid + 1;
      else hi = mid;
    }
    const f = frames[lo];
    this.view.applyReplay(f);
    rp.focus = { x: (f.pos[0].x + f.pos[1].x) / 2, z: (f.pos[0].z + f.pos[1].z) / 2 };

    // câmera: acompanha a luta e, perto do toque, aproxima rente ao chão no ponto
    // depois da pausa no toque, a câmera volta a seguir a luta e a marca some
    // (o robô continua caindo; a marca parada no chão parecia estar no lugar errado)
    const afterHold = rp.held && rp.hold <= 0;
    if (ev && rp.t >= ev.touch.t - 0.35 && !afterHold) {
      const p = ev.touch.point;
      const r = Math.hypot(p.x, p.z) || 1;
      const ox = p.x / r;
      const oz = p.z / r;
      this.view.setCameraOverride({
        pos: { x: p.x + ox * 0.11 - oz * 0.06, y: 0.05, z: p.z + oz * 0.11 + ox * 0.06 },
        look: { x: p.x - ox * 0.01, y: 0.006, z: p.z - oz * 0.01 },
      });
      if (rp.t >= ev.touch.t) this.view.setEvidence(p);
    } else {
      this.view.setCameraOverride(null);
      if (afterHold) this.view.setEvidence(null);
    }
  }

  private endReplay() {
    if (this.evidence) this.evidenceReplayed = true;
    this.rp = null;
    this.view.setCameraOverride(null);
    this.view.setDebug(this.opts.debug);
    this.keys.clearPressed();
  }

  dispose() {
    this.sfx.updateLoops(null, null);
    this.view.setEvidence(null);
    this.view.setCameraOverride(null);
    this.mouse?.dispose();
    this.mouse = null;
    this.hud.onReady = () => {};
    this.match?.dispose();
    this.controllers?.forEach((c) => c.dispose?.());
  }
}
