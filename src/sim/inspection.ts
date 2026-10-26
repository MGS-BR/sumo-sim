import { buildRobotGeometry, staticWheelLoadFraction } from './geometry';
import { theoreticalTopSpeed } from './drive';
import { GRAVITY } from './arena';
import type { RobotSpec } from './types';
import { bladeDepth, bladeHeight } from './presets';
import { MOTOR_DEFAULTS, WHEEL_DEFAULTS, batteryOf, effectiveMotor, wheelInertia, wheelMass } from './catalog';

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
  /** aviso informativo: não reprova */
  note?: boolean;
}

export interface InspectionResult {
  ok: boolean;
  checks: InspectionCheck[];
  derived: {
    bladeHeight: number;
    bladeDepth: number;
    topSpeed: number; // m/s
    wheelLoadFraction: number;
    maxTraction: number; // N (μ·N nas rodas)
    motorForce: number; // N (soma do torque de travamento / raio)
    tractionLimited: boolean;
    /** quanto o robô empina numa largada a 100% sem rampa (graus, estimativa) */
    wheelieDeg: number;
  };
}

const mm = (v: number) => `${(v * 1000).toFixed(1)} mm`;

/** Acima disso o editor avisa que o robô empina na largada */
export const WHEELIE_WARN_DEG = 15;

/**
 * Estimativa de quanto o robô empina numa largada a 100% sem rampa. O motor acelera rotor
 * e roda de 0 à rotação livre e devolve ao chassi o momento angular n·J·ω_livre; o chassi gira
 * em torno do eixo de trás até o peso (m·g·d) segurar. θ ≈ (n·J·ω)² / (2·I·m·g·d).
 * O simulador calcula isso de verdade; aqui é a conta de bolso para o editor.
 */
export function wheelieEstimate(spec: RobotSpec, geom = buildRobotGeometry(spec)): number {
  if (!geom.wheels.length) return 0;
  const rearX = Math.min(...geom.wheels.map((w) => w.x));
  const d = spec.comX - rearX;
  if (d <= 0) return 90;
  const omega = (effectiveMotor(spec).freeRpm * 2 * Math.PI) / 60;
  const L = geom.wheels.length * wheelInertia(spec).total * omega;
  const m = spec.mass;
  const iCom = (m * (spec.length ** 2 + spec.height ** 2)) / 12;
  const iPivot = iCom + m * (d * d + spec.comY * spec.comY);
  const theta = (L * L) / (2 * iPivot * m * GRAVITY * d);
  return Math.min(90, (theta * 180) / Math.PI);
}

