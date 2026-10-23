import { describe, expect, it } from 'vitest';
import { normalizeSpec } from '../src/sim/specs';
import { bladeHeight, clonePreset, PRESETS } from '../src/sim/presets';
import { buildRobotGeometry } from '../src/sim/geometry';
import { inspect, PARAMS } from '../src/sim/inspection';

describe('lâmina: comprimento, largura e altura', () => {
  it('altura = comprimento × sen(ângulo) e os presets mantêm a altura da v0.1', () => {
    expect(bladeHeight(clonePreset('trator')) * 1000).toBeCloseTo(10, 1);
    expect(bladeHeight(clonePreset('bloco')) * 1000).toBeCloseTo(14, 1);
    expect(bladeHeight(clonePreset('kunai')) * 1000).toBeCloseTo(12, 1);
  });

  it('a largura da lâmina vira a largura do casco da lâmina', () => {
    const s = clonePreset('trator');
    s.blade.width = 0.06;
    const g = buildRobotGeometry(s);
    const zs = g.bladeHull.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.06, 6);
  });

  it('lâmina mais larga que o robô conta na caixa de inspeção', () => {
    const s = clonePreset('bloco');
    s.blade.width = 0.105;
    const r = inspect(s);
    expect(r.checks.find((c) => c.id === 'width')!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'width')!.detail).toMatch(/lâmina/);
  });

  it('lâmina longa demais reprova (sobra pouco chassi)', () => {
    const s = clonePreset('trator');
    s.blade.length = 0.06;
    expect(inspect(s).checks.find((c) => c.id === 'geom')!.ok).toBe(false);
  });

  it('editor: mudar a altura recalcula o comprimento (mesmo ângulo)', () => {
    const s = clonePreset('trator');
    const h = PARAMS.find((p) => p.key === 'bladeH')!;
    const len = PARAMS.find((p) => p.key === 'bladeLen')!;
    h.apply(s, 14);
    expect(h.toUi(s)).toBeCloseTo(14, 1);
    expect(len.toUi(s)).toBeCloseTo(14 / Math.sin((20 * Math.PI) / 180), 0);
  });
});

describe('normalização de robôs salvos (localStorage)', () => {
  it('migra o formato antigo (altura da lâmina) para comprimento', () => {
    const old = { ...clonePreset('trator'), blade: { angleDeg: 20, height: 0.01, edgeClearance: 0.0002, friction: 0.18 } };
    const s = normalizeSpec(old)!;
    expect(s.blade.length * 1000).toBeCloseTo(29.2, 0);
    expect(s.blade.width).toBe(old.width);
  });

  it('valores inválidos viram padrões/limites; textos não viram HTML', () => {
    const s = normalizeSpec({
      id: '<img src=x onerror=alert(1)>',
      name: '<script>alert(1)</script>'.repeat(5),
      bodyColor: 'red;background:url(x)',
      length: NaN,
      mass: 1e9,
      wheels: { count: 99, radius: -1 },
      motor: { freeRpm: Infinity },
    })!;
    expect(s.id).toMatch(/^[\w-]+$/);
    expect(s.name.length).toBeLessThanOrEqual(28);
    expect(s.bodyColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Number.isFinite(s.length)).toBe(true);
    expect(s.mass).toBeLessThanOrEqual(2);
    expect(s.wheels.count).toBe(4);
    expect(s.wheels.radius).toBeGreaterThan(0);
    expect(Number.isFinite(s.motor.freeRpm)).toBe(true);
    expect(buildRobotGeometry(s).bodyHull.every(Number.isFinite)).toBe(true);
  });

  it('lixo é descartado', () => {
    expect(normalizeSpec(null)).toBeNull();
    expect(normalizeSpec('robô')).toBeNull();
    expect(normalizeSpec(42)).toBeNull();
  });

  it('presets passam pela normalização sem mudar', () => {
    for (const p of PRESETS) expect(normalizeSpec(p)).toEqual(p);
  });
});
