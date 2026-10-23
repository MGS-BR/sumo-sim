/**
 * Modos de jogo. A física é a MESMA nos dois — o arcade só desacelera o tempo
 * e suaviza a entrada para dar tempo de reação humana. Assim o que você aprende
 * no arcade continua valendo no realista.
 */
export type GameMode = 'realista' | 'arcade';

export interface ModeConfig {
  mode: GameMode;
  label: string;
  /** Fração do tempo real em que a simulação avança (1 = tempo real) */
  timeScale: number;
  /** Taxa de rampa da entrada do teclado (unidades de PWM por segundo de jogo) */
  inputRampRate: number;
  /** Ganho de giro ao misturar frente + curva */
  turnGain: number;
  /** Motor ligado durante a contagem: mexer antes do bip = Keikoku (queimar a largada) */
  falseStartRule: boolean;
}

export const MODES: Record<GameMode, ModeConfig> = {
  realista: {
    mode: 'realista',
    label: 'Realista',
    timeScale: 1,
    inputRampRate: 14,
    turnGain: 0.75,
    falseStartRule: true,
  },
  arcade: {
    mode: 'arcade',
    label: 'Arcade',
    timeScale: 0.5,
    inputRampRate: 6,
    turnGain: 0.6,
    falseStartRule: false,
  },
};

/** Passo fixo da física. 480 Hz = 8 subpassos por quadro a 60 fps. */
export const PHYSICS_HZ = 480;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
