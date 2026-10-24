import { describe, expect, it } from 'vitest';
import { engineMix } from '../src/audio';
import { clonePreset } from '../src/sim/presets';
import type { RobotState } from '../src/sim/types';

const spec = clonePreset('trator');
const free = (spec.motor.freeRpm * 2 * Math.PI) / 60;
const robot = (u: number, ratio: number, freeOmega = free): RobotState => ({
  position: { x: 0, y: 0.025, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linvel: { x: 0, y: 0, z: 0 },
  angvel: { x: 0, y: 0, z: 0 },
  yaw: 0,
  wheels: Array.from({ length: 4 }, () => ({ load: 1, traction: 0, lateral: 0, slipping: false, spin: 0, omega: ratio * freeOmega, contact: null, onOutsideFloor: false, overEdge: false })),
  wheelLoadRatio: 1,
  touchingOutside: false,
  outsidePoint: null,
  fallen: false,
  drive: { left: u, right: u },
});

describe('voz do motor', () => {
  it('silêncio com motor desligado e parado', () => {
    const m = engineMix(robot(0, 0), spec);
    expect(m.body + m.gear + m.pwm + m.brush).toBe(0);
  });
  it('o tom sobe com a rotação', () => {
    const hz = [0, 0.25, 0.5, 1].map((r) => engineMix(robot(1, r), spec).rotorHz);
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeGreaterThan(hz[i - 1]);
  });
  it('travado empurrando: o apito do PWM domina (corrente alta)', () => {
    const stall = engineMix(robot(1, 0), spec);
    const cruise = engineMix(robot(1, 1), spec);
    expect(stall.pwm).toBeGreaterThan(cruise.pwm * 3);
    expect(cruise.body).toBeGreaterThan(stall.body);
  });
  it('motor mais rápido soa mais agudo', () => {
    const fast = clonePreset('kunai'); // 800 RPM
    const fastFree = (fast.motor.freeRpm * 2 * Math.PI) / 60;
    expect(engineMix(robot(1, 1, fastFree), fast).rotorHz).toBeGreaterThan(engineMix(robot(1, 1), spec).rotorHz);
  });
  it('valores sempre finitos e dentro de faixas seguras', () => {
    for (const u of [0, 0.3, 1]) for (const r of [0, 0.5, 1, 3]) {
      const m = engineMix(robot(u, r), spec);
      for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
      expect(m.body + m.gear + m.pwm + m.brush).toBeLessThan(0.15);
    }
  });
});
