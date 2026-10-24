import { describe, expect, it } from 'vitest';
import { buildRobotGeometry } from '../src/sim/geometry';
import { clonePreset, PRESETS } from '../src/sim/presets';
import { inspect } from '../src/sim/inspection';
import { normalizeSpec } from '../src/sim/specs';

const pts3 = (flat: number[]) => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
};

describe('rodas embutidas na chassi (caixas de roda)', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: lateral envolve a roda com folga radial e lateral', (_id, p) => {
    const g = buildRobotGeometry(p);
    const gap = p.wheels.wellGap!;
    expect(g.shell).not.toBeNull();
    const sh = g.shell!;
    // a lateral vai até a largura total; a roda fica 0,5 mm para dentro
    expect(sh.zOuter).toBeCloseTo(p.width / 2, 9);
    for (const w of g.wheels) {
      expect(Math.abs(w.z) + w.width / 2).toBeLessThanOrEqual(p.width / 2);
      // folga lateral entre a roda e o núcleo da chassi
      expect(Math.abs(w.z) - w.width / 2 - sh.zInner).toBeCloseTo(gap, 9);
    }
    // folga radial: nenhum ponto da lateral (render) chega mais perto que r + folga do centro da roda
    for (const piece of sh.pieces)
      for (const [x, y] of piece)
        for (const w of g.wheels) expect(Math.hypot(x - w.x, y - w.y)).toBeGreaterThanOrEqual(w.radius + gap - 1e-6);
    // idem para os pontos dos colisores da física
    for (const h of sh.hulls)
      for (const [x, y, z] of pts3(h)) {
        expect(Math.abs(z)).toBeLessThanOrEqual(p.width / 2 + 1e-9);
        for (const w of g.wheels) expect(Math.hypot(x - w.x, y - w.y)).toBeGreaterThanOrEqual(w.radius + gap - 1e-6);
      }
    // os colisores cobrem os dois lados
    expect(sh.hulls.some((h) => h[2] > 0)).toBe(true);
    expect(sh.hulls.some((h) => h[2] < 0)).toBe(true);
  });

  it('a caixa de roda é aberta embaixo (a roda encosta no chão) e redonda em cima', () => {
    const p = clonePreset('bloco');
    const g = buildRobotGeometry(p);
    const w = g.wheels[0];
    const R = w.radius + p.wheels.wellGap!;
    const lower = g.shell!.pieces.flatMap((pc) => pc).filter(([x]) => Math.abs(x - w.x) < R * 0.98);
    // sobre a roda só existe lateral acima do arco
    for (const [x, y] of lower) expect(y).toBeGreaterThanOrEqual(w.y + Math.sqrt(R * R - (x - w.x) ** 2) - 1e-6);
    expect(Math.min(...lower.map(([, y]) => y))).toBeGreaterThan(p.groundClearance);
  });

  it('a física fiel ao arco: erro da corda < 0,6 mm', () => {
    const p = clonePreset('kunai');
    const R = p.wheels.radius + p.wheels.wellGap!;
    const slice = (2 * R) / 6;
    expect((R - Math.sqrt(R * R - (slice / 2) ** 2)) * 1000).toBeLessThan(0.6);
  });

  it('desligado: rodas por fora como antes, sem lateral', () => {
    const p = clonePreset('bloco');
    p.wheels.covered = false;
    const g = buildRobotGeometry(p);
    expect(g.shell).toBeNull();
    expect(Math.abs(g.wheels[0].z)).toBeCloseTo(p.width / 2 - p.wheels.width / 2, 9);
  });

  it('roda mais alta que a frente inclinada vira aviso, não reprovação', () => {
    const r = inspect(clonePreset('trator'));
    expect(r.ok).toBe(true);
    expect(r.checks.some((c) => c.note && /roda dianteira/.test(c.detail))).toBe(true);
  });

  it('a folga da caixa de roda muda o arco e continua dentro da caixa de inspeção', () => {
    const p = clonePreset('kunai');
    p.wheels.wellGap = 0.005;
    const g = buildRobotGeometry(p);
    expect(g.shell!.archRadius).toBeCloseTo(p.wheels.radius + 0.005, 9);
    expect(inspect(p).checks.find((c) => c.id === 'width')!.ok).toBe(true);
  });

  it('robôs salvos antes desta versão ganham rodas embutidas e folga padrão', () => {
    const old = structuredClone(clonePreset('bloco')) as any;
    delete old.wheels.covered;
    delete old.wheels.wellGap;
    const s = normalizeSpec(old)!;
    expect(s.wheels.covered).toBe(true);
    expect(s.wheels.wellGap).toBe(0.002);
    expect(normalizeSpec({ ...old, wheels: { ...old.wheels, covered: 'sim', wellGap: 99 } })!.wheels).toMatchObject({ covered: true, wellGap: 0.01 });
  });
});
