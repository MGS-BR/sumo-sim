/**
 * Tipos compartilhados entre simulação, juiz, controle e render.
 * Nada aqui depende de DOM ou de Three.js — a simulação roda no navegador,
 * no Node (testes) e futuramente num servidor (modo online).
 */

/** Especificação de um robô. Unidades SI (m, kg, N·m). A UI converte para mm/g. */
export interface RobotSpec {
  id: string;
  name: string;
  /** Cor principal do chassi (hex) — só visual */
  bodyColor: string;
  tireColor: string;

  /** Comprimento total (inclui lâmina) — limite 0,100 m */
  length: number;
  /** Largura total (inclui rodas) — limite 0,100 m */
  width: number;
  /** Altura do chassi (sem limite no regulamento) */
  height: number;
  /** Ângulo da face frontal do chassi em relação ao chão (graus). 25-35 = cunha contínua, 70-90 = caixa */
  frontAngleDeg: number;
  /** Folga do fundo do chassi em relação ao chão */
  groundClearance: number;

  blade: {
    /** Ângulo da lâmina em relação ao chão (graus) */
    angleDeg: number;
    /** Comprimento da lâmina medido ao longo da rampa (da aresta até o topo).
     *  Altura = comprimento · sen(ângulo); profundidade = comprimento · cos(ângulo) */
    length: number;
    /** Largura da lâmina (pode ser menor que o robô; a maior das duas conta na caixa de inspeção) */
    width: number;
    /** Folga da aresta da lâmina em relação ao chão (0 = arrastando) */
    edgeClearance: number;
    /** Atrito da lâmina (aço polido ~0,2) */
    friction: number;
  };

  wheels: {
    count: 2 | 4;
    radius: number;
    width: number;
    /** Atrito estático pneu x fórmica (silicone ~1,0-1,3) */
    friction: number;
    /** Rodas embutidas na chassi (caixas de roda nas laterais). Padrão: true */
    covered?: boolean;
    /** Folga entre a roda e a caixa de roda (m). Padrão: 2 mm */
    wellGap?: number;
  };

  motor: {
    /** Rotação livre no eixo de saída (após redução), na tensão de operação */
    freeRpm: number;
    /** Torque de travamento no eixo de saída, por motor (N·m). 1 kgf·cm = 0,0981 N·m */
    stallTorque: number;
  };

  /** Massa total (kg) — limite 0,500 */
  mass: number;
  /** Posição do centro de massa no referencial do robô (x para frente, y para cima) */
  comX: number;
  comY: number;

  /** Atrito do chassi (plástico/alumínio) */
  bodyFriction: number;
}

/** Comando de acionamento: tensão relativa em cada lado, -1..1 (PWM) */
export interface DriveCommand {
  left: number;
  right: number;
}

/** Ajustes de posicionamento (fase de shikiri) */
export interface PlaceCommand {
  /** deslocamento para frente/trás (m/s relativos ao robô) */
  forward: number;
  /** deslocamento lateral (m/s) */
  side: number;
  /** giro (rad/s) */
  yaw: number;
}

/** Tudo que um controlador (teclado, bot, rede) entrega por tick */
export interface ControlFrame {
  drive: DriveCommand;
  place: PlaceCommand;
  /** Pose absoluta desejada no posicionamento (arrastar com o mouse). Tem prioridade sobre `place`. */
  placeTarget?: Pose2D | null;
  ready: boolean;
}

export const EMPTY_FRAME: ControlFrame = {
  drive: { left: 0, right: 0 },
  place: { forward: 0, side: 0, yaw: 0 },
  ready: false,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Pose no plano (posicionamento) */
export interface Pose2D {
  x: number;
  z: number;
  /** yaw em rad; 0 = olhando para +x */
  yaw: number;
}

export interface WheelState {
  /** Força normal na roda (N) */
  load: number;
  /** Força de tração longitudinal aplicada (N) */
  traction: number;
  /** Força lateral (N) */
  lateral: number;
  slipping: boolean;
  /** Ângulo acumulado de rotação (visual) */
  spin: number;
  /** Velocidade angular da roda (rad/s) — som do motor */
  omega: number;
  /** Ponto de contato (mundo) quando há contato */
  contact: Vec3 | null;
  /** Roda apoiada no chão de fora do dohyo */
  onOutsideFloor: boolean;
  /** Centro da roda além da borda do dohyo (Shinitai) */
  overEdge: boolean;
}

export interface RobotState {
  position: Vec3;
  rotation: Quat;
  linvel: Vec3;
  angvel: Vec3;
  yaw: number;
  wheels: WheelState[];
  /** Soma da força normal nas rodas / peso (1 = todo o peso nas rodas) */
  wheelLoadRatio: number;
  /** Algum ponto do robô toca fora do dohyo (chão do yochi) */
  touchingOutside: boolean;
  /** Onde tocou fora (para o replay de evidência) */
  outsidePoint: Vec3 | null;
  /** Comando aplicado aos motores neste tick */
  drive: DriveCommand;
  /** Caiu abaixo do plano do chão (segurança) */
  fallen: boolean;
}

export interface SimSnapshot {
  tick: number;
  time: number;
  robots: [RobotState, RobotState];
  /** Robôs em contato físico neste tick */
  inContact: boolean;
  contactPoint: Vec3 | null;
}

export type PlayerIndex = 0 | 1;
