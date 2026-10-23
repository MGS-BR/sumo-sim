import { beforeAll, describe, expect, it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { clonePreset, PRESETS } from '../src/sim/presets';
import { inspect } from '../src/sim/inspection';
import { theoreticalTopSpeed, wheelForces } from '../src/sim/drive';
import { PHYSICS_HZ } from '../src/sim/modes';
import { ARENA } from '../src/sim/arena';
import { constrainPlacement, defaultPlacement, footprint, nudgePlacement, placementIssue, PLACEMENT_LINE_X } from '../src/sim/placement';
import { quatFromYaw, rotate, yawOf } from '../src/sim/math';
import type { RobotSpec } from '../src/sim/types';

let R: Awaited<ReturnType<typeof loadRapier>>;
beforeAll(async () => {
  R = await loadRapier();
});

const steps = (w: SumoWorld, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds * PHYSICS_HZ); i++) {
    w.step();
    each?.();
  }
};
const far = (w: SumoWorld, i: number) => w.setPose(i, { x: 0.3, z: 0.3 * (i ? 1 : -1), yaw: 0 });

describe('matemática', () => {
  it('yaw: 0 olha para +x, positivo vira para a esquerda (−z)', () => {
    const f = rotate(quatFromYaw(Math.PI / 2), { x: 1, y: 0, z: 0 });
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    expect(yawOf(quatFromYaw(1.2))).toBeCloseTo(1.2);
  });
});

describe('caixa de inspeção (Art. 4)', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('preset %s é legal', (_id, p) => {
    const r = inspect(p);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
  });
  it('reprova robô com mais de 100 mm ou mais de 500 g', () => {
    const big: RobotSpec = { ...clonePreset('bloco'), length: 0.105 };
    expect(inspect(big).checks.find((c) => c.id === 'length')!.ok).toBe(false);
    const heavy: RobotSpec = { ...clonePreset('bloco'), mass: 0.501 };
    expect(inspect(heavy).checks.find((c) => c.id === 'mass')!.ok).toBe(false);
  });
  it('mini sumô é limitado pela tração, não pelo motor', () => {
    for (const p of PRESETS) expect(inspect(p).derived.tractionLimited).toBe(true);
  });
});

describe('modelo de pneu', () => {
  const base = { u: 1, load: 1.2, vLong: 0, vLat: 0, radius: 0.015, freeOmega: 42, stallTorque: 0.36, muStatic: 1, muKinetic: 0.85, effMass: 0.125, dt: 1 / 480 };
  it('força limitada por μ·N', () => {
    const o = wheelForces(base);
    expect(o.slipping).toBe(true);
    expect(Math.abs(o.fLong)).toBeLessThanOrEqual(1.2 * 0.85 + 1e-9);
  });
  it('sem carga não há força (roda no ar)', () => {
    expect(wheelForces({ ...base, load: 0 }).fLong).toBe(0);
  });
  it('na velocidade livre o motor não empurra mais', () => {
    const vFree = 42 * 0.015;
    expect(Math.abs(wheelForces({ ...base, vLong: vFree }).fLong)).toBeLessThan(0.05);
  });
});

