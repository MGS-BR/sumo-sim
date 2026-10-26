import { beforeAll, describe, expect, it } from 'vitest';
import { loadRapier, pointOnFirst, SumoWorld } from '../src/sim/physics';
import { quatFromYaw } from '../src/sim/math';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT, PHYSICS_HZ } from '../src/sim/modes';
import { ARENA } from '../src/sim/arena';
import { SparringBot } from '../src/control/sparringBot';
import type { ControlFrame, RobotSpec } from '../src/sim/types';
import type { RefEvent } from '../src/sim/referee';
import { robot, softStart } from './fixtures';

let R: Awaited<ReturnType<typeof loadRapier>>;
beforeAll(async () => {
  R = await loadRapier();
});

/** meia diagonal do robô + folga: nenhum ponto do robô fica mais longe que isso do centro */
const reach = (s: RobotSpec) => Math.hypot(s.length, s.width) / 2 + 0.01;

describe('ponto de evidência do toque fora', () => {
  it('par invertido pelo Rapier: usa o ponto local do próprio robô, não o do chão', () => {
    // robô em (0,40; 0; 0,10) girado 180°; o ponto do robô fica 5 cm à frente dele (local +x)
    const t = { x: 0.4, y: 0.01, z: 0.1 };
    const q = quatFromYaw(Math.PI);
    const onRobot = { x: 0.05, y: -0.01, z: 0 };
    const onGround = { x: 0.35, y: 0.05, z: 0.1 }; // ponto no referencial do chão (outro colisor)
    const right = pointOnFirst(true, onGround, onRobot, t, q)!;
    expect(right.x).toBeCloseTo(0.35, 6);
    expect(right.y).toBeCloseTo(0, 6);
    expect(right.z).toBeCloseTo(0.1, 6);
    // sem inversão, o ponto 1 é o do robô
    expect(pointOnFirst(false, onRobot, onGround, t, q)).toEqual(right);
    // o código antigo pegava sempre o ponto 1: com o par invertido a marca ia para o outro lado
    const old = pointOnFirst(false, onGround, onRobot, t, q)!;
    expect(Math.hypot(old.x - t.x, old.z - t.z)).toBeGreaterThan(0.3);
    expect(pointOnFirst(true, onGround, null, t, q)).toBeNull();
  });

  // Bug: quando o Rapier entregava o par (robô, chão) invertido e sem pontos de solver,
  // o ponto local do CHÃO era transformado pela pose do ROBÔ e a marca caía longe do
  // robô, às vezes no lado oposto da arena. Este caso reproduzia o erro.
  it('caso que reproduzia o bug: Bloco saindo de ré devagar a 15°', () => {
    const ang = (15 / 180) * Math.PI;
    const w = new SumoWorld(R, [robot('bloco'), robot('bloco')]);
    w.setPose(0, { x: 0.22 * Math.cos(ang), z: -0.22 * Math.sin(ang), yaw: ang + Math.PI });
    w.setPose(1, { x: -0.3 * Math.cos(ang), z: 0.3 * Math.sin(ang), yaw: 0 });
    for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
    w.setCommand(0, { left: -0.35, right: -0.35 });
    let s = w.robotState(0);
    for (let i = 0; i < 3 * PHYSICS_HZ && !s.touchingOutside; i++) {
      w.step();
      s = w.robotState(0);
    }
    expect(s.touchingOutside).toBe(true);
    const p = s.outsidePoint!;
    expect(Math.hypot(p.x - s.position.x, p.z - s.position.z)).toBeLessThan(reach(w.robots[0].spec));
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(ARENA.dohyoRadius - 0.005);
    expect(p.y).toBeLessThan(0.005);
    w.dispose();
  });

  it('em 16 direções, de frente e de ré, devagar e rápido: a marca está sempre no robô e fora do dohyo', () => {
    const bad: string[] = [];
    let total = 0;
    for (const id of ['kunai', 'tora', 'fuji', 'bloco'])
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * 2 * Math.PI;
        for (const back of [false, true])
          for (const thr of [0.35, 1]) {
            const w = new SumoWorld(R, [robot(id), robot('bloco')]);
            w.setPose(0, { x: 0.22 * Math.cos(ang), z: -0.22 * Math.sin(ang), yaw: back ? ang + Math.PI : ang });
            w.setPose(1, { x: -0.3 * Math.cos(ang), z: 0.3 * Math.sin(ang), yaw: 0 });
            for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
            const ramp = softStart();
            for (let i = 0; i < 3 * PHYSICS_HZ; i++) {
              const u = ramp(back ? -thr : thr);
              w.setCommand(0, { left: u, right: u });
              w.step();
              const s = w.robotState(0);
              if (!s.touchingOutside) continue;
              total++;
              const p = s.outsidePoint!;
              const d = Math.hypot(p.x - s.position.x, p.z - s.position.z);
              if (d > reach(w.robots[0].spec) || Math.hypot(p.x, p.z) < ARENA.dohyoRadius - 0.005 || p.y > 0.005)
                bad.push(`${id} ${k} ${back ? 'ré' : 'frente'} ${thr}: d=${d.toFixed(3)}`);
              break;
            }
            w.dispose();
          }
      }
    expect(total).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  }, 120_000);

  it('ponto de contato entre os robôs fica entre os dois', () => {
    const w = new SumoWorld(R, [robot('tora'), robot('fuji')]);
    w.setPose(0, { x: 0.1, z: 0.01, yaw: Math.PI });
    w.setPose(1, { x: -0.1, z: 0, yaw: 0.2 });
    const ramp = softStart();
    let checked = 0;
    for (let i = 0; i < 1.5 * PHYSICS_HZ; i++) {
      const u = ramp(1);
      w.setCommand(0, { left: u, right: u });
      w.setCommand(1, { left: u, right: u });
      w.step();
      const s = w.snapshot();
      if (!s.contactPoint) continue;
      checked++;
      for (const i of [0, 1]) {
        const c = s.robots[i].position;
        expect(Math.hypot(s.contactPoint.x - c.x, s.contactPoint.z - c.z)).toBeLessThan(reach(w.robots[i].spec));
      }
    }
    expect(checked).toBeGreaterThan(10);
    w.dispose();
  });

  it('partidas bot × bot: a evidência de cada ponto fica no robô que perdeu, no instante do toque', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const m = await Match.create({ specs: [robot('tora'), robot('kunai')], mode: MODES.realista, randomPlacement: true, seed });
      const bots = [new SparringBot('dificil'), new SparringBot('medio')];
      let t = 0;
      while (m.ref.s.phase !== 'over' && t < 240) {
        const f = [0, 1].map((i) =>
          bots[i].poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] }),
        ) as [ControlFrame, ControlFrame];
        const ev: RefEvent[] = m.step(f);
        t += PHYSICS_DT;
        for (const e of ev) {
          if (e.type !== 'yuko' || e.to.length !== 1 || (e.reason !== 'yuko' && e.reason !== 'iniciativa')) continue;
          const loser = 1 - e.to[0];
          const touch = m.outTouches[loser];
          if (!touch) continue;
          // quadro do replay mais próximo do toque
          const frame = m.replay.reduce((a, b) => (Math.abs(b.t - touch.t) < Math.abs(a.t - touch.t) ? b : a));
          const c = frame.pos[loser];
          expect(Math.abs(frame.t - touch.t)).toBeLessThan(0.01);
          expect(Math.hypot(touch.point.x - c.x, touch.point.z - c.z)).toBeLessThan(reach(m.specs[loser]) + 0.01);
          expect(Math.hypot(touch.point.x, touch.point.z)).toBeGreaterThan(ARENA.dohyoRadius - 0.005);
          checked++;
        }
      }
      m.dispose();
    }
    expect(checked).toBeGreaterThan(3);
  }, 120_000);
});
