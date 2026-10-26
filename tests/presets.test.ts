import { describe, expect, it } from 'vitest';
import { PRESETS, clonePreset } from '../src/sim/presets';
import { inspect, PARAMS } from '../src/sim/inspection';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { PHYSICS_HZ } from '../src/sim/modes';
import { resolveSlots } from '../src/ui/storage';
import type { Quat } from '../src/sim/types';
import { robot, softStart } from './fixtures';
import { applyMotorPreset, applyTirePreset, motorPresetOf } from '../src/sim/catalog';
import type { RobotSpec } from '../src/sim/types';

/** Valores lidos no editor nas imagens enviadas (unidades da interface). O motor foi trocado depois,
 *  a pedido, por um motor real do catálogo (ver teste abaixo). */
const FROM_SCREENSHOTS: Record<string, Record<string, number>> = {
  tora: {
    length: 99, width: 99, height: 50, frontAngle: 80, gc: 5,
    bladeAngle: 15, bladeLen: 20.5, bladeH: 5.31, bladeW: 99.5, bladeGap: 0.2, bladeMu: 0.2,
    wheelCount: 2, wheelR: 26, wheelW: 14, wheelCover: 1, wellGap: 2, wheelMu: 1.1,
    mass: 498, comX: -14, comY: 20,
  },
  fuji: {
    length: 99, width: 99, height: 60, frontAngle: 60, gc: 4,
    bladeAngle: 15, bladeLen: 20, bladeH: 5.18, bladeW: 99, bladeGap: 0.2, bladeMu: 0.2,
    wheelCount: 2, wheelR: 22, wheelW: 11, wheelCover: 1, wellGap: 3, wheelMu: 1.1,
    mass: 498, comX: -15.5, comY: 20,
  },
};

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('lista de presets', () => {
  it('Bloco e Trator saíram; ficam Kunai, Tora e Fuji, sem ids repetidos', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['kunai', 'tora', 'fuji']);
    expect(PRESETS.some((p) => /bloco|trator/i.test(p.id + p.name))).toBe(false);
  });

  it('id antigo (trator/bloco) não quebra: cai em um preset válido', () => {
    for (const id of ['trator', 'bloco', '', '__proto__']) expect(PRESETS.some((p) => p.id === clonePreset(id).id)).toBe(true);
  });

  it.each(Object.keys(FROM_SCREENSHOTS))('%s: cada valor do editor bate com a imagem enviada', (id) => {
    const spec = robot(id);
    // só os campos que aparecem nas imagens (os novos campos do pneu e do motor não existiam lá)
    for (const [key, value] of Object.entries(FROM_SCREENSHOTS[id])) {
      const p = PARAMS.find((q) => q.key === key)!;
      expect(p, key).toBeDefined();
      expect(p.toUi(spec), `${id}.${key}`).toBeCloseTo(value, 2);
    }
  });

  it('cada preset usa um motor do catálogo, um de cada família (N20, N30, JGA16-050)', () => {
    const fams = PRESETS.map((p) => {
      const m = motorPresetOf(p);
      expect(m, p.id).not.toBeNull();
      return m!.family;
    });
    expect(new Set(fams)).toEqual(new Set(['N20', 'N30', 'JGA16-050']));
    expect(motorPresetOf(robot('kunai'))!.id).toBe('jga16-6-32');
    expect(motorPresetOf(robot('tora'))!.id).toBe('n30-12-50');
    expect(motorPresetOf(robot('fuji'))!.id).toBe('n20hp6-50');
  });

  it('com motor real nenhum preset dispara o aviso de empinar', () => {
    for (const p of PRESETS) expect(inspect(p).derived.wheelieDeg, p.id).toBeLessThan(15);
  });

  it('cores: Tora laranja, Fuji roxo (pneus como nas imagens)', () => {
    const tora = robot('tora');
    const fuji = robot('fuji');
    expect(hue(tora.bodyColor)).toBeGreaterThan(15);
    expect(hue(tora.bodyColor)).toBeLessThan(40);
    expect(hue(fuji.bodyColor)).toBeGreaterThan(255);
    expect(hue(fuji.bodyColor)).toBeLessThan(290);
    expect(tora.tireColor).toBe('#d1c32e');
    expect(fuji.tireColor).toBe('#2e75d1');
  });

  it.each(PRESETS.map((p) => [p.id]))('%s: passa na inspeção (100 mm, 500 g)', (id) => {
    const r = inspect(robot(id));
    expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
  });
});

