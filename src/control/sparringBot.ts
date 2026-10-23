import type { Controller, ControlContext } from './controller';
import type { ControlFrame } from '../sim/types';
import { ARENA } from '../sim/arena';
import { clamp, wrapAngle } from '../sim/math';

export type BotLevel = 'facil' | 'medio' | 'dificil';

const LEVELS: Record<BotLevel, { speed: number; reaction: number; aimGain: number; label: string }> = {
  facil: { speed: 0.55, reaction: 0.35, aimGain: 2.0, label: 'Bot fácil' },
  medio: { speed: 0.8, reaction: 0.18, aimGain: 3.0, label: 'Bot médio' },
  dificil: { speed: 1.0, reaction: 0.06, aimGain: 4.5, label: 'Bot difícil' },
};

/**
 * Bot de treino ("sparring"). Usa a posição real do oponente — não é um robô
 * autônomo de verdade. Serve para jogar sozinho e como exemplo da interface Controller;
 * o bot autônomo futuro deve ler sensores simulados no lugar de `snapshot`.
 */
export class SparringBot implements Controller {
  readonly kind = 'bot' as const;
  readonly label: string;
  private cfg: (typeof LEVELS)[BotLevel];
  private fightTime = 0;
  private seen = { x: 0, z: 0 };
  private seenAge = 1e9;

  constructor(level: BotLevel = 'medio') {
    this.cfg = LEVELS[level];
    this.label = this.cfg.label;
  }

  poll(ctx: ControlContext): ControlFrame {
    const frame: ControlFrame = { drive: { left: 0, right: 0 }, place: { forward: 0, side: 0, yaw: 0 }, ready: false };
    if (ctx.phase === 'placement') {
      frame.ready = true;
      this.fightTime = 0;
      this.seenAge = 1e9;
      return frame;
    }
    if (ctx.phase !== 'fight' && ctx.phase !== 'deciding') return frame;
    this.fightTime += ctx.dt;
    if (this.fightTime < this.cfg.reaction) return frame;

    const me = ctx.snapshot.robots[ctx.me];
    const op = ctx.snapshot.robots[1 - ctx.me];
    // "percepção" com atraso: atualiza a posição vista do oponente a cada tempo de reação
    this.seenAge += ctx.dt;
    if (this.seenAge >= this.cfg.reaction * 0.5) {
      this.seen = { x: op.position.x, z: op.position.z };
      this.seenAge = 0;
    }
    const dx = this.seen.x - me.position.x;
    const dz = this.seen.z - me.position.z;
    const desired = Math.atan2(-dz, dx);
    const err = wrapAngle(desired - me.yaw);
    let turn = clamp(err * this.cfg.aimGain, -1, 1);
    let throttle = Math.abs(err) < 0.5 ? 1 : Math.abs(err) < 1.2 ? 0.4 : 0;

    // Perto da borda e sem contato, apontando para fora: recua e vira para o centro
    const r = Math.hypot(me.position.x, me.position.z);
    const outward = Math.cos(me.yaw) * me.position.x - Math.sin(me.yaw) * me.position.z;
    if (r > ARENA.dohyoRadius - 0.07 && outward > 0 && !ctx.snapshot.inContact) {
      const toCenter = wrapAngle(Math.atan2(me.position.z, -me.position.x) - me.yaw);
      turn = clamp(toCenter * 3, -1, 1);
      throttle = -0.4;
    }
    throttle *= this.cfg.speed;
    turn *= Math.max(0.5, this.cfg.speed);
    frame.drive.left = clamp(throttle - turn, -1, 1);
    frame.drive.right = clamp(throttle + turn, -1, 1);
    return frame;
  }
}
