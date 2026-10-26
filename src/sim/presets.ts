import type { RobotSpec } from './types';
import { MOTOR_PRESETS } from './catalog';

/** Motor de um preset do catálogo (rotação, travamento e constante de tempo da folha de dados) */
function catalogMotor(id: string): RobotSpec['motor'] {
  const m = MOTOR_PRESETS.find((p) => p.id === id);
  if (!m) throw new Error(`motor fora do catálogo: ${id}`);
  return { freeRpm: m.freeRpm, stallTorque: m.stallKgfcm * 0.0980665, timeConstant: m.timeConstant };
}

/**
 * Kunai: inspirado na foto de referência. Tora e Fuji: configurações enviadas pelo usuário
 * (valores copiados do editor). Cada um usa um motor real do catálogo, um de cada família
 * (N20, N30, JGA16-050), escolhido pela análise de encaixe (analysis/motorFit.test.ts).
 */
export const PRESETS: RobotSpec[] = [
  {
    // Foto 1: cunha contínua, duas rodas traseiras, lâmina larga arrastando no dohyo
    id: 'kunai',
    name: 'Kunai (JGA16)',
    bodyColor: '#2b3036',
    tireColor: '#4fa3d1',
    length: 0.099,
    width: 0.098,
    height: 0.045,
    frontAngleDeg: 28,
    groundClearance: 0.003,
    blade: { angleDeg: 28, length: 0.0256, width: 0.098, edgeClearance: 0, friction: 0.2 },
    wheels: { count: 2, radius: 0.016, width: 0.012, friction: 1.1, covered: true, wellGap: 0.002 },
    // JGA16-050 6 V 32:1 — melhor encaixe para a cunha (docs/ANALISE-ROBOS.md, "Motor de cada preset")
    motor: catalogMotor('jga16-6-32'),
    mass: 0.495,
    comX: -0.009,
    comY: 0.013,
    bodyFriction: 0.4,
  },
  {
    // Configuração enviada pelo usuário (1ª imagem): caixa alta de frente quase vertical,
    // lâmina rasante de 15°, 2 rodas de 26 mm e motor rápido (670 RPM)
    id: 'tora',
    name: 'Tora (N30)',
    bodyColor: '#e0672a',
    tireColor: '#d1c32e',
    length: 0.099,
    width: 0.099,
    height: 0.05,
    frontAngleDeg: 80,
    groundClearance: 0.005,
    blade: { angleDeg: 15, length: 0.0205, width: 0.0995, edgeClearance: 0.0002, friction: 0.2 },
    wheels: { count: 2, radius: 0.013, width: 0.014, friction: 1.1, covered: true, wellGap: 0.002 },
    // N30 12 V 50:1 — venceu 83% contra o painel; era 670 RPM / 4,4 kgf·cm (5–10× um motor real)
    motor: catalogMotor('n30-12-50'),
    mass: 0.498,
    comX: -0.014,
    comY: 0.02,
    bodyFriction: 0.4,
  },
  {
    // Configuração enviada pelo usuário (2ª imagem): caixa de 60 mm com frente a 60°,
    // lâmina de 15°, 2 rodas de 22 mm e motor lento de muito torque (400 RPM)
    id: 'fuji',
    name: 'Fuji (N20)',
    bodyColor: '#7a3fc0',
    tireColor: '#2e75d1',
    length: 0.099,
    width: 0.099,
    height: 0.06,
    frontAngleDeg: 60,
    groundClearance: 0.004,
    blade: { angleDeg: 15, length: 0.02, width: 0.099, edgeClearance: 0.0002, friction: 0.2 },
    wheels: { count: 2, radius: 0.011, width: 0.011, friction: 1.1, covered: true, wellGap: 0.003 },
    // N20 HP 6 V 50:1 — era 400 RPM / 3,7 kgf·cm
    motor: catalogMotor('n20hp6-50'),
    mass: 0.498,
    comX: -0.0155,
    comY: 0.02,
    bodyFriction: 0.4,
  },
];

/** Altura vertical da lâmina derivada do comprimento e do ângulo */
export function bladeHeight(spec: RobotSpec): number {
  return spec.blade.length * Math.sin((spec.blade.angleDeg * Math.PI) / 180);
}
/** Profundidade horizontal da lâmina */
export function bladeDepth(spec: RobotSpec): number {
  return spec.blade.length * Math.cos((spec.blade.angleDeg * Math.PI) / 180);
}

export function clonePreset(id: string): RobotSpec {
  const p = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return structuredClone(p);
}
