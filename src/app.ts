import { ArenaView } from './render/arenaView';
import { TEAM_COLORS } from './render/robotMesh';
import { Hud } from './ui/hud';
import { Sfx } from './audio';
import { KeyboardState } from './control/keyboard';
import { Game, type Opponent } from './game';
import { MODES, type GameMode } from './sim/modes';
import { inspect, PARAMS, type ParamDef } from './sim/inspection';
import { defaultPlacement } from './sim/placement';
import { loadRapier } from './sim/physics';
import type { RobotSpec } from './sim/types';
import { allRobots, isPreset, resolveSlots, loadCustomRobots, loadSettings, newRobotId, saveCustomRobots, saveSettings } from './ui/storage';
import { PRESETS } from './sim/presets';
import { icon, kbdArrow } from './ui/icons';

interface Settings {
  mode: GameMode;
  opponent: Opponent;
  noCombatRule: boolean;
  replay: boolean;
  randomPlacement: boolean;
  debug: boolean;
  muted: boolean;
  volume: number;
  p1: string;
  p2: string;
}

const DEFAULTS: Settings = {
  mode: 'arcade',
  opponent: 'bot-medio',
  noCombatRule: true,
  replay: true,
  randomPlacement: false,
  debug: false,
  muted: false,
  volume: 0.8,
  p1: 'tora',
  p2: 'fuji',
};