describe('Tora e Fuji na física', () => {
  const pitch = (q: Quat) => (Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.y + q.w * q.z)))) * 180) / Math.PI;

  const launch = async (spec: RobotSpec, phases: [seconds: number, target: number][], x0 = -0.3) => {
    const R = await loadRapier();
    const w = new SumoWorld(R, [spec, robot('bloco')]);
    w.setPose(0, { x: x0, z: 0, yaw: 0 });
    w.setPose(1, { x: 0.3, z: 0.3, yaw: 0 });
    const ramp = softStart();
    let hi = 0;
    let lo = 0;
    for (const [sec, target] of phases)
      for (let i = 0; i < sec * PHYSICS_HZ; i++) {
        const u = ramp(target);
        w.setCommand(0, { left: u, right: u });
        w.step();
        const p = pitch(w.robotState(0).rotation);
        hi = Math.max(hi, p);
        lo = Math.min(lo, p);
      }
    const end = w.robotState(0);
    w.dispose();
    return { hi, lo, end };
  };

  it.each(PRESETS.map((p) => [p.id]))('%s: com partida suave pode empinar na largada, mas não capota e volta às rodas', async (id) => {
    const { hi, end } = await launch(robot(id), [[0.3, 0], [0.8, 1]]);
    expect(hi).toBeLessThan(60);
    expect(Math.abs(pitch(end.rotation))).toBeLessThan(3);
    expect(end.wheels.every((wh) => wh.load > 0)).toBe(true);
  });

  it('frear de ré a 100%: mais inércia no rotor (τ maior) empina mais — é a reação no chassi', async () => {
    // motor forte de propósito (o antigo do Tora, 670 RPM / 4,4 kgf·cm): é o caso em que a reação aparece
    const run = (tau: number) => {
      const s = robot('tora');
      s.motor = { freeRpm: 670, stallTorque: 4.4 * 0.0980665, timeConstant: tau };
      return launch(s, [[0.3, 0], [0.6, -1], [0.5, 0]], 0.25);
    };
    const small = await run(0.002);
    const big = await run(0.015);
    expect(big.hi).toBeGreaterThan(small.hi + 10);
  });

  it('o mesmo robô com motor e roda reais do catálogo empina pouco mesmo com largada e inversão secas', async () => {
    const s = robot('tora');
    applyMotorPreset(s, 'jga16-6-25');
    applyTirePreset(s, 'stickymax-s20');
    s.width = 0.099;
    const R = await loadRapier();
    const w = new SumoWorld(R, [s, robot('bloco')]);
    w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
    w.setPose(1, { x: 0.3, z: 0.3, yaw: 0 });
    let hi = 0;
    for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
    for (const u of [1, -1, 0])
      for (let i = 0; i < 0.5 * PHYSICS_HZ; i++) {
        w.setCommand(0, { left: u, right: u });
        w.step();
        hi = Math.max(hi, Math.abs(pitch(w.robotState(0).rotation)));
      }
    w.dispose();
    expect(hi).toBeLessThan(15);
  });
});

describe('lados salvos com robôs que não existem mais', () => {
  const ids = ['kunai', 'tora', 'fuji', 'custom-abc'];
  const defaults = ['tora', 'fuji'] as const;

  it('configuração antiga (trator × kunai) vira robôs válidos e diferentes', () => {
    expect(resolveSlots('trator', 'kunai', ids, defaults)).toEqual(['tora', 'kunai']);
    expect(resolveSlots('trator', 'bloco', ids, defaults)).toEqual(['tora', 'fuji']);
    expect(resolveSlots('kunai', 'bloco', ids, defaults)).toEqual(['kunai', 'fuji']);
  });

  it('se o padrão já está do outro lado, pega o próximo diferente', () => {
    expect(resolveSlots('bloco', 'tora', ids, defaults)).toEqual(['kunai', 'tora']);
    expect(resolveSlots('fuji', 'trator', ids, defaults)).toEqual(['fuji', 'kunai']);
  });

  it('escolhas válidas (inclusive o mesmo robô dos dois lados) são mantidas', () => {
    expect(resolveSlots('custom-abc', 'kunai', ids, defaults)).toEqual(['custom-abc', 'kunai']);
    expect(resolveSlots('fuji', 'fuji', ids, defaults)).toEqual(['fuji', 'fuji']);
  });

  it('valores adulterados (tipo errado, protótipo) são trocados', () => {
    for (const bad of [null, 42, {}, '__proto__', 'constructor', '<img src=x>'])
      expect(resolveSlots(bad, bad, ids, defaults)).toEqual(['tora', 'fuji']);
  });

  it('lista com um robô só não trava', () => {
    expect(resolveSlots('x', 'y', ['kunai'], defaults)).toEqual(['kunai', 'kunai']);
  });
});
