import type { Phase } from '../sim/referee';
import type { ControlFrame, Pose2D, SimSnapshot } from '../sim/types';

/**
 * Tudo que um controlador pode "ver". Jogadores humanos ignoram; bots usam.
 * Um bot autônomo de verdade deveria usar só `sensors` (a preencher no futuro:
 * sensores de oponente e de linha simulados) — `snapshot` é a "visão de Deus"
 * usada pelo bot de treino.
 */
export interface ControlContext {
  me: number;
  phase: Phase;
  dt: number;
  snapshot: SimSnapshot;
  placement: Pose2D;
}

/**
 * Interface única para teclado, bot e (futuro) jogador remoto.
 * O modo online só precisa de um controlador que entregue os ControlFrames
 * recebidos pela rede para cada tick.
 */
export interface Controller {
  readonly kind: 'keyboard' | 'bot' | 'remote';
  readonly label: string;
  poll(ctx: ControlContext): ControlFrame;
  dispose?(): void;
}
