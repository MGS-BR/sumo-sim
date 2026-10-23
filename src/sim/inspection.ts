import { buildRobotGeometry, staticWheelLoadFraction } from './geometry';
import { theoreticalTopSpeed } from './drive';
import { GRAVITY } from './arena';
import type { RobotSpec } from './types';

/**
 * "Caixa de inspeção" do Mini Sumô (500g) — Regulamento RoboCore Art. 4:
 *  - comprimento e largura ≤ 10 cm (altura livre)
 *  - massa ≤ 500 g, sem tolerância de balança
 *  - nenhum dispositivo de fixação ao dohyo (não simulado: não existe na sim)
 */
export const LIMITS = {
  maxLength: 0.1,
  maxWidth: 0.1,
  maxMass: 0.5,
} as const;

export interface InspectionCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface InspectionResult {
  ok: boolean;
  checks: InspectionCheck[];
  derived: {
    topSpeed: number; // m/s
    wheelLoadFraction: number;
    maxTraction: number; // N (μ·N nas rodas)
    motorForce: number; // N (soma do torque de travamento / raio)
    tractionLimited: boolean;
  };
}

const mm = (v: number) => `${(v * 1000).toFixed(1)} mm`;

export function inspect(spec: RobotSpec): InspectionResult {
  const geom = buildRobotGeometry(spec);
  const lengthOk = geom.bounds.maxX - geom.bounds.minX <= LIMITS.maxLength + 1e-9;
  const widthOk = geom.bounds.maxZ - geom.bounds.minZ <= LIMITS.maxWidth + 1e-9;
  const massOk = spec.mass <= LIMITS.maxMass + 1e-9;
  const comInside =
    spec.comX > geom.bounds.minX && spec.comX < geom.bounds.maxX && spec.comY > 0 && spec.comY < geom.bounds.maxY;

  const checks: InspectionCheck[] = [
    { id: 'length', label: 'Comprimento ≤ 100 mm', ok: lengthOk, detail: mm(spec.length) },
    { id: 'width', label: 'Largura ≤ 100 mm', ok: widthOk, detail: mm(spec.width) },
    { id: 'mass', label: 'Massa ≤ 500 g', ok: massOk, detail: `${(spec.mass * 1000).toFixed(0)} g` },
    { id: 'com', label: 'Centro de massa dentro do robô', ok: comInside, detail: `x ${mm(spec.comX)}, y ${mm(spec.comY)}` },
    {
      id: 'geom',
      label: 'Geometria construível',
      ok: geom.issues.length === 0,
      detail: geom.issues.length ? geom.issues.join('; ') : 'ok',
    },
  ];

  const frac = staticWheelLoadFraction(spec, geom);
  const motors = geom.wheels.length;
  const motorForce = (motors * spec.motor.stallTorque) / spec.wheels.radius;
  const maxTraction = spec.wheels.friction * frac * spec.mass * GRAVITY;
  return {
    ok: checks.every((c) => c.ok),
    checks,
    derived: {
      topSpeed: theoreticalTopSpeed(spec.motor.freeRpm, spec.wheels.radius),
      wheelLoadFraction: frac,
      maxTraction,
      motorForce,
      tractionLimited: motorForce > maxTraction,
    },
  };
}

/** Faixas aceitas pelo editor (unidades de UI). O regulamento só limita o que está em LIMITS. */
export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** de SI para UI */
  toUi: (s: RobotSpec) => number;
  /** aplica valor de UI no spec */
  apply: (s: RobotSpec, v: number) => void;
  group: 'Dimensões' | 'Lâmina' | 'Rodas' | 'Motor' | 'Massa';
  hint?: string;
}

const m2mm = (v: number) => +(v * 1000).toFixed(2);
const mm2m = (v: number) => v / 1000;