describe('física do robô', () => {
  it.each(PRESETS.map((p) => [p.id] as const))('%s: fica estável parado e atinge a velocidade de projeto', (id) => {
    const w = new SumoWorld(R, [clonePreset(id), clonePreset('bloco')]);
    w.setPose(0, { x: -0.25, z: 0, yaw: 0 });
    far(w, 1);
    steps(w, 0.5);
    const rest = w.robotState(0);
    expect(rest.position.y).toBeGreaterThan(ARENA.dohyoHeight - 0.001);
    expect(rest.position.y).toBeLessThan(ARENA.dohyoHeight + 0.001);
    expect(Math.hypot(rest.linvel.x, rest.linvel.z)).toBeLessThan(0.01);
    w.setCommand(0, { left: 1, right: 1 });
    let vmax = 0;
    steps(w, 0.4, () => (vmax = Math.max(vmax, w.robotState(0).linvel.x)));
    const spec = w.robots[0].spec;
    const vt = theoreticalTopSpeed(spec.motor.freeRpm, spec.wheels.radius);
    expect(vmax).toBeGreaterThan(vt * 0.9);
    expect(vmax).toBeLessThan(vt * 1.05);
    w.dispose();
  });

  it('gira no próprio eixo quando os lados vão em sentidos opostos', () => {
    const w = new SumoWorld(R, [clonePreset('bloco'), clonePreset('bloco')]);
    w.setPose(0, { x: -0.2, z: 0, yaw: 0 });
    far(w, 1);
    steps(w, 0.2);
    w.setCommand(0, { left: -1, right: 1 });
    steps(w, 0.3);
    const s = w.robotState(0);
    expect(s.angvel.y).toBeGreaterThan(3); // vira para a esquerda
    expect(Math.hypot(s.position.x + 0.2, s.position.z)).toBeLessThan(0.02);
    w.dispose();
  });

  it('sai do dohyo e o "tocar fora" é detectado', () => {
    const w = new SumoWorld(R, [clonePreset('bloco'), clonePreset('bloco')]);
    w.setPose(0, { x: 0.2, z: 0, yaw: 0 });
    far(w, 1);
    steps(w, 0.2);
    expect(w.robotState(0).touchingOutside).toBe(false);
    w.setCommand(0, { left: 1, right: 1 });
    let outAt = -1;
    let overEdge = false;
    for (let i = 0; i < PHYSICS_HZ * 1.5 && outAt < 0; i++) {
      w.step();
      const s = w.robotState(0);
      if (s.wheels.some((wh) => wh.overEdge)) overEdge = true;
      if (s.touchingOutside) outAt = i;
    }
    expect(overEdge).toBe(true);
    expect(outAt).toBeGreaterThan(0);
    w.dispose();
  });

  it('a rampa funciona: a lâmina mais baixa tira peso das rodas do rival', () => {
    // Trator (aresta a 0,2 mm, 20°) contra Bloco (aresta a 0,5 mm)
    const w = new SumoWorld(R, [clonePreset('trator'), clonePreset('bloco')]);
    w.setPose(0, { x: -0.12, z: 0, yaw: 0 });
    w.setPose(1, { x: 0.12, z: 0, yaw: Math.PI });
    steps(w, 0.3);
    w.setCommand(0, { left: 1, right: 1 });
    w.setCommand(1, { left: 1, right: 1 });
    let victimLoadSum = 0;
    let attackerLoadSum = 0;
    let n = 0;
    let firstOut = -1;
    steps(w, 2, () => {
      const s = w.snapshot();
      if (s.inContact) {
        victimLoadSum += s.robots[1].wheelLoadRatio;
        attackerLoadSum += s.robots[0].wheelLoadRatio;
        n++;
      }
      if (firstOut < 0 && (s.robots[0].touchingOutside || s.robots[1].touchingOutside))
        firstOut = s.robots[1].touchingOutside ? 1 : 0;
    });
    expect(n).toBeGreaterThan(50);
    // em média, durante o contato, o rival carrega menos peso nas rodas e o atacante mais
    expect(victimLoadSum / n).toBeLessThan(0.9);
    expect(attackerLoadSum / n).toBeGreaterThan(1.0);
    expect(firstOut).toBe(1);
    w.dispose();
  });
});

