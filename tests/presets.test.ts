import { describe, expect, it } from 'vitest';
import { PRESETS, clonePreset } from '../src/sim/presets';
import { inspect, PARAMS } from '../src/sim/inspection';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { PHYSICS_HZ } from '../src/sim/modes';
import { resolveSlots } from '../src/ui/storage';
import type { Quat } from '../src/sim/types';
import { robot } from './fixtures';

/** Valores lidos no editor nas imagens enviadas (unidades da interface). */
const FROM_SCREENSHOTS: Record<string, Record<string, number>> = {
  tora: {
    length: 99, width: 99, height: 50, frontAngle: 80, gc: 5,
    bladeAngle: 15, bladeLen: 20.5, bladeH: 5.31, bladeW: 99.5, bladeGap: 0.2, bladeMu: 0.2,
    wheelCount: 2, wheelR: 26, wheelW: 14, wheelCover: 1, wellGap: 2, wheelMu: 1.1,
    rpm: 670, stall: 4.4, mass: 498, comX: -14, comY: 20,
  },
  fuji: {
    length: 99, width: 99, height: 60, frontAngle: 60, gc: 4,
    bladeAngle: 15, bladeLen: 20, bladeH: 5.18, bladeW: 99, bladeGap: 0.2, bladeMu: 0.2,
    wheelCount: 2, wheelR: 22, wheelW: 11, wheelCover: 1, wellGap: 3, wheelMu: 1.1,
    rpm: 400, stall: 3.7, mass: 498, comX: -15.5, comY: 20,
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
    for (const p of PARAMS) expect(p.toUi(spec), `${id}.${p.key}`).toBeCloseTo(FROM_SCREENSHOTS[id][p.key], 2);
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

  it.each([['tora'], ['fuji']])('%s: não empina nem afunda o nariz ao arrancar e inverter a 100%%', async (id) => {
    const R = await loadRapier();
    const w = new SumoWorld(R, [robot(id), robot('bloco')]);
    w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
    w.setPose(1, { x: 0.3, z: 0.3, yaw: 0 });
    const run = (s: number, f: () => void = () => {}) => { for (let i = 0; i < s * PHYSICS_HZ; i++) { w.step(); f(); } };
    run(0.4);
    let lo = 0, hi = 0;
    const track = () => { const p = pitch(w.robotState(0).rotation); lo = Math.min(lo, p); hi = Math.max(hi, p); };
    w.setCommand(0, { left: 1, right: 1 });
    run(0.5, track);
    w.setCommand(0, { left: -1, right: -1 });
    run(0.3, track);
    expect(hi).toBeLessThan(3);
    expect(lo).toBeGreaterThan(-3);
    expect(w.robotState(0).wheels.every((wh) => wh.load > 0)).toBe(true);
    w.dispose();
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