export function inspect(spec: RobotSpec): InspectionResult {
  const geom = buildRobotGeometry(spec);
  const wheelie = wheelieEstimate(spec, geom);
  const lengthOk = geom.bounds.maxX - geom.bounds.minX <= LIMITS.maxLength + 1e-9;
  const widthOk = geom.bounds.maxZ - geom.bounds.minZ <= LIMITS.maxWidth + 1e-9;
  const massOk = spec.mass <= LIMITS.maxMass + 1e-9;
  const comInside =
    spec.comX > geom.bounds.minX && spec.comX < geom.bounds.maxX && spec.comY > 0 && spec.comY < geom.bounds.maxY;

  const checks: InspectionCheck[] = [
    { id: 'length', label: 'Comprimento ≤ 100 mm', ok: lengthOk, detail: mm(spec.length) },
    {
      id: 'width',
      label: 'Largura ≤ 100 mm',
      ok: widthOk,
      detail: `${mm(geom.bounds.maxZ - geom.bounds.minZ)}${spec.blade.width > spec.width ? ' (lâmina)' : ''}`,
    },
    { id: 'mass', label: 'Massa ≤ 500 g', ok: massOk, detail: `${(spec.mass * 1000).toFixed(0)} g` },
    { id: 'com', label: 'Centro de massa dentro do robô', ok: comInside, detail: `x ${mm(spec.comX)}, y ${mm(spec.comY)}` },
    ...geom.notes.map((n, k) => ({ id: `nota${k}`, label: 'Aviso', ok: true, detail: n, note: true })),
    ...(wheelie > WHEELIE_WARN_DEG
      ? [{ id: 'empina', label: 'Aviso', ok: true, note: true, detail: `largada a 100% sem rampa pode empinar ~${Math.round(wheelie)}°: avance o CG ou use partida suave` }]
      : []),
    {
      id: 'geom',
      label: 'Geometria construível',
      ok: geom.issues.length === 0,
      detail: geom.issues.length ? geom.issues.join('; ') : 'ok',
    },
  ];

  const frac = staticWheelLoadFraction(spec, geom);
  const motors = geom.wheels.length;
  const eff = effectiveMotor(spec);
  const motorForce = (motors * eff.stallTorque) / spec.wheels.radius;
  const maxTraction = spec.wheels.friction * frac * spec.mass * GRAVITY;
  return {
    ok: checks.every((c) => c.ok),
    checks,
    derived: {
      bladeHeight: bladeHeight(spec),
      bladeDepth: bladeDepth(spec),
      topSpeed: theoreticalTopSpeed(eff.freeRpm, spec.wheels.radius),
      wheelLoadFraction: frac,
      maxTraction,
      motorForce,
      tractionLimited: motorForce > maxTraction,
      wheelieDeg: wheelie,
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
  /** 'toggle' = liga/desliga (valor 0/1) */
  kind?: 'toggle';
}

const m2mm = (v: number) => +(v * 1000).toFixed(2);
const mm2m = (v: number) => v / 1000;

export const PARAMS: ParamDef[] = [
  { key: 'length', group: 'Dimensões', label: 'Comprimento', unit: 'mm', min: 60, max: 110, step: 0.5, toUi: (s) => m2mm(s.length), apply: (s, v) => (s.length = mm2m(v)), hint: 'Limite 100 mm' },
  { key: 'width', group: 'Dimensões', label: 'Largura do robô', unit: 'mm', min: 60, max: 110, step: 0.5, toUi: (s) => m2mm(s.width), apply: (s, v) => (s.width = mm2m(v)), hint: 'Limite 100 mm (inclui rodas)' },
  { key: 'height', group: 'Dimensões', label: 'Altura', unit: 'mm', min: 25, max: 100, step: 1, toUi: (s) => m2mm(s.height), apply: (s, v) => (s.height = mm2m(v)) },
  { key: 'frontAngle', group: 'Dimensões', label: 'Ângulo da frente', unit: '°', min: 15, max: 90, step: 1, toUi: (s) => s.frontAngleDeg, apply: (s, v) => (s.frontAngleDeg = v), hint: 'Baixo = cunha, 90 = caixa' },
  { key: 'gc', group: 'Dimensões', label: 'Folga do chassi', unit: 'mm', min: 1, max: 10, step: 0.5, toUi: (s) => m2mm(s.groundClearance), apply: (s, v) => (s.groundClearance = mm2m(v)) },
  { key: 'bladeAngle', group: 'Lâmina', label: 'Ângulo da lâmina', unit: '°', min: 10, max: 60, step: 1, toUi: (s) => s.blade.angleDeg, apply: (s, v) => (s.blade.angleDeg = v), hint: 'Menor = entra mais fácil por baixo, levanta menos' },
  { key: 'bladeLen', group: 'Lâmina', label: 'Comprimento da lâmina', unit: 'mm', min: 6, max: 60, step: 0.5, toUi: (s) => m2mm(s.blade.length), apply: (s, v) => (s.blade.length = mm2m(v)), hint: 'Ao longo da rampa. Mais longa = levanta mais, mas rouba chassi' },
  { key: 'bladeH', group: 'Lâmina', label: 'Altura da lâmina', unit: 'mm', min: 2, max: 40, step: 0.5, toUi: (s) => m2mm(bladeHeight(s)), apply: (s, v) => (s.blade.length = mm2m(v) / Math.sin((s.blade.angleDeg * Math.PI) / 180)), hint: 'Ligada ao comprimento: altura = comprimento × sen(ângulo)' },
  { key: 'bladeW', group: 'Lâmina', label: 'Largura da lâmina', unit: 'mm', min: 30, max: 110, step: 0.5, toUi: (s) => m2mm(s.blade.width), apply: (s, v) => (s.blade.width = mm2m(v)), hint: 'Mais estreita deixa as quinas expostas (e as rodas, se não forem embutidas)' },
  { key: 'bladeGap', group: 'Lâmina', label: 'Folga da aresta', unit: 'mm', min: 0, max: 3, step: 0.05, toUi: (s) => m2mm(s.blade.edgeClearance), apply: (s, v) => (s.blade.edgeClearance = mm2m(v)), hint: 'Quem tem a aresta mais baixa entra por baixo' },
  { key: 'bladeMu', group: 'Lâmina', label: 'Atrito da lâmina', unit: 'μ', min: 0.05, max: 0.8, step: 0.01, toUi: (s) => s.blade.friction, apply: (s, v) => (s.blade.friction = v) },
  { key: 'wheelCount', group: 'Rodas', label: 'Nº de rodas', unit: '', min: 2, max: 4, step: 2, toUi: (s) => s.wheels.count, apply: (s, v) => (s.wheels.count = v >= 3 ? 4 : 2) },
  { key: 'wheelR', group: 'Rodas', label: 'Diâmetro', unit: 'mm', min: 16, max: 50, step: 0.5, toUi: (s) => m2mm(s.wheels.radius * 2), apply: (s, v) => (s.wheels.radius = mm2m(v) / 2) },
  { key: 'wheelW', group: 'Rodas', label: 'Largura do pneu', unit: 'mm', min: 5, max: 25, step: 0.5, toUi: (s) => m2mm(s.wheels.width), apply: (s, v) => (s.wheels.width = mm2m(v)) },
  { key: 'wheelCover', group: 'Rodas', kind: 'toggle', label: 'Rodas embutidas', unit: '', min: 0, max: 1, step: 1, toUi: (s) => (s.wheels.covered === false ? 0 : 1), apply: (s, v) => (s.wheels.covered = v >= 0.5), hint: 'Chassi envolve as rodas com caixas de roda em arco' },
  { key: 'wellGap', group: 'Rodas', label: 'Folga da caixa de roda', unit: 'mm', min: 0.5, max: 6, step: 0.5, toUi: (s) => m2mm(s.wheels.wellGap ?? 0.002), apply: (s, v) => (s.wheels.wellGap = mm2m(v)), hint: 'Espaço entre o pneu e a chassi' },
  { key: 'wheelMu', group: 'Rodas', label: 'Atrito do pneu (pico)', unit: 'μ', min: 0.3, max: 1.6, step: 0.01, toUi: (s) => s.wheels.friction, apply: (s, v) => (s.wheels.friction = v), hint: 'Aderência máxima antes de patinar. Silicone 20 Shore A em madeira laminada ≈ 0,75' },
  { key: 'slipPeak', group: 'Rodas', label: 'Escorregamento no pico', unit: '%', min: 3, max: 40, step: 0.5, toUi: (s) => +((s.wheels.slipPeak ?? WHEEL_DEFAULTS.slipPeak) * 100).toFixed(2), apply: (s, v) => (s.wheels.slipPeak = v / 100), hint: 'Pneu macio chega ao pico com mais escorregamento' },
  { key: 'slideRatio', group: 'Rodas', label: 'Atrito patinando', unit: '%', min: 40, max: 100, step: 1, toUi: (s) => Math.round((s.wheels.slideRatio ?? WHEEL_DEFAULTS.slideRatio) * 100), apply: (s, v) => (s.wheels.slideRatio = v / 100), hint: '% do atrito de pico que sobra com a roda patinando' },
  { key: 'wheelMass', group: 'Rodas', label: 'Massa de cada roda', unit: 'g', min: 2, max: 60, step: 0.5, toUi: (s) => +(wheelMass(s) * 1000).toFixed(2), apply: (s, v) => (s.wheels.mass = v / 1000), hint: 'Cubo + pneu (inércia da roda)' },
  { key: 'ratedV', group: 'Motor', label: 'Tensão nominal do motor', unit: 'V', min: 3, max: 24, step: 0.1, toUi: (s) => +(s.motor.ratedVoltage ?? batteryOf(s).nominal).toFixed(2), apply: (s, v) => (s.motor.ratedVoltage = v), hint: 'A da ficha do motor. Rotação e torque abaixo valem nela; a bateria escala os dois' },
  { key: 'rpm', group: 'Motor', label: 'Rotação livre', unit: 'RPM', min: 100, max: 3500, step: 10, toUi: (s) => s.motor.freeRpm, apply: (s, v) => (s.motor.freeRpm = v), hint: 'Na tensão nominal do motor' },
  { key: 'stall', group: 'Motor', label: 'Torque de travamento', unit: 'kgf·cm', min: 0.1, max: 10, step: 0.01, toUi: (s) => +(s.motor.stallTorque / 0.0980665).toFixed(2), apply: (s, v) => (s.motor.stallTorque = v * 0.0980665), hint: 'Por motor (1 motor por roda), na tensão nominal' },
  { key: 'stallA', group: 'Motor', label: 'Corrente de travamento', unit: 'A', min: 0, max: 10, step: 0.01, toUi: (s) => +(s.motor.stallCurrent ?? 0).toFixed(2), apply: (s, v) => (s.motor.stallCurrent = v > 0 ? v : undefined), hint: 'Por motor, na tensão nominal. 0 = não informada (sem alertas de corrente)' },
  { key: 'motorTau', group: 'Motor', label: 'Constante de tempo', unit: 'ms', min: 1, max: 60, step: 0.5, toUi: (s) => +((s.motor.timeConstant ?? MOTOR_DEFAULTS.timeConstant) * 1000).toFixed(2), apply: (s, v) => (s.motor.timeConstant = v / 1000), hint: 'Roda no ar até 63% da rotação livre (inércia do rotor). Meça filmando em câmera lenta' },
  { key: 'mass', group: 'Massa', label: 'Massa', unit: 'g', min: 150, max: 600, step: 1, toUi: (s) => Math.round(s.mass * 1000), apply: (s, v) => (s.mass = v / 1000), hint: 'Limite 500 g' },
  { key: 'comX', group: 'Massa', label: 'CG (frente/trás)', unit: 'mm', min: -45, max: 45, step: 0.5, toUi: (s) => m2mm(s.comX), apply: (s, v) => (s.comX = mm2m(v)), hint: '+ = para a frente' },
  { key: 'comY', group: 'Massa', label: 'CG (altura)', unit: 'mm', min: 3, max: 60, step: 0.5, toUi: (s) => m2mm(s.comY), apply: (s, v) => (s.comY = mm2m(v)) },
];
