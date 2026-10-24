import { PRESETS } from './presets';
import type { RobotSpec } from './types';

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, fallback: string, maxLen: number) => (typeof v === 'string' && v.length ? v.slice(0, maxLen) : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);

/**
 * Normaliza uma spec vinda de fora (localStorage, importação, rede):
 * completa campos ausentes, migra formatos antigos e limita valores a faixas físicas.
 * A caixa de inspeção é quem decide se o robô é LEGAL; aqui só garantimos que é SIMULÁVEL.
 * Retorna null se não der para aproveitar nada.
 */
export function normalizeSpec(raw: unknown): RobotSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const base = PRESETS[1];
  const b = (r.blade ?? {}) as Record<string, any>;
  const w = (r.wheels ?? {}) as Record<string, any>;
  const m = (r.motor ?? {}) as Record<string, any>;
  const angleDeg = num(b.angleDeg, base.blade.angleDeg, 5, 85);
  // v0.1 guardava a ALTURA da lâmina; agora o comprimento ao longo da rampa é o primário
  const legacyLen =
    typeof b.height === 'number' && Number.isFinite(b.height) ? b.height / Math.sin((angleDeg * Math.PI) / 180) : undefined;
  const width = num(r.width, base.width, 0.03, 0.2);
  return {
    id: str(r.id, 'custom-' + Math.random().toString(36).slice(2, 9), 40).replace(/[^\w-]/g, ''),
    name: str(r.name, 'Sem nome', 28),
    bodyColor: color(r.bodyColor, base.bodyColor),
    tireColor: color(r.tireColor, base.tireColor),
    length: num(r.length, base.length, 0.03, 0.2),
    width,
    height: num(r.height, base.height, 0.015, 0.2),
    frontAngleDeg: num(r.frontAngleDeg, base.frontAngleDeg, 10, 90),
    groundClearance: num(r.groundClearance, base.groundClearance, 0.0005, 0.02),
    blade: {
      angleDeg,
      length: num(b.length ?? legacyLen, base.blade.length, 0.003, 0.12),
      width: num(b.width, width, 0.01, 0.2),
      edgeClearance: num(b.edgeClearance, base.blade.edgeClearance, 0, 0.005),
      friction: num(b.friction, base.blade.friction, 0.01, 1.5),
    },
    wheels: {
      count: w.count === 2 ? 2 : 4,
      radius: num(w.radius, base.wheels.radius, 0.005, 0.04),
      width: num(w.width, base.wheels.width, 0.003, 0.04),
      friction: num(w.friction, base.wheels.friction, 0.1, 2),
      covered: typeof w.covered === 'boolean' ? w.covered : true,
      wellGap: num(w.wellGap, 0.002, 0.0005, 0.01),
    },
    motor: {
      freeRpm: num(m.freeRpm, base.motor.freeRpm, 10, 5000),
      stallTorque: num(m.stallTorque, base.motor.stallTorque, 0.005, 2),
    },
    mass: num(r.mass, base.mass, 0.05, 2),
    comX: num(r.comX, base.comX, -0.1, 0.1),
    comY: num(r.comY, base.comY, 0.001, 0.15),
    bodyFriction: num(r.bodyFriction, base.bodyFriction, 0.05, 1.5),
  };
}
