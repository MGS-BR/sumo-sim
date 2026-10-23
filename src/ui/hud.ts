import type { Referee } from '../sim/referee';
import type { RobotSpec, SimSnapshot } from '../sim/types';
import { GRAVITY } from '../sim/arena';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const TEAM_NAMES = ['Vermelho', 'Azul'];
const COUNT_LABEL: Record<string, string> = {
  shinitai: 'Shinitai',
  parado: 'Robô parado',
  travados: 'Travados',
  'sem-combate': 'Sem combate',
};

export class Hud {
  readonly root = h('div', 'hud');
  private teams: { el: HTMLElement; robot: HTMLElement; dots: HTMLElement; kei: HTMLElement; status: HTMLElement; ready: HTMLButtonElement }[] = [];
  private humans: [boolean, boolean] = [true, true];
  /** Clique no botão "Pronto" de um lado */
  onReady: (i: number) => void = () => {};
  private round = h('div', 'hud-round');
  private time = h('div', 'hud-time');
  private big = h('div', 'hud-big');
  private sub = h('div', 'hud-sub');
  private center = h('div', 'hud-center');
  private count = h('div', 'hud-count');
  private toasts = h('div', 'hud-toasts');
  private help = h('div', 'hud-help');
  private debugEl = h('div', 'hud-debug');
  private flashUntil = 0;
  private now = 0;

  constructor(parent: HTMLElement) {
    const top = h('div', 'hud-top');
    for (let i = 0; i < 2; i++) {
      const el = h('div', `hud-team team-${i}`);
      const name = h('div', 'hud-team-name', TEAM_NAMES[i]);
      const robot = h('div', 'hud-team-robot');
      const dots = h('div', 'hud-dots');
      const kei = h('div', 'hud-kei');
      const status = h('div', 'hud-status');
      const ready = h('button', 'hud-ready', 'Pronto') as HTMLButtonElement;
      ready.type = 'button';
      ready.hidden = true;
      ready.addEventListener('click', (e) => {
        e.stopPropagation();
        ready.blur(); // Espaço/Enter não "clicam" de novo depois
        this.onReady(i);
      });
      el.append(name, robot, dots, kei, status, ready);
      this.teams.push({ el, robot, dots, kei, status, ready });
    }
    const clock = h('div', 'hud-clock');
    clock.append(this.round, this.time);
    top.append(this.teams[0].el, clock, this.teams[1].el);
    this.center.append(this.big, this.sub);
    this.root.append(top, this.center, this.count, this.toasts, this.help, this.debugEl);
    parent.appendChild(this.root);
    this.hide();
  }

  show() {
    this.root.hidden = false;
    this.root.classList.remove('dim');
  }
  /** Tela de resultado por cima: esconde mensagens centrais e ajuda */
  dim() {
    this.root.classList.add('dim');
  }
  hide() {
    this.root.hidden = true;
  }

  setup(specs: [RobotSpec, RobotSpec], labels: [string, string], humans: [boolean, boolean] = [true, true]) {
    this.humans = humans;
    for (let i = 0; i < 2; i++) this.teams[i].robot.textContent = `${specs[i].name} · ${labels[i]}`;
    this.toasts.innerHTML = '';
    this.big.textContent = '';
    this.sub.textContent = '';
    this.flashUntil = 0;
  }

  setHelp(html: string) {
    this.help.innerHTML = html;
  }

  /** Mensagem grande temporária (tempo real) */
  flash(big: string, sub = '', team: number | null = null, seconds = 2) {
    this.big.textContent = big;
    this.sub.textContent = sub;
    this.center.dataset.team = team === null ? '' : String(team);
    this.center.classList.remove('pop');
    void this.center.offsetWidth;
    this.center.classList.add('pop');
    this.flashUntil = this.now + seconds;
  }

  toast(text: string, team: number | null = null) {
    const t = h('div', 'hud-toast');
    t.textContent = text; // texto puro: nunca interpretar como HTML
    if (team !== null) t.dataset.team = String(team);
    this.toasts.prepend(t);
    setTimeout(() => t.classList.add('out'), 3500);
    setTimeout(() => t.remove(), 4200);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
  }

