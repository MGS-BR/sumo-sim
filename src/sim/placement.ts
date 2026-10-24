import { ARENA, SHIKIRI_HALF_LEN, SHIKIRI_OUTER_X } from './arena';
import type { Pose2D, RobotSpec } from './types';
import type { Rng } from './rng';

/**
 * Posicionamento — Art. 10:
 *  - nenhum robô pode EXCEDER a shikiri-sen: ele pode encostar/ficar sobre a linha marrom,
 *    mas nenhuma parte passa da borda dela voltada para o centro;
 *  - basta UMA PARTE do robô tocar a extensão imaginária da linha até a tawara
 *    (faixa |z| ≤ 5 cm, do lado do robô) — não precisa estar inteiro dentro dela;
 *  - o robô fica inteiro sobre o dohyo.
 * Jogador 0 (vermelho) fica no lado +x; jogador 1 (azul) no lado −x (Art. 22).
 */
export const sideSign = (player: number) => (player === 0 ? 1 : -1);

/** Borda da shikiri-sen voltada para o centro: limite que o robô não pode passar */
export const PLACEMENT_LINE_X = ARENA.shikiriInnerX;
const DOHYO_MARGIN = 0.002;

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
    if (x * sign < PLACEMENT_LINE_X - 1e-9) return 'O robô não pode passar da shikiri-sen';
    if (Math.hypot(x, z) > ARENA.dohyoRadius - DOHYO_MARGIN + 1e-9) return 'O robô precisa estar inteiro dentro do dohyo';
  }
  const zs = pts.map((p) => p[1]);
  if (Math.min(...zs) > SHIKIRI_HALF_LEN + 1e-9 || Math.max(...zs) < -SHIKIRI_HALF_LEN - 1e-9)
    return 'Alguma parte do robô precisa tocar a faixa da shikiri-sen';
  return null;
}

export function defaultPlacement(spec: RobotSpec, player: number): Pose2D {
  const sign = sideSign(player);
  // padrão: logo atrás da linha marrom, de frente para o rival
  return { x: sign * (SHIKIRI_OUTER_X + spec.length / 2 + 0.003), z: 0, yaw: player === 0 ? Math.PI : 0 };
}

/**
 * Leva uma pose desejada para a pose válida mais próxima, mantendo o giro.
 * É o que permite girar o robô encostado na linha (ele recua o necessário) e
 * arrastar com o mouse "contra" os limites sem travar.
 * Retorna null se não houver pose válida com esse giro.
 */
export function constrainPlacement(spec: RobotSpec, desired: Pose2D, player: number): Pose2D | null {
  const sign = sideSign(player);
  const p: Pose2D = { ...desired };
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.yaw)) return null;
  const limitR = ARENA.dohyoRadius - DOHYO_MARGIN;
  const EPS = 1e-6;
  for (let it = 0; it < 12; it++) {
    let pts = footprint(spec, p);
    // 1) atrás da linha
    const minX = Math.min(...pts.map(([x]) => x * sign));
    if (minX < PLACEMENT_LINE_X) p.x += sign * (PLACEMENT_LINE_X - minX + EPS);
    // 2) tocando a faixa
    pts = footprint(spec, p);
    const zs = pts.map((q) => q[1]);
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);
    if (zMin > SHIKIRI_HALF_LEN) p.z -= zMin - SHIKIRI_HALF_LEN + EPS;
    else if (zMax < -SHIKIRI_HALF_LEN) p.z += -SHIKIRI_HALF_LEN - zMax + EPS;
    // 3) dentro do dohyo: puxa na direção do centro pelo canto mais afastado
    pts = footprint(spec, p);
    let far = 0;
    let fx = 0;
    let fz = 0;
    for (const [x, z] of pts) {
      const r = Math.hypot(x, z);
      if (r > far) [far, fx, fz] = [r, x, z];
    }
    if (far > limitR) {
      const k = (far - limitR + EPS) / far;
      p.x -= fx * k;
      p.z -= fz * k;
    }
    if (!placementIssue(spec, p, player)) return p;
  }
  return null;
}

/** No sorteio, nenhum canto fica a menos disso do degrau (evita largar já "pendurado"). */
export const RANDOM_EDGE_MARGIN = 0.01;
const RANDOM_TRIES = 64;

/**
 * Sorteia uma pose legal (Art. 10) para o jogador: giro livre (0–360°), posição
 * lateral livre desde que alguma parte toque a faixa da shikiri-sen e distância
 * livre atrás da linha até a borda do dohyo (com RANDOM_EDGE_MARGIN).
 * Determinístico para o mesmo estado do Rng.
 */
export function randomPlacement(spec: RobotSpec, player: number, rng: Rng): Pose2D {
  const sign = sideSign(player);
  const hl = spec.length / 2;
  const hw = spec.width / 2;
  const limitR = ARENA.dohyoRadius - Math.max(DOHYO_MARGIN, RANDOM_EDGE_MARGIN);
  let yaw = 0;
  for (let k = 0; k < RANDOM_TRIES; k++) {
    yaw = rng.range(-Math.PI, Math.PI);
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const ex = hl * c + hw * s; // meia-extensão do retângulo em x
    const ez = hl * s + hw * c; // e em z
    // centro em z tal que o retângulo ainda cruza a faixa |z| ≤ SHIKIRI_HALF_LEN
    const zSpan = SHIKIRI_HALF_LEN + ez * 0.98;
    const z = rng.range(-zSpan, zSpan);
    const xMin = PLACEMENT_LINE_X + ex + 1e-6;
    const zFar = Math.abs(z) + ez;
    if (zFar >= limitR) continue;
    const xMax = Math.sqrt(limitR * limitR - zFar * zFar) - ex;
    const u = rng.next();
    if (xMax <= xMin) continue;
    const pose: Pose2D = { x: sign * (xMin + (xMax - xMin) * u), z, yaw };
    if (!placementIssue(spec, pose, player) && footprint(spec, pose).every(([x, zz]) => Math.hypot(x, zz) <= limitR + 1e-9))
      return pose;
  }
  // robô grande demais para quase todos os giros: mantém o último giro sorteado no ponto padrão
  const base = defaultPlacement(spec, player);
  return constrainPlacement(spec, { ...base, yaw }, player) ?? base;
}

/** Move a pose segundo um comando relativo ao robô (teclado). */
export function nudgePlacement(
  spec: RobotSpec,
  pose: Pose2D,
  player: number,
  cmd: { forward: number; side: number; yaw: number },
  dt: number,
): Pose2D {
  if (!cmd.forward && !cmd.side && !cmd.yaw) return pose;
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  const desired: Pose2D = {
    x: pose.x + (cmd.forward * c + cmd.side * s) * dt,
    z: pose.z + (-cmd.forward * s + cmd.side * c) * dt,
    yaw: pose.yaw + cmd.yaw * dt,
  };
  return constrainPlacement(spec, desired, player) ?? pose;
}
