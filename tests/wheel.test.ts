import { describe, expect, it } from 'vitest';
import { motorForce, stepWheel, tireMu, type TireParams, type WheelInput } from '../src/sim/drive';
import {
  MOTOR_PRESETS,
  TIRE_PRESETS,
  applyMotorPreset,
  applyTirePreset,
  motorPresetOf,
  tirePresetOf,
  wheelInertia,
} from '../src/sim/catalog';
import { normalizeSpec } from '../src/sim/specs';
import { inspect } from '../src/sim/inspection';
import { robot } from './fixtures';

const tire: TireParams = { muPeak: 1, slipPeak: 0.12, slideRatio: 0.85 };
const DT = 1 / 480;
const base: WheelInput = {
  u: 1,
  load: 1.2,
  vLong: 0,
  vLat: 0,
  omega: 0,
  radius: 0.015,
  freeOmega: 42,
  stallTorque: 0.08,
  inertia: 2e-5,
  tire,
  effMass: 0.125,
  dt: DT,
};

describe('curva de atrito × escorregamento', () => {
  it('zero sem escorregar, pico em σ_pico, cai para ρ·μ patinando', () => {
    expect(tireMu(0, tire)).toBe(0);
    expect(tireMu(0.12, tire)).toBeCloseTo(1, 6);
    expect(tireMu(50, tire)).toBeCloseTo(0.85, 2);
  });
  it('sobe até o pico e desce depois dele', () => {
    let prev = 0;
    for (let s = 0.005; s <= 0.12; s += 0.005) {
      const m = tireMu(s, tire);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
    for (let s = 0.13; s <= 2; s += 0.05) {
      const m = tireMu(s, tire);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      expect(m).toBeGreaterThanOrEqual(0.85 - 1e-9);
      prev = m;
    }
  });
  it('pneu macio (pico mais tarde) e duro (mais cedo) mudam onde está o pico, não o μ máximo', () => {
    for (const t of TIRE_PRESETS) {
      const p = { muPeak: t.friction, slipPeak: t.slipPeak, slideRatio: t.slideRatio };
      expect(tireMu(t.slipPeak, p)).toBeCloseTo(t.friction, 6);
      expect(tireMu(t.slipPeak * 0.5, p)).toBeLessThan(t.friction);
      expect(tireMu(t.slipPeak * 2, p)).toBeLessThan(t.friction);
    }
  });
});

describe('roda com inércia', () => {
  it('a força nunca passa de μ_pico·N (inclusive com entradas extremas)', () => {
    for (const vLong of [-3, -0.4, 0, 0.2, 3])
      for (const omega of [-300, 0, 40, 300])
        for (const u of [-1, 0, 1])
          for (const vLat of [-1, 0, 0.3]) {
            const o = stepWheel({ ...base, vLong, omega, u, vLat });
            expect(Math.hypot(o.fLong, o.fLat)).toBeLessThanOrEqual(1.2 * 1 + 1.2 * 0.015 + 1e-6);
            expect([o.fLong, o.fLat, o.omega, o.slip].every(Number.isFinite)).toBe(true);
          }
  });

  it('no ar: sem força; acelera até a rotação livre com a constante de tempo do motor', () => {
    // τ = J·ω_livre/T_travamento
    const tau = (base.inertia * base.freeOmega) / base.stallTorque;
    let omega = 0;
    let t = 0;
    while (t < tau) {
      const o = stepWheel({ ...base, load: 0, omega });
      expect(o.fLong).toBe(0);
      omega = o.omega;
      t += DT;
    }
    // 1 − e⁻¹ ≈ 63% em t = τ
    expect(omega / base.freeOmega).toBeGreaterThan(0.55);
    expect(omega / base.freeOmega).toBeLessThan(0.7);
  });

  it('rolando na velocidade livre, o motor quase não empurra', () => {
    const v = base.freeOmega * base.radius;
    const o = stepWheel({ ...base, vLong: v, omega: base.freeOmega });
    expect(Math.abs(o.fLong)).toBeLessThan(0.05);
    expect(Math.abs(o.slip)).toBeLessThan(0.01);
  });

  it('largada com motor forte: a roda patina (passa do pico) e a força fica perto de ρ·μ·N', () => {
    let omega = 0;
    let o = stepWheel({ ...base, stallTorque: 0.4, omega });
    for (let i = 0; i < 20; i++) {
      omega = o.omega;
      o = stepWheel({ ...base, stallTorque: 0.4, omega });
    }
    expect(o.slipping).toBe(true);
    expect(o.slip).toBeGreaterThan(0.12);
    expect(o.fLong).toBeGreaterThan(0.85 * 1.2 * 0.95);
    expect(o.fLong).toBeLessThanOrEqual(1.2);
  });

  it('motor em freio, robô empurrado: a roda segura e a força se opõe ao movimento', () => {
    const o = stepWheel({ ...base, u: 0, vLong: 0.2, omega: 0, holdTorque: 0.15 * base.stallTorque });
    expect(o.fLong).toBeLessThan(0);
    expect(Math.abs(o.omega)).toBeLessThan(0.2 / base.radius);
  });

  it('parado sem comando: ruído de 10 µm/s não vira força relevante (não escorrega sozinho)', () => {
    const o = stepWheel({ ...base, u: 0, vLong: 1e-5, vLat: -1e-5, omega: 0, holdTorque: 0.012 });
    expect(Math.abs(o.fLong)).toBeLessThan(0.02);
    expect(o.omega).toBe(0);
  });

  it('integrado com o corpo: chega à velocidade livre sem oscilar, com inércia pequena ou grande', () => {
    for (const inertia of [1e-7, 2e-5, 5e-4]) {
      let v = 0;
      let omega = 0;
      let peak = 0;
      for (let i = 0; i < 480 * 3; i++) {
        const o = stepWheel({ ...base, inertia, vLong: v, omega });
        v += (o.fLong / base.effMass) * DT;
        omega = o.omega;
        peak = Math.max(peak, v);
      }
      const vFree = base.freeOmega * base.radius;
      expect(v / vFree).toBeGreaterThan(0.9);
      expect(peak / vFree).toBeLessThan(1.01);
    }
  });

  it('determinística: mesma entrada, mesma saída (bit a bit)', () => {
    const a = stepWheel({ ...base, vLong: 0.13, omega: 17.3, vLat: 0.02 });
    const b = stepWheel({ ...base, vLong: 0.13, omega: 17.3, vLat: 0.02 });
    expect(b).toEqual(a);
  });

  it('curva do motor: limite de corrente (nunca mais que o torque de travamento)', () => {
    expect(motorForce(1, -100, 0.015, 42, 0.08)).toBeCloseTo(0.08 / 0.015);
    expect(motorForce(-1, 100, 0.015, 42, 0.08)).toBeCloseTo(-0.08 / 0.015);
    expect(motorForce(1, 42, 0.015, 42, 0.08)).toBeCloseTo(0);
  });
});

describe('catálogo de motores e rodas', () => {
  it('ids únicos e valores físicos', () => {
    expect(new Set(MOTOR_PRESETS.map((m) => m.id)).size).toBe(MOTOR_PRESETS.length);
    for (const m of MOTOR_PRESETS) {
      expect(m.freeRpm).toBeGreaterThan(0);
      expect(m.stallKgfcm).toBeGreaterThan(0);
      expect(m.timeConstant).toBeGreaterThan(0.002);
      expect(m.timeConstant).toBeLessThan(0.05);
    }
    for (const f of ['N20', 'N30', 'JGA16-050']) expect(MOTOR_PRESETS.some((m) => m.family === f)).toBe(true);
  });

  it('em cada linha, mais redução = menos rotação e mais torque (como nas folhas de dados)', () => {
    const lines = new Map<string, typeof MOTOR_PRESETS>();
    for (const m of MOTOR_PRESETS) lines.set(m.family + m.line, [...(lines.get(m.family + m.line) ?? []), m]);
    for (const list of lines.values()) {
      const sorted = [...list].sort((a, b) => a.ratio - b.ratio);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].freeRpm).toBeLessThan(sorted[i - 1].freeRpm);
        expect(sorted[i].stallKgfcm).toBeGreaterThan(sorted[i - 1].stallKgfcm);
        // rotação × redução ≈ rotação do motor (constante na linha, ±20%)
        const m0 = sorted[0].freeRpm * sorted[0].ratio;
        expect(Math.abs(sorted[i].freeRpm * sorted[i].ratio - m0) / m0).toBeLessThan(0.2);
      }
    }
  });

  it('aplicar e reconhecer: cada preset volta como ele mesmo; mexer num valor vira personalizado', () => {
    for (const m of MOTOR_PRESETS) {
      const s = robot('kunai');
      expect(applyMotorPreset(s, m.id)).toBe(true);
      expect(motorPresetOf(s)?.id).toBe(m.id);
      s.motor.freeRpm += 3;
      expect(motorPresetOf(s)).toBeNull();
    }
    for (const t of TIRE_PRESETS) {
      const s = robot('kunai');
      expect(applyTirePreset(s, t.id)).toBe(true);
      expect(tirePresetOf(s)?.id).toBe(t.id);
      s.wheels.friction += 0.05;
      expect(tirePresetOf(s)).toBeNull();
    }
    expect(applyMotorPreset(robot('kunai'), '__proto__')).toBe(false);
    expect(applyTirePreset(robot('kunai'), 'constructor')).toBe(false);
  });

  it('StickyMAX: Ø32 × 21 mm, 23 g; S20 agarra mais que S30', () => {
    const [s20, s30] = ['stickymax-s20', 'stickymax-s30'].map((id) => TIRE_PRESETS.find((t) => t.id === id)!);
    for (const t of [s20, s30]) {
      expect(t.diameter).toBe(0.032);
      expect(t.width).toBe(0.021);
      expect(t.mass).toBe(0.023);
    }
    expect(s20.friction).toBeGreaterThan(s30.friction);
    expect(s20.shoreA).toBeLessThan(s30.shoreA);
  });

  it('inércia refletida cresce com o quadrado da redução', () => {
    const line = MOTOR_PRESETS.filter((m) => m.id.startsWith('n20hp6-'));
    const j = (id: string) => {
      const s = robot('kunai');
      applyMotorPreset(s, id);
      return wheelInertia(s).motor;
    };
    const a = line.find((m) => m.ratio === 30)!;
    const b = line.find((m) => m.ratio === 150)!;
    const ratio = j(b.id) / j(a.id);
    expect(ratio).toBeGreaterThan(25 * 0.7);
    expect(ratio).toBeLessThan(25 * 1.3);
  });

  it('robô com motor e roda do catálogo passa na inspeção', () => {
    const s = robot('kunai');
    applyMotorPreset(s, 'n20hp6-50');
    applyTirePreset(s, 'stickymax-s20');
    s.width = 0.099;
    expect(inspect(s).checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([]);
  });

  it('robôs salvos: campos novos opcionais, limitados quando vêm adulterados', () => {
    const old = normalizeSpec({ ...robot('kunai'), motor: { freeRpm: 600, stallTorque: 0.2 } })!;
    expect(old.motor.timeConstant).toBeUndefined();
    expect(old.wheels.slipPeak).toBeUndefined();
    const bad = normalizeSpec({
      ...robot('kunai'),
      motor: { freeRpm: 600, stallTorque: 0.2, timeConstant: 99 },
      wheels: { ...robot('kunai').wheels, slipPeak: -4, slideRatio: Infinity, mass: 'x' },
    })!;
    expect(bad.motor.timeConstant).toBeLessThanOrEqual(0.08);
    expect(bad.wheels.slipPeak).toBeGreaterThanOrEqual(0.03);
    expect(bad.wheels.slideRatio).toBeUndefined();
    expect(bad.wheels.mass).toBeUndefined();
  });
});
