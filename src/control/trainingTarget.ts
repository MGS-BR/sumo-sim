import type { Controller, ControlContext } from './controller';
import type { ControlFrame } from '../sim/types';

/** "Controlador" da caixa de treino: sempre pronta, nunca aciona nada. */
export class TrainingTarget implements Controller {
  readonly kind = 'target' as const;
  readonly label = 'Treino';

  poll(_ctx: ControlContext): ControlFrame {
    return { drive: { left: 0, right: 0 }, place: { forward: 0, side: 0, yaw: 0 }, ready: true };
  }
}
