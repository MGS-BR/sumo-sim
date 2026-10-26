import { beforeAll, describe, expect, it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT, PHYSICS_HZ } from '../src/sim/modes';
import { ARENA } from '../src/sim/arena';
import { buildRobotGeometry } from '../src/sim/geometry';
import { normalizeSpec } from '../src/sim/specs';
import { placementIssue } from '../src/sim/placement';
import { TRAINING_BOX, boxDragForce, trainingBox } from '../src/sim/training';
import { TrainingTarget } from '../src/control/trainingTarget';
import { SparringBot } from '../src/control/sparringBot';
import { engineMix } from '../src/audio';
import { EMPTY_FRAME, type ControlFrame } from '../src/sim/types';
import type { RefEvent } from '../src/sim/referee';
import { robot, softStart } from './fixtures';

let R: Awaited<ReturnType<typeof loadRapier>>;
beforeAll(async () => {
  R = await loadRapier();
});

describe('caixa do treino: definição', () => {
  it('é imutável, passiva e do tamanho/peso máximos de um Mini Sumô', () => {
    expect(Object.isFrozen(TRAINING_BOX)).toBe(true);
    expect(TRAINING_BOX.passive).toBe(true);
    expect(TRAINING_BOX.length).toBe(0.1);
    expect(TRAINING_BOX.width).toBe(0.1);
    expect(TRAINING_BOX.mass).toBe(0.5);
    const a = trainingBox();
    a.mass = 1;
    expect(trainingBox().mass).toBe(0.5);
    expect(boxDragForce()).toBeCloseTo(0.4 * 0.5 * 9.81, 6);
  });

  it('robô salvo não consegue virar "caixa" (passive é descartado ao carregar)', () => {
    const s = normalizeSpec({ ...robot('kunai'), passive: true })!;
    expect(s.passive).toBeUndefined();
  });

  it('geometria: um bloco de 8 vértices, sem rodas nem lâmina', () => {
    const g = buildRobotGeometry(trainingBox());
    expect(g.bodyHull.length).toBe(8 * 3);
    expect(g.wheels).toEqual([]);
    expect(g.bladeHull).toEqual([]);
    expect(g.bounds.maxY).toBeCloseTo(0.05);
  });

  it('controlador: sempre pronto e nunca aciona motor', () => {
    const c = new TrainingTarget();
    const ctx = { me: 1, phase: 'fight' as const, dt: PHYSICS_DT, snapshot: null as never, placement: { x: 0, z: 0, yaw: 0 } };
    const f = c.poll(ctx);
    expect(f.ready).toBe(true);
    expect(f.drive).toEqual({ left: 0, right: 0 });
    expect(c.label).toBe('Treino');
  });

  it('não tem som de motor', () => {
    const w = new SumoWorld(R, [robot('kunai'), trainingBox()]);
    w.step();
    const m = engineMix(w.robotState(1), trainingBox());
    expect(m.body + m.gear + m.pwm + m.brush).toBe(0);
    w.dispose();
  });
});

describe('caixa do treino: física', () => {
  const world = () => {
    const w = new SumoWorld(R, [robot('tora'), trainingBox()]);
    w.setPose(0, { x: -0.3, z: 0.3, yaw: 0 });
    w.setPose(1, { x: 0, z: 0, yaw: 0 });
    return w;
  };

  it('parada fica parada no dohyo (sem escorregar nem afundar)', () => {
    const w = world();
    for (let i = 0; i < 3 * PHYSICS_HZ; i++) w.step();
    const s = w.robotState(1);
    expect(Math.hypot(s.position.x, s.position.z)).toBeLessThan(0.0005);
    expect(Math.abs(s.position.y - ARENA.dohyoHeight)).toBeLessThan(0.001);
    expect(s.touchingOutside).toBe(false);
    w.dispose();
  });

  it('atrito de Coulomb: abaixo de μ·m·g para (só a acomodação do contato, < 2 mm); acima acelera com (F − μ·m·g)/m', () => {
    for (const k of [0.9, 1.2, 1.5]) {
      const w = world();
      for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
      const body = w.robots[1].body;
      const F = k * boxDragForce();
      for (let i = 0; i < 0.5 * PHYSICS_HZ; i++) {
        body.applyImpulse({ x: F * PHYSICS_DT, y: 0, z: 0 }, true);
        w.step();
      }
      const s = w.robotState(1);
      if (k < 1) {
        expect(s.position.x).toBeLessThan(0.002);
        expect(Math.abs(s.linvel.x)).toBeLessThan(0.002);
      } else {
        const ideal = ((F - boxDragForce()) / TRAINING_BOX.mass) * 0.5;
        expect(Math.abs(s.linvel.x - ideal) / ideal).toBeLessThan(0.1);
      }
      w.dispose();
    }
  });

  it('um preset empurra a caixa para fora; o toque fora é da caixa e fica nela', () => {
    const w = new SumoWorld(R, [robot('fuji'), trainingBox()]);
    w.setPose(0, { x: -0.12, z: 0, yaw: 0 });
    w.setPose(1, { x: 0.12, z: 0, yaw: 0 });
    for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
    const ramp = softStart();
    let out = null as ReturnType<SumoWorld['robotState']> | null;
    for (let i = 0; i < 6 * PHYSICS_HZ && !out; i++) {
      const u = ramp(1);
      w.setCommand(0, { left: u, right: u });
      w.step();
      const b = w.robotState(1);
      if (b.touchingOutside) out = b;
      expect(w.robotState(0).touchingOutside).toBe(false);
    }
    expect(out).not.toBeNull();
    const p = out!.outsidePoint!;
    expect(Math.hypot(p.x - out!.position.x, p.z - out!.position.z)).toBeLessThan(0.08);
    w.dispose();
  });
});

