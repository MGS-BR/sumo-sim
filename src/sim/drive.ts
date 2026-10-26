/**
 * Modelo de motor DC + roda + pneu, isolado da engine de física para poder ser testado.
 *
 * Roda com inércia própria: J = roda + rotor refletido pela redução. A rotação da roda (ω)
 * é um estado que persiste entre passos, então ela demora para acelerar, pode girar em
 * falso (patinar) ou ser arrastada, e continua girando no ar.
 *
 *   J·dω/dt = τ_motor(ω, u) − F·r − atrito da redução
 *   τ_motor = τ_stall · (u − ω/ω_livre), limitado a ±τ_stall (limite de corrente do driver)
 *   Com u = 0 o motor fica em curto (freio do driver, ponte H em modo brake).
 *
 * Pneu: força pela curva de atrito × escorregamento (Pacejka simplificada):
 *   κ = (ω·r − v) / max(|ω·r|, |v|, v₀)    (escorregamento longitudinal)
 *   tan α = v_lateral / max(...)            (escorregamento lateral)
 *   μ(σ) = μ_pico · sen(C·atan(B·σ)),  σ = |(κ, tan α)|
 * O atrito sobe com o escorregamento até o pico (σ_pico) e cai para ρ·μ_pico patinando.
 * É aqui que a rampa funciona: quando a lâmina do adversário levanta o robô,
 * N cai e a força máxima que as rodas transmitem cai junto.
 *
 * Integração: o par roda + corpo é rígido demais para passo explícito em baixa velocidade.
 * A força do pneu de cada passo é a raiz de F = F_pneu(κ(F)) com ω e v do FIM do passo
 * (Euler implícito), achada por bisseção — estável e determinística.
 */

export interface TireParams {
  /** μ de pico */
  muPeak: number;
  /** escorregamento no pico */
  slipPeak: number;
  /** μ patinando / μ de pico */
  slideRatio: number;
}

export interface WheelInput {
  /** PWM do motor desta roda, −1..1 */
  u: number;
  /** Força normal na roda (N) */
  load: number;
  /** Velocidade do ponto de contato no sentido da roda (m/s) */
  vLong: number;
  /** Velocidade lateral do ponto de contato (m/s) */
  vLat: number;
  /** Rotação atual da roda (rad/s, + = rolando para a frente) */
  omega: number;
  radius: number;
  freeOmega: number; // rad/s
  stallTorque: number; // N·m
  /** Inércia de rotação no eixo da roda (kg·m²) */
  inertia: number;
  tire: TireParams;
  /** Massa do robô atribuída à roda */
  effMass: number;
  dt: number;
  /** Torque que a redução segura com o motor em freio (u≈0). Opcional. */
  holdTorque?: number;
}

export interface WheelOutput {
  fLong: number;
  fLat: number;
  /** Rotação da roda ao fim do passo (rad/s) */
  omega: number;
  /** Além do pico de atrito (patinando ou travada arrastando) */
  slipping: boolean;
  /** Escorregamento longitudinal κ ao fim do passo */
  slip: number;
}

const ROLLING_RESISTANCE = 0.015;
/** Abaixo disso o escorregamento é medido em relação a v₀ (evita divisão por ~0 parado) */
const V0 = 0.05;
const ITERATIONS = 40;

/** Atrito normalizado pela curva de escorregamento. σ ≥ 0. */
export function tireMu(sigma: number, t: TireParams): number {
  const a = Math.abs(sigma);
  if (!(a > 0)) return 0;
  const rho = Math.min(0.999, Math.max(0.3, t.slideRatio));
  const C = 2 - (2 / Math.PI) * Math.asin(rho); // sen(C·π/2) = ρ: μ(∞) = ρ·μ_pico
  const B = Math.tan(Math.PI / (2 * C)) / Math.max(1e-3, t.slipPeak); // pico em σ_pico
  return t.muPeak * Math.sin(C * Math.atan(B * a));
}

/** Força do motor no aro da roda (N) para a rotação dada — curva com limite de corrente */
export function motorForce(u: number, omega: number, radius: number, freeOmega: number, stallTorque: number): number {
  let torque = stallTorque * (u - omega / freeOmega);
  if (torque > stallTorque) torque = stallTorque;
  if (torque < -stallTorque) torque = -stallTorque;
  return torque / radius;
}

export function stepWheel(w: WheelInput): WheelOutput {
  const r = w.radius;
  const dt = w.dt;
  const mw = Math.max(w.inertia, 1e-9) / (r * r); // inércia como massa equivalente no aro
  const fs = w.stallTorque / r;
  const A = fs * w.u;
  const B = fs / (w.freeOmega * r); // freio do back-EMF (N por m/s no aro)
  const hold = w.holdTorque && Math.abs(w.u) < 0.02 ? w.holdTorque / r : 0;
  const rim0 = w.omega * r;
  const k = mw / dt + B;

  /** velocidade do aro ao fim do passo se o pneu fizer a força F (implícito no motor) */
  const rimAfter = (F: number) => {
    let rim = (mw * (rim0 / dt) + A - F) / k;
    const fm = A - B * rim;
    if (fm > fs) rim = rim0 + (dt * (fs - F)) / mw;
    else if (fm < -fs) rim = rim0 + (dt * (-fs - F)) / mw;
    if (hold > 0) {
      // atrito estático da redução: a roda só gira se a força passar do que ela segura
      const need = rim * k;
      rim = Math.abs(need) <= hold ? 0 : rim - (Math.sign(rim) * hold) / k;
    }
    return rim;
  };

  if (!(w.load > 0)) {
    // roda no ar: só o motor e a inércia
    const rim = rimAfter(0);
    return { fLong: 0, fLat: 0, omega: rim / r, slipping: true, slip: 0 };
  }

  const mb = Math.max(w.effMass, 1e-6);
  const N = w.load;
  const state = (F: number) => {
    const rim = rimAfter(F);
    const v = w.vLong + (dt * F) / mb;
    const den = Math.max(Math.abs(rim), Math.abs(v), V0);
    const kappa = (rim - v) / den;
    const alpha = w.vLat / den;
    const s = Math.hypot(kappa, alpha);
    const mu = tireMu(s, w.tire);
    return { rim, kappa, alpha, s, fx: s > 0 ? (N * mu * kappa) / s : 0, fy: s > 0 ? (-N * mu * alpha) / s : 0 };
  };

  // raiz de h(F) = F − F_pneu(F): h(−Fmax) ≤ 0 ≤ h(Fmax) porque |F_pneu| ≤ μ_pico·N
  const fMax = Math.max(0, w.tire.muPeak) * N;
  let lo = -fMax;
  let hi = fMax;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid - state(mid).fx > 0) hi = mid;
    else lo = mid;
  }
  const F = 0.5 * (lo + hi);
  const st = state(F);

  let fLong = F;
  if (Math.abs(w.vLong) > 1e-4) fLong -= Math.sign(w.vLong) * ROLLING_RESISTANCE * N;
  // lateral: a força do pneu nunca inverte a velocidade lateral num único passo
  const latCap = (0.5 * mb * Math.abs(w.vLat)) / dt;
  const fLat = Math.max(-latCap, Math.min(latCap, st.fy));

  return {
    fLong,
    fLat,
    omega: st.rim / r,
    slipping: st.s > w.tire.slipPeak,
    slip: st.kappa,
  };
}

/** Velocidade teórica máxima (m/s) */
export function theoreticalTopSpeed(freeRpm: number, radius: number): number {
  return ((freeRpm * 2 * Math.PI) / 60) * radius;
}
