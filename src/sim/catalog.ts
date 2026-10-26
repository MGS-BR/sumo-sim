import type { RobotSpec } from './types';

/**
 * Catálogo de motores e rodas reais. Valores das folhas de dados dos fabricantes
 * (fontes em docs/ANALISE-RODAS-MOTORES.md). Rotação e torque são no eixo de SAÍDA
 * (depois da redução), na tensão nominal.
 *
 * Nada aqui fica salvo na spec do robô: o editor reconhece o preset comparando os
 * valores. Mexeu num campo, vira "Personalizado". Assim não há texto livre a validar.
 */

const KGFCM = 0.0980665; // kgf·cm → N·m

export interface MotorPreset {
  id: string;
  family: 'N20' | 'N30' | 'JGA16-050';
  /** linha do fabricante (ex.: "HP 6 V") */
  line: string;
  voltage: number;
  ratio: number;
  freeRpm: number;
  stallKgfcm: number;
  /** corrente de travamento por motor (A) — informativo */
  stallCurrent: number;
  /** massa do motorredutor (g) — informativo; a massa do robô continua sendo a que você define */
  massG: number;
  /** constante de tempo mecânica no eixo de saída (s): inércia do rotor refletida pela redução */
  timeConstant: number;
}

/**
 * Constante de tempo mecânica τ = J·ω₀ / T₀. Não vem nas folhas de dados destes motores;
 * estimada a partir da inércia do rotor pelo tamanho (N20 ≈ 0,10 g·cm², N30 ≈ 0,15 g·cm²,
 * 050 ≈ 0,50 g·cm²) e da rotação/torque do motor sem redução. Não depende da redução:
 * a inércia refletida cresce com N², mas ω₀ cai com N e T₀ sobe com N.
 */
const TAU = { n20hp: 0.013, n20mp: 0.018, n30_12: 0.008, n30_5: 0.010, jga16: 0.019 };

const motor = (
  family: MotorPreset['family'],
  line: string,
  key: string,
  voltage: number,
  stallCurrent: number,
  massG: number,
  timeConstant: number,
  rows: [ratio: number, rpm: number, kgfcm: number][],
): MotorPreset[] =>
  rows.map(([ratio, freeRpm, stallKgfcm]) => ({
    id: `${key}-${ratio}`,
    family,
    line,
    voltage,
    ratio,
    freeRpm,
    stallKgfcm,
    stallCurrent,
    massG,
    timeConstant,
  }));

export const MOTOR_PRESETS: MotorPreset[] = [
  // Pololu Micro Metal Gearmotor HP 6V — "este formato também é chamado de N20" (pololu.com/product/995)
  ...motor('N20', 'HP 6 V', 'n20hp6', 6, 1.6, 9.5, TAU.n20hp, [
    [10, 3100, 0.22],
    [15, 2000, 0.3],
    [30, 1000, 0.57],
    [50, 590, 0.86],
    [75, 410, 1.3],
    [100, 310, 1.7],
    [150, 210, 2.4],
    [210, 150, 3.0],
  ]),
  // Pololu MP 6V — mesma corrente de travamento (0,67 A) do N20 genérico GA12-N20 (Handsontec):
  // 450 RPM/0,54 kgf·cm e 200 RPM/0,94 kgf·cm no genérico batem com 50:1 e 100:1 daqui
  ...motor('N20', 'comum (MP) 6 V', 'n20mp6', 6, 0.67, 10, TAU.n20mp, [
    [30, 720, 0.33],
    [50, 420, 0.54],
    [100, 220, 0.94],
    [150, 150, 1.3],
  ]),
  // NFP-GM12-N30-1216 (12 V, motor de 16 000 RPM)
  ...motor('N30', '12 V', 'n30-12', 12, 0.6, 12, TAU.n30_12, [
    [10, 1600, 0.3],
    [20, 800, 0.6],
    [30, 530, 1.0],
    [50, 320, 1.6],
    [100, 160, 3.0],
  ]),
  // KS-GM12-N30-11100 (5 V, motor de 17 000 RPM, 1,3 A)
  ...motor('N30', '5 V', 'n30-5', 5, 1.3, 12, TAU.n30_5, [
    [30, 567, 0.6],
    [50, 340, 0.85],
    [100, 170, 1.7],
    [150, 113, 2.13],
  ]),
  // NFP-JGA16-050-06120 (6 V; a versão 12 V tem a mesma rotação e torque com metade da corrente)
  ...motor('JGA16-050', '6 V', 'jga16-6', 6, 2.0, 30, TAU.jga16, [
    [13, 923, 0.37],
    [16, 750, 0.46],
    [25, 480, 0.65],
    [32, 375, 0.83],
    [45, 266, 1.0],
    [63, 190, 1.4],
    [100, 120, 2.3],
  ]),
];