describe('posicionamento (Art. 10)', () => {
  it('posições padrão são legais e de frente uma para a outra', () => {
    for (const p of PRESETS) {
      expect(placementIssue(p, defaultPlacement(p, 0), 0)).toBeNull();
      expect(placementIssue(p, defaultPlacement(p, 1), 1)).toBeNull();
    }
  });
  it('não deixa passar da shikiri-sen nem sair da faixa', () => {
    const p = clonePreset('bloco');
    const pose = defaultPlacement(p, 0);
    expect(placementIssue(p, { ...pose, x: pose.x - 0.02 }, 0)).toMatch(/shikiri/);
    expect(placementIssue(p, { ...pose, z: 0.2 }, 0)).toMatch(/faixa/);
    // tentar avançar só desliza até o limite
    let q = pose;
    for (let i = 0; i < 100; i++) q = nudgePlacement(p, q, 0, { forward: 0.1, side: 0, yaw: 0 }, 0.01);
    expect(placementIssue(p, q, 0)).toBeNull();
  });
  it('basta uma parte do robô na faixa, não o robô inteiro', () => {
    const p = clonePreset('bloco');
    const pose = defaultPlacement(p, 0);
    // centro a 9 cm do eixo: só 1 cm do robô fica dentro da faixa de ±5 cm
    expect(placementIssue(p, { ...pose, z: 0.09 }, 0)).toBeNull();
    expect(placementIssue(p, { ...pose, z: -0.09 }, 0)).toBeNull();
    // fora por completo: inválido
    expect(placementIssue(p, { ...pose, z: 0.11 }, 0)).toMatch(/faixa/);
  });

  it('pode encostar sobre a linha marrom, mas não passar dela', () => {
    const p = clonePreset('bloco');
    const onLine = { x: PLACEMENT_LINE_X + p.length / 2, z: 0, yaw: Math.PI };
    expect(placementIssue(p, onLine, 0)).toBeNull();
    expect(placementIssue(p, { ...onLine, x: onLine.x - 0.001 }, 0)).toMatch(/shikiri/);
    // espelhado para o azul
    expect(placementIssue(p, { x: -onLine.x, z: 0, yaw: 0 }, 1)).toBeNull();
    expect(placementIssue(p, { x: -onLine.x + 0.001, z: 0, yaw: 0 }, 1)).toMatch(/shikiri/);
  });

  it('gira mesmo encostado na linha: o robô recua o necessário', () => {
    for (const p of PRESETS) {
      for (const player of [0, 1]) {
        let q = defaultPlacement(p, player);
        for (let i = 0; i < 100; i++) q = nudgePlacement(p, q, player, { forward: 0, side: 0, yaw: 1.6 }, 0.01);
        const start = defaultPlacement(p, player).yaw;
        expect(Math.abs(q.yaw - start)).toBeCloseTo(1.6, 5);
        expect(placementIssue(p, q, player)).toBeNull();
      }
    }
  });

  it('arrastar para qualquer lugar sempre resulta em pose legal e próxima do pedido', () => {
    const p = clonePreset('kunai');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    for (let k = 0; k < 500; k++) {
      const player = k % 2;
      const want = { x: rnd() * 0.5, z: rnd() * 0.5, yaw: rnd() * Math.PI };
      const got = constrainPlacement(p, want, player);
      expect(got).not.toBeNull();
      expect(placementIssue(p, got!, player)).toBeNull();
      expect(got!.yaw).toBe(want.yaw);
    }
    // pedido já válido não é alterado
    const ok = { x: 0.2, z: 0.03, yaw: 2.5 };
    expect(constrainPlacement(p, ok, 0)).toEqual(ok);
    // arrastar para o lado do rival encosta na linha, sem atravessar
    const crossed = constrainPlacement(p, { x: -0.3, z: 0, yaw: Math.PI }, 0)!;
    expect(Math.min(...footprint(p, crossed).map(([x]) => x))).toBeCloseTo(PLACEMENT_LINE_X, 4);
  });

  it('entrada inválida (NaN/Infinity) é rejeitada', () => {
    const p = clonePreset('bloco');
    expect(constrainPlacement(p, { x: NaN, z: 0, yaw: 0 }, 0)).toBeNull();
    expect(constrainPlacement(p, { x: 0.2, z: Infinity, yaw: 0 }, 0)).toBeNull();
    const pose = defaultPlacement(p, 0);
    expect(nudgePlacement(p, pose, 0, { forward: NaN, side: 0, yaw: 0 }, 0.01)).toEqual(pose);
  });

  it('posição em diagonal tocando a faixa é aceita (Fig. 9)', () => {
    const p = clonePreset('bloco');
    expect(placementIssue(p, { x: 0.2, z: 0.09, yaw: Math.PI * 0.75 }, 0)).toBeNull();
  });
});
