/**
 * Juiz automático — Regulamento RoboCore Sumô de Robôs v3.1 (Mini Sumô 500g).
 *
 * É uma máquina de estados pura: recebe "fatos" do tick (quem toca fora, quem está parado,
 * se há contato...) e decide pontos e fases. Não conhece a física nem o render, então é
 * testável isoladamente e roda igual no cliente e num futuro servidor.
 *
 * Interpretações documentadas em docs/REQUISITOS.md (seção "Juiz").
 */

export type Phase = 'placement' | 'countdown' | 'fight' | 'deciding' | 'point' | 'over';

export interface RulesConfig {
  /** Art. 8: 3 rounds de 1 min */
  roundTime: number;
  rounds: number;
  pointsToWin: number;
  /** Art. 8: prorrogação de 3 min, morte súbita */
  extensionTime: number;
  /** Contagem do juiz ("conta até 3") */
  countSeconds: number;
  /** Art. 16: energização + configuração da estratégia: 30 s */
  placementTime: number;
  countdownTime: number;
  /** Mostra o resultado do round por este tempo (s de simulação) antes do próximo */
  pointDisplayTime: number;
  /** Motores ativos na contagem: mexer antes do bip = Keikoku */
  falseStartRule: boolean;
  /** Art. 17: ambos se movendo sem contato por 3 s = Hansoku para os dois */
  noCombatRule: boolean;
  /** Saídas com diferença menor que isto = simultâneas (Torinaoshi) */
  simultaneousWindow: number;
  /** Quanto tempo esperar pela saída do outro robô antes de decidir */
  decisionWindow: number;
  /** Art. 13: o atacante que empurrou o rival para fora ganha mesmo tocando fora primeiro */
  initiativeWindow: number;
  /** Diferença relativa mínima para decidir por Yusei sem prorrogação */
  yuseiMargin: number;
  /** Limiares de "parado" */
  idleSpeed: number;
  idleAngSpeed: number;
  falseStartDistance: number;
  falseStartAngle: number;
}

export const DEFAULT_RULES: RulesConfig = {
  roundTime: 60,
  rounds: 3,
  pointsToWin: 2,
  extensionTime: 180,
  countSeconds: 3,
  placementTime: 30,
  countdownTime: 3,
  pointDisplayTime: 2.5,
  falseStartRule: true,
  noCombatRule: true,
  simultaneousWindow: 0.05,
  decisionWindow: 0.5,
  initiativeWindow: 0.5,
  yuseiMargin: 0.15,
  idleSpeed: 0.008,
  idleAngSpeed: 0.15,
  falseStartDistance: 0.004,
  falseStartAngle: 0.05,
};

export interface RobotFact {
  touchingOutside: boolean;
  /** Rodas sem dohyo embaixo (para Shinitai) */
  hangingWheels: number;
  /** m/s, medido pela variação de pose (não pela velocidade do solver) */
  speed: number;
  angSpeed: number;
  /** Deslocamento e giro desde a pose de posicionamento (queimar largada) */
  movedFromStart: number;
  turnedFromStart: number;
  /** Em contato e avançando sobre o oponente */
  pushing: boolean;
  /** Distância ao centro do dohyo (m) */
  radius: number;
  ready: boolean;
}

export interface RefFacts {
  dt: number;
  robots: [RobotFact, RobotFact];
  inContact: boolean;
  /** Variação da distância entre os robôs (m/s; negativo = aproximando) */
  distanceRate: number;
}

export type PointReason =
  | 'yuko' // empurrou para fora / oponente tocou fora
  | 'iniciativa' // Art. 13: atacante saiu primeiro mas conduziu o rival para fora
  | 'shinitai'
  | 'hansoku-parado'
  | 'hansoku-sem-combate'
  | 'keikoku'
  | 'yusei';

export type RefEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'roundStart'; round: number; extension: boolean }
  | { type: 'bip' }
  | { type: 'yuko'; to: number[]; reason: PointReason }
  | { type: 'torinaoshi'; reason: string }
  | { type: 'keikoku'; to: number; reason: string }
  | { type: 'falseStart'; who: number }
  | { type: 'timeUp' }
  | { type: 'extension' }
  | { type: 'matchEnd'; winner: number | null; reason: string };

export type CountKind = 'shinitai' | 'parado' | 'travados' | 'sem-combate';