export const PARAMS: ParamDef[] = [
  { key: 'length', group: 'Dimensões', label: 'Comprimento', unit: 'mm', min: 60, max: 110, step: 0.5, toUi: (s) => m2mm(s.length), apply: (s, v) => (s.length = mm2m(v)), hint: 'Limite 100 mm' },
  { key: 'width', group: 'Dimensões', label: 'Largura', unit: 'mm', min: 60, max: 110, step: 0.5, toUi: (s) => m2mm(s.width), apply: (s, v) => (s.width = mm2m(v)), hint: 'Limite 100 mm (inclui rodas)' },
  { key: 'height', group: 'Dimensões', label: 'Altura', unit: 'mm', min: 25, max: 100, step: 1, toUi: (s) => m2mm(s.height), apply: (s, v) => (s.height = mm2m(v)) },
  { key: 'frontAngle', group: 'Dimensões', label: 'Ângulo da frente', unit: '°', min: 15, max: 90, step: 1, toUi: (s) => s.frontAngleDeg, apply: (s, v) => (s.frontAngleDeg = v), hint: 'Baixo = cunha, 90 = caixa' },
  { key: 'gc', group: 'Dimensões', label: 'Folga do chassi', unit: 'mm', min: 1, max: 10, step: 0.5, toUi: (s) => m2mm(s.groundClearance), apply: (s, v) => (s.groundClearance = mm2m(v)) },
  { key: 'bladeAngle', group: 'Lâmina', label: 'Ângulo da lâmina', unit: '°', min: 10, max: 60, step: 1, toUi: (s) => s.blade.angleDeg, apply: (s, v) => (s.blade.angleDeg = v), hint: 'Menor = entra mais fácil por baixo, levanta menos' },
  { key: 'bladeH', group: 'Lâmina', label: 'Altura da lâmina', unit: 'mm', min: 4, max: 30, step: 0.5, toUi: (s) => m2mm(s.blade.height), apply: (s, v) => (s.blade.height = mm2m(v)) },
  { key: 'bladeGap', group: 'Lâmina', label: 'Folga da aresta', unit: 'mm', min: 0, max: 3, step: 0.05, toUi: (s) => m2mm(s.blade.edgeClearance), apply: (s, v) => (s.blade.edgeClearance = mm2m(v)), hint: 'Quem tem a aresta mais baixa entra por baixo' },
  { key: 'bladeMu', group: 'Lâmina', label: 'Atrito da lâmina', unit: 'μ', min: 0.05, max: 0.8, step: 0.01, toUi: (s) => s.blade.friction, apply: (s, v) => (s.blade.friction = v) },
  { key: 'wheelCount', group: 'Rodas', label: 'Nº de rodas', unit: '', min: 2, max: 4, step: 2, toUi: (s) => s.wheels.count, apply: (s, v) => (s.wheels.count = v >= 3 ? 4 : 2) },
  { key: 'wheelR', group: 'Rodas', label: 'Diâmetro', unit: 'mm', min: 16, max: 50, step: 0.5, toUi: (s) => m2mm(s.wheels.radius * 2), apply: (s, v) => (s.wheels.radius = mm2m(v) / 2) },
  { key: 'wheelW', group: 'Rodas', label: 'Largura do pneu', unit: 'mm', min: 5, max: 25, step: 0.5, toUi: (s) => m2mm(s.wheels.width), apply: (s, v) => (s.wheels.width = mm2m(v)) },
  { key: 'wheelMu', group: 'Rodas', label: 'Atrito do pneu', unit: 'μ', min: 0.4, max: 1.6, step: 0.01, toUi: (s) => s.wheels.friction, apply: (s, v) => (s.wheels.friction = v), hint: 'Silicone limpo na fórmica ≈ 1,0–1,3' },
  { key: 'rpm', group: 'Motor', label: 'Rotação livre', unit: 'RPM', min: 100, max: 2000, step: 10, toUi: (s) => s.motor.freeRpm, apply: (s, v) => (s.motor.freeRpm = v) },
  { key: 'stall', group: 'Motor', label: 'Torque de travamento', unit: 'kgf·cm', min: 0.3, max: 10, step: 0.1, toUi: (s) => +(s.motor.stallTorque / 0.0980665).toFixed(2), apply: (s, v) => (s.motor.stallTorque = v * 0.0980665), hint: 'Por motor (1 motor por roda)' },
  { key: 'mass', group: 'Massa', label: 'Massa', unit: 'g', min: 150, max: 600, step: 1, toUi: (s) => Math.round(s.mass * 1000), apply: (s, v) => (s.mass = v / 1000), hint: 'Limite 500 g' },
  { key: 'comX', group: 'Massa', label: 'CG (frente/trás)', unit: 'mm', min: -45, max: 45, step: 0.5, toUi: (s) => m2mm(s.comX), apply: (s, v) => (s.comX = mm2m(v)), hint: '+ = para a frente' },
  { key: 'comY', group: 'Massa', label: 'CG (altura)', unit: 'mm', min: 3, max: 60, step: 0.5, toUi: (s) => m2mm(s.comY), apply: (s, v) => (s.comY = mm2m(v)) },
];
