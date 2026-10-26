import type { RobotSpec } from './types';

/**
 * Caixa do modo treino: o alvo que fica no lugar do robô adversário.
 *  - 100 × 100 mm (o maior robô legal) × 50 mm de altura e 500 g (o mais pesado legal):
 *    empurrar a caixa é empurrar um rival desligado no limite do regulamento.
 *  - Madeira/MDF sobre fórmica: μ ≈ 0,4 (madeira limpa sobre madeira: 0,25–0,5, Engineering ToolBox).
 *    Força para arrastar ≈ 0,4 × 0,5 kg × 9,81 ≈ 2,0 N — abaixo da tração dos presets (2,7–3,9 N).
 *  - Sem rodas, motor nem lâmina: não pontua empurrando, não queima largada e não leva
 *    Hansoku por ficar parada (o juiz sabe que ela é passiva).
 */
export const TRAINING_BOX: Readonly<RobotSpec> = Object.freeze({
  id: 'caixa-treino',
  name: 'Caixa de treino',
  bodyColor: '#b98a55',
  tireColor: '#3a3a3a',
  length: 0.1,
  width: 0.1,
  height: 0.05,
  frontAngleDeg: 90,
  groundClearance: 0.0005,
  blade: Object.freeze({ angleDeg: 80, length: 0.003, width: 0.1, edgeClearance: 0, friction: 0.4 }),
  wheels: Object.freeze({ count: 2 as const, radius: 0.01, width: 0.01, friction: 1, covered: false }),
  motor: Object.freeze({ freeRpm: 100, stallTorque: 0.01 }),
  mass: 0.5,
  comX: 0,
  comY: 0.025,
  bodyFriction: 0.4,
  passive: true,
}) as Readonly<RobotSpec>;

/** Cópia mutável (a física e o render recebem specs comuns) */
export const trainingBox = (): RobotSpec => structuredClone(TRAINING_BOX) as RobotSpec;

/** Força para arrastar a caixa parada (N) */
export const boxDragForce = (g = 9.81) => TRAINING_BOX.bodyFriction * TRAINING_BOX.mass * g;