export interface RefereeState {
  phase: Phase;
  phaseTime: number;
  round: number;
  extension: boolean;
  /** Tempo de round decorrido */
  clock: number;
  scores: [number, number];
  keikoku: [number, number];
  yusei: [number, number];
  ready: [boolean, boolean];
  /** Contagem ativa mais avançada, para o HUD */
  count: { kind: CountKind; who: number | null; value: number } | null;
  lastResult: string;
  winner: number | null;
  endReason: string;
}

export class Referee {
  readonly rules: RulesConfig;
  readonly s: RefereeState;
  private events: RefEvent[] = [];
  private firstOut: { who: number; t: number } | null = null;
  private secondOutT: number | null = null;
  private lastPush: [number, number] = [-1e9, -1e9];
  private counters = { shinitai: [0, 0], parado: [0, 0], travados: 0, semCombate: 0 };
  /** tempo absoluto de simulação desde o início do round */
  private t = 0;

  constructor(rules: Partial<RulesConfig> = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.s = {
      phase: 'placement',
      phaseTime: 0,
      round: 1,
      extension: false,
      clock: 0,
      scores: [0, 0],
      keikoku: [0, 0],
      yusei: [0, 0],
      ready: [false, false],
      count: null,
      lastResult: '',
      winner: null,
      endReason: '',
    };
  }

  get roundDuration() {
    return this.s.extension ? this.rules.extensionTime : this.rules.roundTime;
  }
  get timeLeft() {
    return Math.max(0, this.roundDuration - this.s.clock);
  }
  /** Motores podem ser acionados nesta fase? */
  get motorsLive() {
    const p = this.s.phase;
    return p === 'fight' || p === 'deciding' || (p === 'countdown' && this.rules.falseStartRule);
  }

  private emit(e: RefEvent) {
    this.events.push(e);
  }

  private setPhase(p: Phase) {
    this.s.phase = p;
    this.s.phaseTime = 0;
    this.emit({ type: 'phase', phase: p });
  }

  private resetCounters() {
    this.counters = { shinitai: [0, 0], parado: [0, 0], travados: 0, semCombate: 0 };
    this.firstOut = null;
    this.secondOutT = null;
    this.lastPush = [-1e9, -1e9];
    this.s.count = null;
  }

  /** Avança o juiz. Retorna os eventos gerados neste tick. */
  update(f: RefFacts): RefEvent[] {
    this.events = [];
    const s = this.s;
    s.phaseTime += f.dt;
    switch (s.phase) {
      case 'placement':
        this.updatePlacement(f);
        break;
      case 'countdown':
        this.updateCountdown(f);
        break;
      case 'fight':
      case 'deciding':
        this.updateFight(f);
        break;
      case 'point':
        if (s.phaseTime >= this.rules.pointDisplayTime) this.nextRound();
        break;
      case 'over':
        break;
    }
    return this.events;
  }

  private updatePlacement(f: RefFacts) {
    const s = this.s;
    s.ready = [f.robots[0].ready, f.robots[1].ready];
    if (s.ready[0] && s.ready[1]) {
      this.startCountdown();
      return;
    }
    if (s.phaseTime >= this.rules.placementTime) {
      // Art. 16: atraso acima de 30 s = Keikoku para quem não ficou pronto
      for (const i of [0, 1]) if (!s.ready[i]) this.keikoku(i, 'atraso no posicionamento (> 30 s)');
      if (s.phase === 'placement') this.startCountdown();
    }
  }

  private startCountdown() {
    this.resetCounters();
    this.setPhase('countdown');
  }

  private updateCountdown(f: RefFacts) {
    const s = this.s;
    if (this.rules.falseStartRule) {
      for (const i of [0, 1]) {
        const r = f.robots[i];
        if (r.movedFromStart > this.rules.falseStartDistance || r.turnedFromStart > this.rules.falseStartAngle) {
          this.emit({ type: 'falseStart', who: i });
          this.keikoku(i, 'movimento antes do início do round');
          if (s.phase === 'countdown') {
            s.ready = [false, false];
            this.setPhase('placement');
          }
          return;
        }
      }
    }
    if (s.phaseTime >= this.rules.countdownTime) {
      this.t = 0;
      s.clock = 0;
      this.emit({ type: 'bip' });
      this.emit({ type: 'roundStart', round: s.round, extension: s.extension });
      this.setPhase('fight');
    }
  }

