import type { RobotSpec } from './types';

const kgfcm = (v: number) => v * 0.0980665; // kgf·cm -> N·m

/**
 * Presets inspirados nas fotos de referência. Valores de motor na faixa de
 * motores comerciais de mini sumô (400-800 RPM, 16 mm, ~2-4 kgf·cm de torque de travamento).
 */
export const PRESETS: RobotSpec[] = [
  {
    // Foto 1: cunha contínua, duas rodas traseiras, lâmina larga arrastando no dohyo
    id: 'kunai',
    name: 'Kunai (cunha)',
    bodyColor: '#2b3036',
    tireColor: '#4fa3d1',
    length: 0.099,
    width: 0.098,
    height: 0.045,
    frontAngleDeg: 28,
    groundClearance: 0.003,
    blade: { angleDeg: 28, height: 0.012, edgeClearance: 0, friction: 0.2 },
    wheels: { count: 2, radius: 0.016, width: 0.012, friction: 1.1 },
    motor: { freeRpm: 800, stallTorque: kgfcm(2.4) },
    mass: 0.495,
    comX: -0.009,
    comY: 0.013,
    bodyFriction: 0.4,
  },
  {
    // Foto 2: caixa com frente quase vertical, lâmina curta, 4 rodas, todo o peso nas rodas
    id: 'bloco',
    name: 'Bloco (caixa 4WD)',
    bodyColor: '#17181a',
    tireColor: '#d23b2f',
    length: 0.099,
    width: 0.099,
    height: 0.05,
    frontAngleDeg: 72,
    groundClearance: 0.004,
    blade: { angleDeg: 30, height: 0.014, edgeClearance: 0.0005, friction: 0.2 },
    wheels: { count: 4, radius: 0.0145, width: 0.011, friction: 1.1 },
    motor: { freeRpm: 400, stallTorque: kgfcm(3.7) },
    mass: 0.498,
    comX: -0.006,
    comY: 0.02,
    bodyFriction: 0.4,
  },
  {
    // Foto 3 (direita): baixo, lâmina de aço larga e rasante, peso puxado para a frente
    id: 'trator',
    name: 'Trator (lâmina rasante)',
    bodyColor: '#e0672a',
    tireColor: '#222326',
    length: 0.099,
    width: 0.099,
    height: 0.036,
    frontAngleDeg: 40,
    groundClearance: 0.003,
    blade: { angleDeg: 20, height: 0.01, edgeClearance: 0.0002, friction: 0.18 },
    wheels: { count: 4, radius: 0.0135, width: 0.012, friction: 1.2 },
    motor: { freeRpm: 600, stallTorque: kgfcm(3.0) },
    mass: 0.5,
    comX: 0.003,
    comY: 0.014,
    bodyFriction: 0.4,
  },
];

export function clonePreset(id: string): RobotSpec {
  const p = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return structuredClone(p);
}