  update(realDt: number, ref: Referee, snap: SimSnapshot, specs: [RobotSpec, RobotSpec], replaying: boolean) {
    this.now += realDt;
    const s = ref.s;
    for (let i = 0; i < 2; i++) {
      const t = this.teams[i];
      t.dots.innerHTML = Array.from({ length: ref.rules.pointsToWin }, (_, k) => `<i class="${k < s.scores[i] ? 'on' : ''}"></i>`).join('') +
        (s.scores[i] > ref.rules.pointsToWin ? `<b>+${s.scores[i] - ref.rules.pointsToWin}</b>` : '');
      t.kei.textContent = s.keikoku[i] ? `Keikoku ×${s.keikoku[i]}` : '';
      t.status.textContent = s.phase === 'placement' ? (s.ready[i] ? 'pronto ✓' : 'posicionando…') : '';
      t.el.classList.toggle('ready', s.phase === 'placement' && s.ready[i]);
      t.ready.hidden = !(s.phase === 'placement' && !s.ready[i] && this.humans[i] && !replaying);
    }
    this.round.textContent = s.extension ? 'PRORROGAÇÃO' : `ROUND ${Math.min(s.round, ref.rules.rounds)} / ${ref.rules.rounds}`;
    const left = s.phase === 'fight' || s.phase === 'deciding' ? ref.timeLeft : ref.roundDuration;
    const mm = Math.floor(left / 60);
    const ss = Math.floor(left % 60);
    this.time.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    this.time.classList.toggle('low', left < 10 && s.phase === 'fight');

    // mensagens persistentes por fase (quando não há flash ativo)
    // no posicionamento o título fica pequeno no topo para não cobrir os robôs
    // compacto no posicionamento (não cobre os robôs) e no replay (não cobre o lance)
    this.center.classList.toggle('compact', replaying || (s.phase === 'placement' && this.now > this.flashUntil));
    if (this.now > this.flashUntil) {
      this.center.dataset.team = '';
      this.center.classList.remove('pop');
      if (replaying) {
        this.big.textContent = 'REPLAY';
        this.sub.textContent = 'câmera lenta · qualquer tecla para pular';
      } else if (s.phase === 'placement') {
        this.big.textContent = 'SHIKIRI';
        this.sub.textContent = `Posicionem os robôs atrás da linha · ${Math.max(0, Math.ceil(ref.rules.placementTime - s.phaseTime))} s`;
      } else if (s.phase === 'countdown') {
        const n = Math.ceil(ref.rules.countdownTime - s.phaseTime);
        this.big.textContent = n > 0 ? String(n) : '';
        this.sub.textContent = n === 3 ? 'Hakke yoi…' : '';
      } else if (s.phase === 'point') {
        this.big.textContent = '';
        this.sub.textContent = s.lastResult;
      } else {
        this.big.textContent = '';
        this.sub.textContent = '';
      }
    }

    // contagem do juiz
    if (s.count && s.phase === 'fight') {
      const who = s.count.who === null ? '' : ` — ${TEAM_NAMES[s.count.who]}`;
      const n = Math.min(3, Math.floor(s.count.value) + 1);
      this.count.innerHTML = `<span>${COUNT_LABEL[s.count.kind]}${who}</span><b>${'●'.repeat(n)}${'○'.repeat(3 - n)}</b>`;
      this.count.dataset.team = s.count.who === null ? '' : String(s.count.who);
      this.count.hidden = false;
    } else this.count.hidden = true;

    this.updateDebug(snap, specs);
  }

  private debugOn = false;
  setDebug(on: boolean) {
    this.debugOn = on;
    this.debugEl.hidden = !on;
  }

  private updateDebug(snap: SimSnapshot, specs: [RobotSpec, RobotSpec]) {
    if (!this.debugOn) return;
    const rows = snap.robots.map((r, i) => {
      const v = Math.hypot(r.linvel.x, r.linvel.z);
      const weight = specs[i].mass * GRAVITY;
      const wheels = r.wheels
        .map((w) => `<span class="${w.slipping && w.load > 0 ? 'slip' : ''} ${w.overEdge ? 'edge' : ''}">${w.load.toFixed(2)}N</span>`)
        .join('');
      const pct = Math.round(r.wheelLoadRatio * 100);
      return `<div class="dbg team-${i}"><b>${TEAM_NAMES[i]}</b> ${v.toFixed(2)} m/s
        <div class="bar"><i style="width:${Math.min(100, pct)}%"></i><em>${pct}% do peso nas rodas (${weight.toFixed(2)} N)</em></div>
        <div class="wheels">${wheels}</div>${r.touchingOutside ? '<div class="out">TOCANDO FORA</div>' : ''}</div>`;
    });
    this.debugEl.innerHTML = rows.join('') + `<div class="dbg-legend">verde = carga normal · laranja = tração · vermelho = patinando · amarelo = CG${snap.inContact ? ' · <b>CONTATO</b>' : ''}</div>`;
  }
}