const TEAM = ['Vermelho', 'Azul'];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** milímetros com até 1 casa: 99,5 não vira "100" (que pareceria acima do limite) e 99 continua "99" */
const fmtMm = (m: number) => (m * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

type Screen = 'loading' | 'menu' | 'select' | 'editor' | 'game' | 'result';

export class App {
  private view: ArenaView;
  private hud: Hud;
  private sfx = new Sfx();
  private keys = new KeyboardState();
  private settings: Settings = loadSettings(DEFAULTS);
  private screen: Screen = 'loading';
  private ui: HTMLElement;
  private game: Game | null = null;
  private last = performance.now();
  private pauseEl: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    const stage = el('div', 'stage');
    root.appendChild(stage);
    this.view = new ArenaView(stage);
    this.hud = new Hud(root);
    this.ui = el('div', 'ui');
    root.appendChild(this.ui);
    if (!Object.hasOwn(MODES, this.settings.mode)) this.settings.mode = DEFAULTS.mode;
    if (!['p2', 'bot-facil', 'bot-medio', 'bot-dificil'].includes(this.settings.opponent)) this.settings.opponent = DEFAULTS.opponent;
    this.sfx.muted = this.settings.muted;
    this.sfx.volume = this.settings.volume;
    this.fixSlots();
    window.addEventListener('keydown', (e) => this.onKey(e));
    // som em todos os botões (inclusive os do HUD), com um único listener
    root.addEventListener('click', (e) => this.uiSound(e), { capture: true });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t?.matches?.('input[type=checkbox]')) this.sfx.ui('toggle');
      else if (t?.matches?.('.ed-panel input')) this.sfx.ui('tick');
    });
    requestAnimationFrame((t) => this.loop(t));
  }

  private uiSound(e: Event) {
    const b = (e.target as HTMLElement | null)?.closest?.('button');
    if (!b || b.disabled) return;
    const act = b.dataset.act ?? '';
    if (b.classList.contains('danger') || act === 'del') this.sfx.ui('danger');
    else if (b.classList.contains('primary') || b.classList.contains('hud-ready')) this.sfx.ui('confirm');
    else if (b.classList.contains('ghost') || act === 'back' || act === 'cancel' || act === 'menu') this.sfx.ui('back');
    else if (b.closest('.seg') || b.classList.contains('card') || b.dataset.view || act === 'spin') this.sfx.ui('toggle');
    else this.sfx.ui('select');
  }

  async boot() {
    this.ui.innerHTML = '<div class="loading">Carregando física…</div>';
    await loadRapier();
    this.showMenu();
  }

  private save() {
    saveSettings(this.settings);
  }

  /** lados apontando para robôs que existem (ex.: configuração salva com Bloco/Trator, que saíram) */
  private fixSlots() {
    const s = this.settings;
    [s.p1, s.p2] = resolveSlots(s.p1, s.p2, allRobots().map((r) => r.id), [DEFAULTS.p1, DEFAULTS.p2]);
  }

  private robot(id: string): RobotSpec {
    return structuredClone(allRobots().find((r) => r.id === id) ?? PRESETS[0]);
  }

  private loop(t: number) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.game && (this.screen === 'game' || this.screen === 'result')) this.game.frame(dt);
    else this.view.updateCamera(dt);
    this.view.render();
    requestAnimationFrame((tt) => this.loop(tt));
  }

  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
    if (typing) return;
    if (this.screen === 'game' && e.code === 'Escape') this.togglePause();
    else if (this.screen === 'result' && (e.code === 'Enter' || e.code === 'NumpadEnter')) this.startGame();
    else if (this.screen === 'menu' && e.code === 'Enter') this.showSelect();
    else if (this.screen === 'select' && e.code === 'Escape') this.showMenu();
    else if (this.screen === 'select' && e.code === 'Enter') this.startGame();
    else if (this.screen === 'editor' && e.code === 'Escape') this.showSelect();
  }

  // ---------------------------------------------------------------- vitrine 3D
  private showcase(specs: [RobotSpec | null, RobotSpec | null], orbit: [number, number, number] = [0.62, 0.3, 0.1], offset = 0) {
    this.view.setFrameOffset(window.innerWidth > 900 ? offset : 0);
    this.view.setRobots(specs);
    this.view.setDebug(false);
    this.view.showPlacementZones(false);
    for (const i of [0, 1]) if (specs[i]) this.view.setStaticPose(i, defaultPlacement(specs[i]!, i));
    this.view.setOrbit(true, ...orbit);
  }

  private endGame() {
    this.game?.dispose();
    this.game = null;
    this.hud.hide();
    this.closePause();
  }

  // ---------------------------------------------------------------- menu
  showMenu() {
    this.endGame();
    this.screen = 'menu';
    this.showcase([this.robot(this.settings.p1), this.robot(this.settings.p2)], [0.66, 0.26, 0.1], 0.16);
    const s = this.settings;
    const seg = <T extends string>(name: keyof Settings, opts: [T, string][]) =>
      `<div class="seg" data-name="${name}">${opts
        .map(([v, l]) => `<button data-v="${v}" class="${s[name] === v ? 'on' : ''}">${l}</button>`)
        .join('')}</div>`;
    const tog = (name: keyof Settings, label: string, hint: string) =>
      `<label class="tog"><input type="checkbox" data-name="${name}" ${s[name] ? 'checked' : ''}><span></span><div><b>${label}</b><small>${hint}</small></div></label>`;

    this.ui.innerHTML = '';
    const scr = el('section', 'screen menu');
    scr.innerHTML = `
      <header class="brand">
        <div class="mark">相撲</div>
        <h1>Sumô <em>500g</em></h1>
        <p>Simulador de Mini Sumô em escala real · regulamento RoboCore v3.1</p>
      </header>
      <div class="panel">
        <div class="field"><span class="lbl">Modo</span>${seg('mode', [
          ['realista', 'Realista'],
          ['arcade', 'Arcade'],
        ])}<p class="desc" data-desc="mode"></p></div>
        <div class="field"><span class="lbl">Oponente</span>${seg('opponent', [
          ['p2', '2 jogadores'],
          ['bot-facil', 'Bot fácil'],
          ['bot-medio', 'Bot médio'],
          ['bot-dificil', 'Bot difícil'],
        ])}</div>
        <div class="field"><span class="lbl">Opções</span>
          ${tog('noCombatRule', 'Hansoku por falta de combate', 'Art. 17: os dois se movendo sem contato por 3 s')}
          ${tog('replay', 'Replay do ponto', 'Câmera lenta a cada Yuko')}
          ${tog('randomPlacement', 'Posicionamento aleatório', 'Sorteia posição e giro dos dois robôs a cada round')}
          ${tog('debug', 'Ver forças (debug)', 'Carga e tração em cada roda · F2 na luta')}
          ${tog('muted', 'Sem som', '')}
          <label class="vol"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol aria-label="Volume"></label>
        </div>
        <button class="primary big" data-act="next">Escolher robôs ${icon('right')} <kbd>Enter</kbd></button>
      </div>
      <footer class="keys">
        <div><b class="t0">Vermelho</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Shift</kbd> fino · <kbd>Q</kbd><kbd>E</kbd> deslizar · <kbd>Espaço</kbd> pronto</div>
        <div><b class="t1">Azul</b> ${kbdArrow('up', 'seta para cima')}${kbdArrow('left', 'seta para a esquerda')}${kbdArrow('down', 'seta para baixo')}${kbdArrow('right', 'seta para a direita')} · <kbd>Shift dir.</kbd> fino · <kbd>,</kbd><kbd>.</kbd> deslizar · <kbd>Enter</kbd> pronto</div>
        <div class="solo">${icon('flag')} Contra o bot, use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou as setas</div>
        <div>${icon('mouse')} No posicionamento: arraste o robô e gire com a roda</div>
        <div class="touch-warn">Este simulador é controlado pelo teclado — use um computador.</div>
      </footer>`;
    this.ui.appendChild(scr);
    const descMode = () => {
      const d = scr.querySelector('[data-desc="mode"]')!;
      d.textContent =
        s.mode === 'realista'
          ? 'Tempo real. Um round costuma durar menos de 2 s. Mexer antes do bip é Keikoku.'
          : 'Mesma física em câmera lenta (50%) e aceleração mais suave para dar tempo de reagir.';
    };
    descMode();
    scr.querySelectorAll<HTMLElement>('.seg').forEach((g) =>
      g.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        (s as unknown as Record<string, string>)[g.dataset.name!] = b.dataset.v!;
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        descMode();
        this.save();
      }),
    );
    scr.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) =>
      c.addEventListener('change', () => {
        (s as unknown as Record<string, boolean>)[c.dataset.name!] = c.checked;
        this.sfx.muted = s.muted;
        this.save();
      }),
    );
    const vol = scr.querySelector<HTMLInputElement>('[data-vol]')!;
    vol.addEventListener('input', () => {
      s.volume = +vol.value;
      this.sfx.volume = s.volume;
      this.save();
    });
    vol.addEventListener('change', () => this.sfx.impact(0.6));
    scr.querySelector('[data-act=next]')!.addEventListener('click', () => this.showSelect());
  }

  // ---------------------------------------------------------------- seleção
  showSelect() {
    this.endGame();
    this.screen = 'select';
    const s = this.settings;
    const specs: [RobotSpec, RobotSpec] = [this.robot(s.p1), this.robot(s.p2)];
    this.showcase(specs, [0.42, 0.16, 0.15]);
    this.ui.innerHTML = '';
    const scr = el('section', 'screen select');
    const col = (slot: 0 | 1) => {
      const c = el('div', `pick team-${slot}`);
      const robots = allRobots();
      const chosen = slot === 0 ? s.p1 : s.p2;
      const who = slot === 0 ? 'Jogador 1' : s.opponent === 'p2' ? 'Jogador 2' : 'Bot';
      c.innerHTML = `<h2><i></i>${TEAM[slot]} <small>${who}</small></h2>
        <div class="cards">${robots
          .map(
            (r) => `<button class="card ${r.id === chosen ? 'on' : ''}" data-id="${esc(r.id)}">
              <b>${esc(r.name)}</b><span>${isPreset(r.id) ? 'preset' : 'customizado'}</span></button>`,
          )
          .join('')}</div>
        <div class="sheet">${this.sheet(this.robot(chosen))}</div>
        <div class="row">
          <button data-act="edit">${isPreset(chosen) ? 'Customizar a partir deste' : 'Editar'}</button>
          <button data-act="new">Novo robô</button>
        </div>`;
      c.querySelectorAll<HTMLButtonElement>('.card').forEach((b) =>
        b.addEventListener('click', () => {
          if (slot === 0) s.p1 = b.dataset.id!;
          else s.p2 = b.dataset.id!;
          this.save();
          this.showSelect();
        }),
      );
      c.querySelector('[data-act=edit]')!.addEventListener('click', () => {
        const base = this.robot(chosen);
        if (isPreset(chosen)) this.openEditor({ ...base, id: newRobotId(), name: `${base.name.split(' (')[0]} custom` }, slot, true);
        else this.openEditor(base, slot, false);
      });
      c.querySelector('[data-act=new]')!.addEventListener('click', () =>
        this.openEditor({ ...this.robot(DEFAULTS.p1), id: newRobotId(), name: 'Meu robô' }, slot, true),
      );
      return c;
    };
    const ok = inspect(specs[0]).ok && inspect(specs[1]).ok;
    const mid = el('div', 'vs');
    mid.innerHTML = `<div class="vs-mark">VS</div>
      <div class="vs-info">${MODES[s.mode].label} · ${s.opponent === 'p2' ? '2 jogadores' : 'contra bot'}</div>
      <button class="primary big" data-act="fight" ${ok ? '' : 'disabled'}>${icon('play')} Lutar!</button>
      ${ok ? '' : '<p class="warn">Um dos robôs não passou na inspeção</p>'}
      <button class="ghost" data-act="back">${icon('left')} Menu</button>`;
    scr.append(col(0), mid, col(1));
    this.ui.appendChild(scr);
    mid.querySelector('[data-act=fight]')!.addEventListener('click', () => this.startGame());
    mid.querySelector('[data-act=back]')!.addEventListener('click', () => this.showMenu());
  }

  private sheet(spec: RobotSpec) {
    const r = inspect(spec);
    const d = r.derived;
    const rows: [string, string][] = [
      ['Dimensões', `${fmtMm(spec.length)} × ${fmtMm(spec.width)} × ${fmtMm(spec.height)} mm`],
      ['Massa', `${fmt(spec.mass * 1000)} g`],
      ['Rodas', `${spec.wheels.count} × Ø${fmtMm(spec.wheels.radius * 2)} mm · μ ${fmt(spec.wheels.friction, 2)}`],
      ['Motor', `${fmt(spec.motor.freeRpm)} RPM · ${fmt(spec.motor.stallTorque / 0.0980665, 1)} kgf·cm`],
      ['Lâmina', `${fmt(spec.blade.angleDeg)}° · ${fmtMm(spec.blade.length)} × ${fmtMm(spec.blade.width)} mm`],
      ['Altura / aresta', `${fmt(d.bladeHeight * 1000, 1)} mm · folga ${fmt(spec.blade.edgeClearance * 1000, 2)} mm`],
      ['Velocidade máx.', `${fmt(d.topSpeed, 2)} m/s`],
      ['Peso nas rodas', `${fmt(d.wheelLoadFraction * 100)}%`],
      ['Tração máx.', `${fmt(d.maxTraction, 1)} N <small>(motores: ${fmt(d.motorForce)} N)</small>`],
    ];
    return `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="insp ${r.ok ? 'ok' : 'bad'}">${r.ok ? icon('check') + ' Aprovado na inspeção' : icon('x') + ' Reprovado: ' + r.checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}</div>`;
  }

  // ---------------------------------------------------------------- editor
  private openEditor(spec: RobotSpec, forSlot: 0 | 1, isNew: boolean) {
    this.screen = 'editor';
    // desktop: robô entre os painéis; celular: robô na faixa de cima, acima dos painéis
    this.view.setFrameOffset(window.innerWidth > 900 ? -0.06 : 0, window.innerWidth > 900 ? 0 : 0.29);
    this.view.setRobots([spec, null], [forSlot, null]);
    this.view.setStaticPose(0, { x: 0, z: 0, yaw: 0 });
    this.view.setInspectCamera(true);
    this.view.setDebug(true);
    this.ui.innerHTML = '';
    const scr = el('section', 'screen editor');
    const groups = [...new Set(PARAMS.map((p) => p.group))];
    scr.innerHTML = `
      <div class="ed-panel">
        <div class="ed-head">
          <input class="name" maxlength="28" value="${esc(spec.name)}" aria-label="Nome do robô">
          <label class="color">Chassi <input type="color" data-color="bodyColor" value="${spec.bodyColor}"></label>
          <label class="color">Pneu <input type="color" data-color="tireColor" value="${spec.tireColor}"></label>
        </div>
        <div class="ed-groups">${groups
          .map(
            (g) => `<fieldset><legend>${g}</legend>${PARAMS.filter((p) => p.group === g)
              .map((p) => this.paramRow(p, spec))
              .join('')}</fieldset>`,
          )
          .join('')}</div>
      </div>
      <aside class="ed-side">
        <h3>Caixa de inspeção</h3>
        <div class="ed-insp"></div>
        <div class="ed-derived"></div>
        <p class="ed-note">A física usa exatamente esta geometria. O ponto amarelo é o centro de massa.</p>
        <div class="ed-cam" role="group" aria-label="Câmera">
          <span class="lbl">Câmera</span>
          <div class="ed-cam-row">
            <button data-view="perspectiva">3D</button><button data-view="frente">Frente</button><button data-view="lado">Lado</button><button data-view="tras">Trás</button><button data-view="cima">Cima</button>
            <button data-act="spin" aria-pressed="false">${icon('spin')} Auto-girar</button>
          </div>
          <small>Arraste para girar · roda/pinça = zoom · botão direito = mover</small>
        </div>
        <div class="row">
          <button class="primary" data-act="save">${icon('save')} Salvar</button>
          <button data-act="cancel">${icon('x')} Cancelar</button>
          ${isNew ? '' : `<button class="danger" data-act="del">${icon('trash')} Excluir</button>`}
        </div>
      </aside>`;
    this.ui.appendChild(scr);

    let rebuildTimer = 0;
    const syncRows = () => {
      // parâmetros ligados (comprimento ↔ altura da lâmina) precisam refletir o valor atual
      scr.querySelectorAll<HTMLElement>('.prm').forEach((row) => {
        const p = PARAMS.find((x) => x.key === row.dataset.key);
        if (!p) return;
        if (p.kind === 'toggle') {
          const cb = row.querySelector<HTMLInputElement>('input[type=checkbox]');
          if (cb) cb.checked = p.toUi(spec) >= 0.5;
          return;
        }
        const v = String(+p.toUi(spec).toFixed(2));
        const range = row.querySelector<HTMLInputElement>('input[type=range]')!;
        const num = row.querySelector<HTMLInputElement>('input[type=number]')!;
        if (range.value !== v) range.value = v;
        if (num.value !== v && document.activeElement !== num) num.value = v;
      });
    };
    const refresh = () => {
      syncRows();
      const r = inspect(spec);
      scr.querySelector('.ed-insp')!.innerHTML = r.checks
        .map((c) => `<div class="chk ${c.note ? 'note' : c.ok ? 'ok' : 'bad'}"><i>${icon(c.note ? 'flag' : c.ok ? 'check' : 'x')}</i><b>${c.label}</b><span>${esc(c.detail)}</span></div>`)
        .join('');
      const d = r.derived;
      scr.querySelector('.ed-derived')!.innerHTML = `
        <div><b>${fmt(d.topSpeed, 2)}</b><span>m/s máx.</span></div>
        <div><b>${fmt(d.wheelLoadFraction * 100)}%</b><span>peso nas rodas</span></div>
        <div><b>${fmt(d.maxTraction, 1)} N</b><span>tração máx.</span></div>
        <div><b>${fmt(d.motorForce)} N</b><span>força dos motores</span></div>`;
      (scr.querySelector('[data-act=save]') as HTMLButtonElement).disabled = false;
      clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(() => {
        this.view.setRobots([spec, null], [forSlot, null]);
        this.view.setStaticPose(0, { x: 0, z: 0, yaw: 0 });
        this.view.setDebug(true);
      }, 60);
    };
    refresh();

    scr.querySelector<HTMLInputElement>('.name')!.addEventListener('input', (e) => (spec.name = (e.target as HTMLInputElement).value || 'Sem nome'));
    scr.querySelectorAll<HTMLInputElement>('input[data-color]').forEach((c) =>
      c.addEventListener('input', () => {
        (spec as unknown as Record<string, string>)[c.dataset.color!] = c.value;
        refresh();
      }),
    );
    scr.querySelectorAll<HTMLElement>('.prm-toggle').forEach((row) => {
      const p = PARAMS.find((x) => x.key === row.dataset.key)!;
      const cb = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
      cb.addEventListener('change', () => {
        p.apply(spec, cb.checked ? 1 : 0);
        refresh();
      });
    });
    scr.querySelectorAll<HTMLElement>('.prm:not(.prm-toggle)').forEach((row) => {
      const p = PARAMS.find((x) => x.key === row.dataset.key)!;
      const range = row.querySelector<HTMLInputElement>('input[type=range]')!;
      const num = row.querySelector<HTMLInputElement>('input[type=number]')!;
      const set = (v: number) => {
        if (!Number.isFinite(v)) return;
        p.apply(spec, Math.max(p.min, Math.min(p.max, v)));
        num.value = String(+p.toUi(spec).toFixed(2));
        refresh();
      };
      range.addEventListener('input', () => set(+range.value));
      num.addEventListener('change', () => set(+num.value));
    });
    scr.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => this.view.inspectView(b.dataset.view as 'perspectiva' | 'frente' | 'lado' | 'tras' | 'cima')),
    );
    const spin = scr.querySelector<HTMLButtonElement>('[data-act=spin]')!;
    spin.addEventListener('click', () => {
      this.view.setAutoRotate(!this.view.autoRotate);
      spin.setAttribute('aria-pressed', String(this.view.autoRotate));
      spin.classList.toggle('on', this.view.autoRotate);
    });
    scr.querySelector('[data-act=cancel]')!.addEventListener('click', () => this.showSelect());
    scr.querySelector('[data-act=save]')!.addEventListener('click', () => {
      const list = loadCustomRobots().filter((r) => r.id !== spec.id);
      list.push(spec);
      saveCustomRobots(list);
      if (forSlot === 0) this.settings.p1 = spec.id;
      else this.settings.p2 = spec.id;
      this.save();
      this.showSelect();
    });
    scr.querySelector('[data-act=del]')?.addEventListener('click', () => {
      if (!confirm(`Excluir "${spec.name}"?`)) return;
      saveCustomRobots(loadCustomRobots().filter((r) => r.id !== spec.id));
      this.fixSlots();
      this.save();
      this.showSelect();
    });
  }

  private paramRow(p: ParamDef, spec: RobotSpec) {
    const v = p.toUi(spec);
    if (p.kind === 'toggle')
      return `<div class="prm prm-toggle" data-key="${p.key}">
      <label>${p.label}${p.hint ? `<small>${p.hint}</small>` : ''}</label>
      <label class="tog"><input type="checkbox" ${v ? 'checked' : ''} aria-label="${p.label}"><span></span></label>
    </div>`;
    return `<div class="prm" data-key="${p.key}">
      <label>${p.label}${p.hint ? `<small>${p.hint}</small>` : ''}</label>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
      <span class="num"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"><em>${p.unit}</em></span>
    </div>`;
  }

  // ---------------------------------------------------------------- luta
  async startGame() {
    this.endGame();
    const s = this.settings;
    const specs: [RobotSpec, RobotSpec] = [this.robot(s.p1), this.robot(s.p2)];
    if (!inspect(specs[0]).ok || !inspect(specs[1]).ok) return this.showSelect();
    this.screen = 'game';
    this.ui.innerHTML = '';
    this.view.setFrameOffset(0);
    const g = new Game(this.view, this.hud, this.sfx, this.keys, {
      specs,
      mode: MODES[s.mode],
      opponent: s.opponent,
      rules: { noCombatRule: s.noCombatRule },
      replay: s.replay,
      debug: s.debug,
      randomPlacement: s.randomPlacement,
    });
    this.game = g;
    g.onEnd = (w, reason) => this.showResult(w, reason);
    await g.start();
  }

  private togglePause() {
    if (!this.game) return;
    if (this.pauseEl) return this.closePause();
    this.game.paused = true;
    const p = el('div', 'screen pause');
    p.innerHTML = `<div class="panel narrow">
      <h2>Pausa</h2>
      <button class="primary" data-act="resume">${icon('play')} Continuar <kbd>Esc</kbd></button>
      <button data-act="restart">${icon('refresh')} Reiniciar partida</button>
      <button data-act="select">${icon('swap')} Trocar robôs</button>
      <button data-act="menu">${icon('home')} Menu</button>
      <p class="desc">A física fica congelada durante a pausa.</p></div>`;
    this.ui.appendChild(p);
    this.pauseEl = p;
    p.querySelector('[data-act=resume]')!.addEventListener('click', () => this.closePause());
    p.querySelector('[data-act=restart]')!.addEventListener('click', () => this.startGame());
    p.querySelector('[data-act=select]')!.addEventListener('click', () => this.showSelect());
    p.querySelector('[data-act=menu]')!.addEventListener('click', () => this.showMenu());
  }

  private closePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
    if (this.game) this.game.paused = false;
    this.keys.clearPressed();
  }

  private showResult(winner: number | null, reason: string) {
    if (!this.game) return;
    this.screen = 'result';
    this.hud.dim();
    const g = this.game;
    const sc = g.match.ref.s.scores;
    const specs = g.opts.specs;
    const r = el('section', 'screen result');
    const color = winner === null ? '#ccc' : TEAM_COLORS[winner];
    r.innerHTML = `<div class="panel narrow" style="--team:${color}">
      <div class="res-label">${winner === null ? 'Empate' : 'Vencedor'}</div>
      <h2 class="res-winner">${winner === null ? 'Hikiwake' : `${TEAM[winner]} · ${esc(specs[winner].name)}`}</h2>
      <div class="res-score"><span class="t0">${sc[0]}</span><i>×</i><span class="t1">${sc[1]}</span></div>
      <p class="desc">${esc(reason)}</p>
      <button class="primary" data-act="again">${icon('refresh')} Revanche <kbd>Enter</kbd></button>
      <button data-act="select">${icon('swap')} Trocar robôs</button>
      <button data-act="menu">${icon('home')} Menu</button></div>`;
    this.ui.appendChild(r);
    r.querySelector('[data-act=again]')!.addEventListener('click', () => this.startGame());
    r.querySelector('[data-act=select]')!.addEventListener('click', () => this.showSelect());
    r.querySelector('[data-act=menu]')!.addEventListener('click', () => this.showMenu());
  }
}
