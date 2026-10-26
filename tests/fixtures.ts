import { PRESETS } from '../src/sim/presets';
import type { RobotSpec } from '../src/sim/types';

const kgfcm = (v: number) => v * 0.0980665;

/**
 * Robôs de teste que NÃO são mais presets do jogo (Bloco e Trator saíram da lista).
 * Continuam aqui porque cobrem casos que o editor ainda permite e que os presets
 * atuais não têm: 4 rodas, aresta da lâmina a 0,5 mm, lâmina de 20°.
 */
export const FIXTURES: Record<string, RobotSpec> = {
  bloco: {
    id: 'bloco',
    name: 'Bloco (caixa 4WD)',
    bodyColor: '#17181a',
    tireColor: '#d23b2f',
    length: 0.099,
    width: 0.099,
    height: 0.05,
    frontAngleDeg: 72,
    groundClearance: 0.004,
    blade: { angleDeg: 30, length: 0.028, width: 0.099, edgeClearance: 0.0005, friction: 0.2 },
    wheels: { count: 4, radius: 0.0145, width: 0.011, friction: 1.1, covered: true, wellGap: 0.002 },
    motor: { freeRpm: 400, stallTorque: kgfcm(3.7) },
    mass: 0.498,
    comX: -0.006,
    comY: 0.02,
    bodyFriction: 0.4,
  },
  trator: {
    id: 'trator',
    name: 'Trator (lâmina rasante)',
    bodyColor: '#e0672a',
    tireColor: '#222326',
    length: 0.099,
    width: 0.099,
    height: 0.036,
    frontAngleDeg: 40,
    groundClearance: 0.003,
    blade: { angleDeg: 20, length: 0.0292, width: 0.099, edgeClearance: 0.0002, friction: 0.18 },
    wheels: { count: 4, radius: 0.0135, width: 0.012, friction: 1.2, covered: true, wellGap: 0.002 },
    motor: { freeRpm: 600, stallTorque: kgfcm(3.0) },
    mass: 0.5,
    comX: 0.003,
    comY: 0.014,
    bodyFriction: 0.4,
  },
};

/**
 * Cópia de um preset ou de um robô de teste. Diferente de `clonePreset`, um id
 * desconhecido FALHA o teste em vez de cair silenciosamente no primeiro preset.
 */
export function robot(id: string): RobotSpec {
  const spec = PRESETS.find((p) => p.id === id) ?? FIXTURES[id];
  if (!spec) throw new Error(`robô de teste desconhecido: ${id}`);
  return structuredClone(spec);
}

/**
 * Partida suave (rampa de PWM), como o teclado no modo realista e o bot fazem.
 * Com a inércia do rotor, 0 → 100% num único passo faz robôs de motor forte empinarem;
 * os testes que não são sobre a largada usam a rampa para não depender disso.
 */
export function softStart(rate = 14, dt = 1 / 480) {
  let u = 0;
  return (target: number) => {
    const step = rate * dt;
    u += Math.max(-step, Math.min(step, target - u));
    return u;
  };
}