describe('caixa do treino: juiz e partida', () => {
  it('a caixa parada não leva Hansoku; o jogador que roda sem encostar também não pontua', async () => {
    const m = await Match.create({ specs: [robot('kunai'), trainingBox()], mode: MODES.realista });
    const target = new TrainingTarget();
    const ctx = () => ({ me: 1, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[1] });
    m.step([{ ...EMPTY_FRAME, ready: true }, target.poll(ctx())]);
    const events: RefEvent[] = [];
    // girando no lugar (movendo, sem contato) por 6 s de luta
    for (let k = 0; k < PHYSICS_HZ * 10; k++) {
      const live = m.ref.s.phase === 'fight';
      const f: ControlFrame = { ...EMPTY_FRAME, drive: live ? { left: -0.5, right: 0.5 } : { left: 0, right: 0 } };
      events.push(...m.step([f, target.poll(ctx())]));
    }
    expect(events.filter((e) => e.type === 'yuko')).toEqual([]);
    expect(m.ref.s.scores).toEqual([0, 0]);
    m.dispose();
  });

  it('a caixa parada no centro não acumula Yusei (não ganha a decisão por domínio)', async () => {
    const m = await Match.create({ specs: [robot('kunai'), trainingBox()], mode: MODES.realista });
    m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
    // o caixa é posta no centro do dohyo e o jogador gira no lugar, sem empurrar
    for (let k = 0; k < PHYSICS_HZ * 8; k++) {
      if (m.ref.s.phase === 'fight' && m.sim.getPose(1).x !== 0) m.sim.setPose(1, { x: 0, z: 0, yaw: 0 });
      const live = m.ref.s.phase === 'fight';
      m.step([{ ...EMPTY_FRAME, drive: live ? { left: -0.4, right: 0.4 } : { left: 0, right: 0 } }, { ...EMPTY_FRAME, ready: true }]);
    }
    expect(m.ref.s.yusei[1]).toBe(0);
    m.dispose();
  });

  it('o jogador parado continua levando Hansoku (a regra só poupa a caixa)', async () => {
    const m = await Match.create({ specs: [robot('kunai'), trainingBox()], mode: MODES.realista });
    m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
    let ev: RefEvent | undefined;
    for (let k = 0; k < PHYSICS_HZ * 12 && !ev; k++) ev = m.step([EMPTY_FRAME, { ...EMPTY_FRAME, ready: true }]).find((e) => e.type === 'yuko');
    expect(ev).toMatchObject({ type: 'yuko', to: [1], reason: 'hansoku-parado' });
    m.dispose();
  });

  it('bot difícil × caixa, com posição aleatória: posições legais, partida termina e o tempo do treino é medido', async () => {
    for (const id of ['kunai', 'tora', 'fuji'])
      for (const seed of [1, 2]) {
        const m = await Match.create({ specs: [robot(id), trainingBox()], mode: MODES.realista, randomPlacement: true, seed });
        const bot = new SparringBot('dificil');
        const target = new TrainingTarget();
        const times: number[] = [];
        let t = 0;
        let rounds = 1;
        const legal = () => {
          for (const i of [0, 1]) expect(placementIssue(m.specs[i], m.placements[i], i)).toBeNull();
        };
        legal();
        while (m.ref.s.phase !== 'over' && t < 300) {
          const f: [ControlFrame, ControlFrame] = [
            bot.poll({ me: 0, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[0] }),
            target.poll({ me: 1, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[1] }),
          ];
          for (const e of m.step(f)) {
            if (e.type === 'yuko' && e.to.length === 1 && e.to[0] === 0 && m.outTouches[1]) times.push(m.outTouches[1].t - m.fightStart);
            if (e.type === 'phase' && e.phase === 'placement') {
              rounds++;
              legal();
            }
          }
          t += PHYSICS_DT;
        }
        expect(m.ref.s.phase).toBe('over');
        expect(m.ref.s.winner).toBe(0);
        expect(times.length).toBeGreaterThanOrEqual(2);
        for (const x of times) {
          expect(x).toBeGreaterThan(0.2);
          expect(x).toBeLessThan(60);
        }
        expect(rounds).toBeGreaterThanOrEqual(2);
        m.dispose();
      }
  }, 120_000);
});