export interface TirePreset {
  id: string;
  label: string;
  /** diâmetro externo (m) */
  diameter: number;
  /** largura da roda montada (m) */
  width: number;
  /** μ de pico (aderência máxima, antes de patinar) */
  friction: number;
  /** escorregamento em que o atrito chega ao pico */
  slipPeak: number;
  /** atrito patinando ÷ atrito de pico */
  slideRatio: number;
  /** massa da roda montada (kg): cubo + pneu */
  mass: number;
  shoreA: number;
}

/**
 * Rodas StickyMAX 32 mm da RoboCore (cubo de alumínio 6351-T6 + pneu de silicone vulcanizado).
 * A RoboCore não publica o coeficiente de atrito. O μ vem do teste da JSumo em madeira laminada
 * (mesmo acabamento do dohyo): silicone 20 Shore A ≈ 0,75; 30 Shore A ≈ 0,55.
 */
export const TIRE_PRESETS: TirePreset[] = [
  { id: 'stickymax-s20', label: 'StickyMAX S20 macia · 32 mm', diameter: 0.032, width: 0.021, friction: 0.75, slipPeak: 0.15, slideRatio: 0.85, mass: 0.023, shoreA: 20 },
  { id: 'stickymax-s30', label: 'StickyMAX S30 dura · 32 mm', diameter: 0.032, width: 0.021, friction: 0.55, slipPeak: 0.1, slideRatio: 0.85, mass: 0.023, shoreA: 30 },
];

/** Padrões para robôs sem esses campos (presets antigos e robôs salvos antes desta versão) */
export const WHEEL_DEFAULTS = { slipPeak: 0.12, slideRatio: 0.85 } as const;
export const MOTOR_DEFAULTS = { timeConstant: 0.015 } as const;

/** rótulo curto da opção (a família e a linha ficam no grupo do select) */
export const motorLabel = (m: MotorPreset) => `${m.ratio}:1 · ${m.freeRpm} RPM`;

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function applyMotorPreset(spec: RobotSpec, id: string): boolean {
  const m = MOTOR_PRESETS.find((p) => p.id === id);
  if (!m) return false;
  spec.motor.freeRpm = m.freeRpm;
  spec.motor.stallTorque = m.stallKgfcm * KGFCM;
  spec.motor.timeConstant = m.timeConstant;
  return true;
}

export function motorPresetOf(spec: RobotSpec): MotorPreset | null {
  const tau = spec.motor.timeConstant ?? MOTOR_DEFAULTS.timeConstant;
  return (
    MOTOR_PRESETS.find(
      (m) =>
        near(m.freeRpm, spec.motor.freeRpm, 0.5) &&
        near(m.stallKgfcm * KGFCM, spec.motor.stallTorque, 0.0005) &&
        near(m.timeConstant, tau, 0.0005),
    ) ?? null
  );
}

export function applyTirePreset(spec: RobotSpec, id: string): boolean {
  const t = TIRE_PRESETS.find((p) => p.id === id);
  if (!t) return false;
  spec.wheels.radius = t.diameter / 2;
  spec.wheels.width = t.width;
  spec.wheels.friction = t.friction;
  spec.wheels.slipPeak = t.slipPeak;
  spec.wheels.slideRatio = t.slideRatio;
  spec.wheels.mass = t.mass;
  return true;
}

export function tirePresetOf(spec: RobotSpec): TirePreset | null {
  const w = spec.wheels;
  return (
    TIRE_PRESETS.find(
      (t) =>
        near(t.diameter / 2, w.radius, 0.00005) &&
        near(t.width, w.width, 0.00005) &&
        near(t.friction, w.friction, 0.005) &&
        near(t.slipPeak, w.slipPeak ?? WHEEL_DEFAULTS.slipPeak, 0.005) &&
        near(t.slideRatio, w.slideRatio ?? WHEEL_DEFAULTS.slideRatio, 0.005) &&
        near(t.mass, w.mass ?? wheelMass(spec), 0.0005),
    ) ?? null
  );
}

/** Massa estimada de uma roda (kg) quando a spec não diz: escala da StickyMAX (23 g, Ø32 × 21 mm) */
export function wheelMass(spec: RobotSpec): number {
  if (spec.wheels.mass !== undefined) return spec.wheels.mass;
  const d = spec.wheels.radius * 2;
  return 0.023 * (d / 0.032) ** 2 * (spec.wheels.width / 0.021);
}

/**
 * Inércia que a roda tem que vencer para mudar de rotação (kg·m², no eixo da roda):
 * a da própria roda (≈ 0,55·m·r², cubo maciço + pneu em anel) mais a do rotor refletida
 * pela redução: J = τ·T_travamento/ω_livre (de τ = J·ω₀/T₀).
 */
export function wheelInertia(spec: RobotSpec): { wheel: number; motor: number; total: number } {
  const r = spec.wheels.radius;
  const wheel = 0.55 * wheelMass(spec) * r * r;
  const omegaFree = (spec.motor.freeRpm * 2 * Math.PI) / 60;
  const tau = spec.motor.timeConstant ?? MOTOR_DEFAULTS.timeConstant;
  const motor = (tau * spec.motor.stallTorque) / Math.max(omegaFree, 1e-6);
  return { wheel, motor, total: wheel + motor };
}