  private updateFight(f: RefFacts) {
    const s = this.s;
    const R = this.rules;
    this.t += f.dt;
    s.clock += f.dt;
    const [a, b] = f.robots;

    for (const i of [0, 1]) if (f.robots[i].pushing) this.lastPush[i] = this.t;

    // --- Saída do dohyo (Yuko) ---
    const outNow = [a.touchingOutside, b.touchingOutside];
    if (!this.firstOut) {
      if (outNow[0] && outNow[1]) {
        this.torinaoshi('os dois robôs tocaram fora ao mesmo tempo');
        return;
      }
      for (const i of [0, 1]) {
        if (outNow[i]) {
          this.firstOut = { who: i, t: this.t };
          this.setPhase('deciding');
        }
      }
    } else {
      const other = 1 - this.firstOut.who;
      if (outNow[other] && this.secondOutT === null) this.secondOutT = this.t;
      if (this.secondOutT !== null || this.t - this.firstOut.t >= R.decisionWindow) {
        this.resolveOut();
        return;
      }
      return; // durante a janela de decisão, nada mais conta
    }

    if (s.phase === 'fight') {
      // --- Contagens do juiz ---
      const cnt = this.counters;
      for (const i of [0, 1]) {
        const r = f.robots[i];
        cnt.shinitai[i] = r.hangingWheels > 0 && !r.touchingOutside ? cnt.shinitai[i] + f.dt : 0;
        const idle = r.speed < R.idleSpeed && r.angSpeed < R.idleAngSpeed;
        cnt.parado[i] = idle && !f.inContact ? cnt.parado[i] + f.dt : 0;
      }
      const bothIdle = a.speed < R.idleSpeed * 1.5 && b.speed < R.idleSpeed * 1.5;
      cnt.travados = f.inContact && bothIdle ? cnt.travados + f.dt : 0;
      const bothMoving =
        (a.speed >= R.idleSpeed || a.angSpeed >= R.idleAngSpeed) && (b.speed >= R.idleSpeed || b.angSpeed >= R.idleAngSpeed);
      if (f.inContact) cnt.semCombate = 0;
      else if (R.noCombatRule && bothMoving && f.distanceRate > -0.03) cnt.semCombate += f.dt;

      // Art. 17: robô parado prevalece sobre Art. 12 e 14
      const T = R.countSeconds;
      const idleOut = [cnt.parado[0] >= T, cnt.parado[1] >= T];
      if (idleOut[0] || idleOut[1]) {
        const to = [0, 1].filter((i) => idleOut[1 - i]);
        this.award(to, 'hansoku-parado');
        return;
      }
      if (cnt.travados >= T) {
        this.torinaoshi('robôs travados em contato');
        return;
      }
      for (const i of [0, 1]) {
        if (cnt.shinitai[i] >= T) {
          this.award([1 - i], 'shinitai');
          return;
        }
      }
      if (cnt.semCombate >= T) {
        this.award([0, 1], 'hansoku-sem-combate');
        return;
      }

      // Yusei (Art. 15): acumula iniciativa ao longo da luta
      for (const i of [0, 1]) {
        const r = f.robots[i];
        s.yusei[i] += f.dt * ((r.pushing ? 1 : 0) + 0.15 * Math.max(0, 1 - r.radius / 0.385));
      }

      // Contagem visível mais avançada
      let best: RefereeState['count'] = null;
      const consider = (kind: CountKind, who: number | null, v: number) => {
        if (v > 0.25 && (!best || v > best.value)) best = { kind, who, value: v };
      };
      consider('shinitai', 0, cnt.shinitai[0]);
      consider('shinitai', 1, cnt.shinitai[1]);
      consider('parado', 0, cnt.parado[0]);
      consider('parado', 1, cnt.parado[1]);
      consider('travados', null, cnt.travados);
      consider('sem-combate', null, cnt.semCombate);
      s.count = best;

      if (s.clock >= this.roundDuration) {
        this.emit({ type: 'timeUp' });
        this.endRound('Tempo esgotado — round sem ponto', false);
      }
    }
  }

  private resolveOut() {
    const R = this.rules;
    const first = this.firstOut!;
    const other = 1 - first.who;
    if (this.secondOutT !== null) {
      const gap = this.secondOutT - first.t;
      if (gap <= R.simultaneousWindow) {
        this.torinaoshi('os dois robôs tocaram fora ao mesmo tempo');
        return;
      }
      // Art. 13: quem tinha a iniciativa e conduziu o rival para fora fica com o ponto
      const hadInitiative = first.t - this.lastPush[first.who] <= R.initiativeWindow;
      const victimPassive = first.t - this.lastPush[other] > R.initiativeWindow;
      if (hadInitiative && victimPassive) {
        this.award([first.who], 'iniciativa');
        return;
      }
    }
    this.award([other], 'yuko');
  }

