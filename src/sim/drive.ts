/**
 * Modelo de motor DC + pneu, isolado da engine de física para poder ser testado.
 *
 * Motor DC com redução (no eixo da roda):
 *   τ(ω, u) = τ_stall · (u − ω/ω_livre),  u ∈ [−1, 1] = PWM
 * Com u = 0 o motor fica em curto (freio do driver), como numa ponte H em modo brake.
 *
 * Pneu: força de contato limitada pelo círculo de atrito |F| ≤ μ·N.
 * É aqui que a rampa funciona: quando a lâmina do adversário levanta o robô,
 * N cai e a força máxima que as rodas transmitem cai junto.
 */

export interface WheelInput {
  /** PWM do motor desta roda, −1..1 */
  u: number;
  /** Força normal na roda (N) */
  load: number;
  /** Velocidade do ponto de contato no sentido da roda (m/s) */
  vLong: number;
  /** Velocidade lateral do ponto de contato (m/s) */
  vLat: number;
  radius: number;
  freeOmega: number; // rad/s
  stallTorque: number; // N·m
  muStatic: number;
  muKinetic: number;
  /** Massa efetiva atribuída à roda — limita a força para não "passar do ponto" num único passo */
  effMass: number;
  dt: number;
  /** Força que a redução segura com o motor em freio (u≈0). Opcional. */
  holdForce?: number;
}

export interface WheelOutput {
  fLong: number;
  fLat: number;
  slipping: boolean;
  /** Velocidade angular da roda (para visual/telemetria) */
  omega: number;
}

const ROLLING_RESISTANCE = 0.015;

export function motorForce(u: number, vLong: number, radius: number, freeOmega: number, stallTorque: number): number {
  const omega = vLong / radius;
  let torque = stallTorque * (u - omega / freeOmega);
  // Limite de corrente do driver: nunca mais que o torque de travamento
  if (torque > stallTorque) torque = stallTorque;
  if (torque < -stallTorque) torque = -stallTorque;
  return torque / radius;
}

export function wheelForces(w: WheelInput): WheelOutput {
  if (w.load <= 0) {
    // Roda no ar: gira livre na velocidade comandada
    return { fLong: 0, fLat: 0, slipping: true, omega: w.u * w.freeOmega };
  }
  const vFree = w.u * w.freeOmega * w.radius;
  const fCurve = motorForce(w.u, w.vLong, w.radius, w.freeOmega, w.stallTorque);
  // Força que levaria o contato exatamente à velocidade livre neste passo (evita oscilação numérica)
  const fCancel = (w.effMass * (vFree - w.vLong)) / w.dt;
  let fLong = Math.abs(fCurve) < Math.abs(fCancel) ? fCurve : fCancel;
  if (w.holdForce && Math.abs(w.u) < 0.02) {
    // motor em freio + atrito da redução: a roda praticamente trava
    const lim = Math.max(Math.abs(fCurve), w.holdForce);
    // zona morta: abaixo de 0,5 mm/s é ruído numérico, não movimento
    fLong = Math.abs(w.vLong) < 0.0005 ? 0 : Math.max(-lim, Math.min(lim, fCancel));
  }
  // Resistência ao rolamento
  if (Math.abs(w.vLong) > 1e-4) fLong -= Math.sign(w.vLong) * ROLLING_RESISTANCE * w.load;

  // Lateral: o pneu tenta anular o escorregamento lateral
  let fLat = Math.abs(w.vLat) < 0.0003 ? 0 : (-w.effMass * 0.5 * w.vLat) / w.dt;

  const maxStatic = w.muStatic * w.load;
  const mag = Math.hypot(fLong, fLat);
  let slipping = false;
  if (mag > maxStatic) {
    const scale = (w.muKinetic * w.load) / mag;
    fLong *= scale;
    fLat *= scale;
    slipping = true;
  }
  const omega = slipping ? (Math.abs(vFree) > Math.abs(w.vLong) ? vFree : w.vLong) / w.radius : w.vLong / w.radius;
  return { fLong, fLat, slipping, omega };
}

/** Velocidade teórica máxima (m/s) */
export function theoreticalTopSpeed(freeRpm: number, radius: number): number {
  return ((freeRpm * 2 * Math.PI) / 60) * radius;
}
