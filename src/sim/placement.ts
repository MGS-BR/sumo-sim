import { ARENA, SHIKIRI_HALF_LEN, SHIKIRI_OUTER_X } from './arena';
import type { Pose2D, RobotSpec } from './types';

/**
 * Posicionamento — Art. 10:
 *  - nenhum robô pode exceder a shikiri-sen (fica inteiro do seu lado, atrás da linha);
 *  - alguma parte do robô deve tocar a extensão imaginária da linha até a tawara
 *    (faixa |z| ≤ 5 cm, do lado do robô).
 * Jogador 0 (vermelho) fica no lado +x; jogador 1 (azul) no lado −x (Art. 22).
 */
export const sideSign = (player: number) => (player === 0 ? 1 : -1);

export function footprint(spec: RobotSpec, pose: Pose2D): [number, number][] {
  const hl = spec.length / 2;
  const hw = spec.width / 2;
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  // forward = (cos, -sin) em (x, z); right = (sin, cos)
  return [
    [hl, hw],
    [hl, -hw],
    [-hl, hw],
    [-hl, -hw],
  ].map(([f, r]) => [pose.x + f * c + r * s, pose.z - f * s + r * c] as [number, number]);
}

export function placementIssue(spec: RobotSpec, pose: Pose2D, player: number): string | null {
  const sign = sideSign(player);
  const pts = footprint(spec, pose);
  for (const [x, z] of pts) {
    if (x * sign < SHIKIRI_OUTER_X - 1e-9) return 'O robô não pode passar da shikiri-sen';
    if (Math.hypot(x, z) > ARENA.dohyoRadius - 0.002) return 'O robô precisa estar inteiro dentro do dohyo';
  }
  const zs = pts.map((p) => p[1]);
  if (Math.min(...zs) > SHIKIRI_HALF_LEN || Math.max(...zs) < -SHIKIRI_HALF_LEN)
    return 'Alguma parte do robô precisa tocar a faixa da shikiri-sen';
  return null;
}

export function defaultPlacement(spec: RobotSpec, player: number): Pose2D {
  const sign = sideSign(player);
  return { x: sign * (SHIKIRI_OUTER_X + spec.length / 2 + 0.003), z: 0, yaw: player === 0 ? Math.PI : 0 };
}

/** Move a pose segundo um comando relativo ao robô; mantém a última pose válida. */
export function nudgePlacement(
  spec: RobotSpec,
  pose: Pose2D,
  player: number,
  cmd: { forward: number; side: number; yaw: number },
  dt: number,
): Pose2D {
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  const dx = (cmd.forward * c + cmd.side * s) * dt;
  const dz = (-cmd.forward * s + cmd.side * c) * dt;
  let next = pose;
  // aplica cada componente separadamente para "deslizar" ao longo dos limites
  for (const cand of [
    { ...next, x: next.x + dx },
    { ...next, z: next.z + dz },
  ]) {
    const merged = { ...next, x: cand.x, z: cand.z };
    if (!placementIssue(spec, merged, player)) next = merged;
  }
  if (cmd.yaw) {
    const rot = { ...next, yaw: next.yaw + cmd.yaw * dt };
    if (!placementIssue(spec, rot, player)) next = rot;
  }
  return next;
}