  private keikoku(i: number, reason: string) {
    const s = this.s;
    s.keikoku[i]++;
    this.emit({ type: 'keikoku', to: i, reason });
    // Art. 16: dois Keikoku = um Yuko para o oponente
    if (s.keikoku[i] % 2 === 0) this.award([1 - i], 'keikoku');
  }

  private award(to: number[], reason: PointReason) {
    const s = this.s;
    for (const i of to) s.scores[i]++;
    this.emit({ type: 'yuko', to, reason });
    const names = ['Vermelho', 'Azul'];
    const label: Record<PointReason, string> = {
      yuko: 'Yuko',
      iniciativa: 'Yuko (iniciativa do ataque)',
      shinitai: 'Yuko por Shinitai',
      'hansoku-parado': 'Hansoku — robô parado',
      'hansoku-sem-combate': 'Hansoku — sem combate',
      keikoku: 'Yuko por 2 Keikoku',
      yusei: 'Yuko por Yusei',
    };
    const who = to.length === 2 ? 'ambos' : names[to[0]];
    this.endRound(`${label[reason]} — ${who}`, false);
  }

  private torinaoshi(reason: string) {
    this.emit({ type: 'torinaoshi', reason });
    this.endRound(`Torinaoshi — ${reason}`, true);
  }

  private pendingRepeat = false;

  private endRound(msg: string, repeat: boolean) {
    this.s.lastResult = msg;
    this.s.count = null;
    this.pendingRepeat = repeat;
    // Fim imediato se alguém já atingiu os pontos
    if (this.checkWinnerByPoints()) return;
    this.setPhase('point');
  }

  private checkWinnerByPoints(): boolean {
    const s = this.s;
    const [p0, p1] = s.scores;
    if (s.extension && (p0 !== p1)) {
      this.finish(p0 > p1 ? 0 : 1, 'ponto na prorrogação');
      return true;
    }
    if (Math.max(p0, p1) >= this.rules.pointsToWin) {
      if (p0 !== p1) {
        this.finish(p0 > p1 ? 0 : 1, `${Math.max(p0, p1)} pontos Yuko`);
        return true;
      }
      // empate em 2x2 (Hansoku simultâneo): decide como fim de tempo
    }
    return false;
  }

  private nextRound() {
    const s = this.s;
    if (this.pendingRepeat) {
      this.pendingRepeat = false;
      this.toPlacement();
      return;
    }
    if (s.extension) {
      // prorrogação terminou sem ponto: decisão dos juízes (hantei) pela iniciativa acumulada
      const [y0, y1] = s.yusei;
      if (y0 === y1) this.finish(null, 'empate (hikiwake)');
      else this.finish(y0 > y1 ? 0 : 1, 'decisão dos juízes ao fim da prorrogação');
      return;
    }
    const tied2 = s.scores[0] === s.scores[1] && s.scores[0] >= this.rules.pointsToWin;
    s.round++;
    if (s.round <= this.rules.rounds && !tied2) {
      this.toPlacement();
      return;
    }
    // Fim do tempo regulamentar
    const [p0, p1] = s.scores;
    if (p0 !== p1) {
      this.finish(p0 > p1 ? 0 : 1, 'mais pontos Yuko ao fim do tempo');
      return;
    }
    // Art. 8 / 15: Yusei
    const [y0, y1] = s.yusei;
    const total = y0 + y1;
    if (total > 0.5 && Math.abs(y0 - y1) / total > this.rules.yuseiMargin) {
      const w = y0 > y1 ? 0 : 1;
      s.scores[w]++;
      this.emit({ type: 'yuko', to: [w], reason: 'yusei' });
      this.finish(w, 'Yusei — robô predominante');
      return;
    }
    // Prorrogação de 3 min, morte súbita
    s.extension = true;
    this.emit({ type: 'extension' });
    this.toPlacement();
  }

  private toPlacement() {
    this.s.ready = [false, false];
    this.s.clock = 0;
    this.resetCounters();
    this.setPhase('placement');
  }

  private finish(winner: number | null, reason: string) {
    const s = this.s;
    s.winner = winner;
    s.endReason = reason;
    this.emit({ type: 'matchEnd', winner, reason });
    this.setPhase('over');
  }
}
