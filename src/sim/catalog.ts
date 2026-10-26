import type { BatteryCells, RobotSpec } from './types';

/**
 * Catálogo de motores e rodas reais. Valores das folhas de dados dos fabricantes
 * (fontes em docs/ANALISE-RODAS-MOTORES.md). Rotação e torque são no eixo de SAÍDA
 * (depois da redução), na tensão nominal.
 *
 * Nada aqui fica salvo na spec do robô: o editor reconhece o preset comparando os
 * valores. Mexeu num campo, vira "Personalizado". Assim não há texto livre a validar.
 */

const KGFCM = 0.0980665; // kgf·cm → N·m

export interface MotorPreset {
  id: string;
  family: 'N20' | 'N30' | 'JGA16-050';
  /** linha do fabricante (ex.: "HP 6 V") */
  line: string;
  /** tensão nominal do motor (V): rotação e torque da tabela valem nela */
  voltage: number;
  ratio: number;
  freeRpm: number;
  stallKgfcm: number;
  /** corrente de travamento por motor (A) — informativo */
  stallCurrent: number;
  /** massa do motorredutor (g) — informativo; a massa do robô continua sendo a que você define */
  massG: number;
  /** constante de tempo mecânica no eixo de saída (s): inércia do rotor refletida pela redução */
  timeConstant: number;
}

/**
 * Constante de tempo mecânica τ = J·ω₀ / T₀. Não vem nas folhas de dados destes motores;
 * estimada a partir da inércia do rotor pelo tamanho (N20 ≈ 0,10 g·cm², N30 ≈ 0,15 g·cm²,
 * 050 ≈ 0,50 g·cm²) e da rotação/torque do motor sem redução. Não depende da redução:
 * a inércia refletida cresce com N², mas ω₀ cai com N e T₀ sobe com N.
 */
const TAU = { n20hp: 0.013, n20mp: 0.018, n20hpcb12: 0.018, n30_12: 0.008, jga16: 0.019 };

const motor = (
  family: MotorPreset['family'],
  line: string,
  key: string,
  voltage: number,
  stallCurrent: number,
  massG: number,
  timeConstant: number,
  rows: [ratio: number, rpm: number, kgfcm: number][],
): MotorPreset[] =>
  rows.map(([ratio, freeRpm, stallKgfcm]) => ({
    id: `${key}-${ratio}`,
    family,
    line,
    voltage,
    ratio,
    freeRpm,
    stallKgfcm,
    stallCurrent,
    massG,
    timeConstant,
  }));

export const MOTOR_PRESETS: MotorPreset[] = [
  // Pololu Micro Metal Gearmotor HP 6V — "este formato também é chamado de N20" (pololu.com/product/995)
  ...motor('N20', 'HP 6 V', 'n20hp6', 6, 1.6, 9.5, TAU.n20hp, [
    [10, 3100, 0.22],
    [15, 2000, 0.3],
    [30, 1000, 0.57],
    [50, 590, 0.86],
    [75, 410, 1.3],
    [100, 310, 1.7],
    [150, 210, 2.4],
    [210, 150, 3.0],
  ]),
  // Pololu MP 6V — mesma corrente de travamento (0,67 A) do N20 genérico GA12-N20 (Handsontec):
  // 450 RPM/0,54 kgf·cm e 200 RPM/0,94 kgf·cm no genérico batem com 50:1 e 100:1 daqui
  ...motor('N20', 'comum (MP) 6 V', 'n20mp6', 6, 0.67, 10, TAU.n20mp, [
    [30, 720, 0.33],
    [50, 420, 0.54],
    [100, 220, 0.94],
    [150, 150, 1.3],
  ]),
  // Pololu HPCB 12V (escovas de carvão, vida longa) — a versão 12 V do N20 para 3S/4S
  ...motor('N20', 'HPCB 12 V', 'n20hpcb12', 12, 0.75, 9.5, TAU.n20hpcb12, [
    [10, 3400, 0.17],
    [15, 2200, 0.25],
    [30, 1100, 0.39],
    [50, 650, 0.67],
    [75, 450, 1.0],
    [100, 330, 1.3],
    [150, 220, 1.8],
    [210, 160, 2.5],
  ]),
  // NFP-GM12-N30-1216 (12 V, motor de 16 000 RPM)
  ...motor('N30', '12 V', 'n30-12', 12, 0.6, 12, TAU.n30_12, [
    [10, 1600, 0.3],
    [20, 800, 0.6],
    [30, 530, 1.0],
    [50, 320, 1.6],
    [100, 160, 3.0],
  ]),
  // N30 5 V (KS-GM12-N30-11100) saiu: nenhuma bateria 2S/3S/4S serve (2S cheia já é 1,68× a tensão
  // nominal; ver docs/ANALISE-BATERIAS.md)
  // NFP-JGA16-050-06120 (6 V) e -12120 (12 V): mesma rotação e torque nas suas tensões; a de 12 V trava com metade da corrente
  ...(['6', '12'] as const).flatMap((v) =>
    motor('JGA16-050', `${v} V`, `jga16-${v}`, +v, v === '6' ? 2.0 : 1.0, 30, TAU.jga16, [
      [13, 923, 0.37],
      [16, 750, 0.46],
      [25, 480, 0.65],
      [32, 375, 0.83],
      [45, 266, 1.0],
      [63, 190, 1.4],
      [100, 120, 2.3],
    ]),
  ),
];

export interface TirePreset {
  id: string;
  label: string;
  /** diâmetro externo (m) */
  diameter: number;
  /** largura da roda montada (m) */
  width: number;
  /** μ de pico (aderência máxima, antes de patinar) */
  friction: number;
  /** escorregamento em que o atrito chega ao pico */
  slipPeak: number;
  /** atrito patinando ÷ atrito de pico */
  slideRatio: number;
  /** massa da roda montada (kg): cubo + pneu */
  mass: number;
  shoreA: number;
}

/**
 * Rodas StickyMAX 32 mm da RoboCore (cubo de alumínio 6351-T6 + pneu de silicone vulcanizado).
 * A RoboCore não publica o coeficiente de atrito. O μ vem do teste da JSumo em madeira laminada
 * (mesmo acabamento do dohyo): silicone 20 Shore A ≈ 0,75; 30 Shore A ≈ 0,55.
 */
export const TIRE_PRESETS: TirePreset[] = [
  { id: 'stickymax-s20', label: 'StickyMAX S20 macia · 32 mm', diameter: 0.032, width: 0.021, friction: 0.75, slipPeak: 0.15, slideRatio: 0.85, mass: 0.023, shoreA: 20 },
  { id: 'stickymax-s30', label: 'StickyMAX S30 dura · 32 mm', diameter: 0.032, width: 0.021, friction: 0.55, slipPeak: 0.1, slideRatio: 0.85, mass: 0.023, shoreA: 30 },
];

/** Padrões para robôs sem esses campos (presets antigos e robôs salvos antes desta versão) */
export const WHEEL_DEFAULTS = { slipPeak: 0.12, slideRatio: 0.85 } as const;
export const MOTOR_DEFAULTS = { timeConstant: 0.015 } as const;

/** rótulo curto da opção (a família e a linha ficam no grupo do select) */
export const motorLabel = (m: MotorPreset) => `${m.ratio}:1 · ${m.freeRpm} RPM`;

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/**
 * Aplica um motor do catálogo: rotação e torque NA TENSÃO NOMINAL do motor, a própria tensão
 * nominal e a corrente de travamento. A bateria do robô não muda: a física escala pela razão
 * bateria/motor e o editor sinaliza se a combinação é arriscada (nunca bloqueia).
 */
export function applyMotorPreset(spec: RobotSpec, id: string): boolean {
  const m = MOTOR_PRESETS.find((p) => p.id === id);
  if (!m) return false;
  spec.motor.freeRpm = m.freeRpm;
  spec.motor.stallTorque = m.stallKgfcm * KGFCM;
  spec.motor.timeConstant = m.timeConstant;
  spec.motor.ratedVoltage = m.voltage;
  spec.motor.stallCurrent = m.stallCurrent;
  return true;
}

export function motorPresetOf(spec: RobotSpec): MotorPreset | null {
  const tau = spec.motor.timeConstant ?? MOTOR_DEFAULTS.timeConstant;
  return (
    MOTOR_PRESETS.find(
      (m) =>
        near(m.freeRpm, spec.motor.freeRpm, 0.5) &&
        near(m.stallKgfcm * KGFCM, spec.motor.stallTorque, 0.0005) &&
        near(m.timeConstant, tau, 0.0005) &&
        (spec.motor.ratedVoltage === undefined || near(m.voltage, spec.motor.ratedVoltage, 0.05)),
    ) ?? null
  );
}

export function applyTirePreset(spec: RobotSpec, id: string): boolean {
  const t = TIRE_PRESETS.find((p) => p.id === id);
  if (!t) return false;
  spec.wheels.radius = t.diameter / 2;
  spec.wheels.width = t.width;
  spec.wheels.friction = t.friction;
  spec.wheels.slipPeak = t.slipPeak;
  spec.wheels.slideRatio = t.slideRatio;
  spec.wheels.mass = t.mass;
  return true;
}

export function tirePresetOf(spec: RobotSpec): TirePreset | null {
  const w = spec.wheels;
  return (
    TIRE_PRESETS.find(
      (t) =>
        near(t.diameter / 2, w.radius, 0.00005) &&
        near(t.width, w.width, 0.00005) &&
        near(t.friction, w.friction, 0.005) &&
        near(t.slipPeak, w.slipPeak ?? WHEEL_DEFAULTS.slipPeak, 0.005) &&
        near(t.slideRatio, w.slideRatio ?? WHEEL_DEFAULTS.slideRatio, 0.005) &&
        near(t.mass, w.mass ?? wheelMass(spec), 0.0005),
    ) ?? null
  );
}

/** Massa estimada de uma roda (kg) quando a spec não diz: escala da StickyMAX (23 g, Ø32 × 21 mm) */
export function wheelMass(spec: RobotSpec): number {
  if (spec.wheels.mass !== undefined) return spec.wheels.mass;
  const d = spec.wheels.radius * 2;
  return 0.023 * (d / 0.032) ** 2 * (spec.wheels.width / 0.021);
}

/* ───────────────────────────── Baterias ───────────────────────────── */

/** Tensões por célula LiPo (V): nominal, carga completa e mínima segura */
export const LIPO = { nominal: 3.7, full: 4.2, min: 3.0 } as const;

export interface BatteryPreset {
  cells: BatteryCells;
  label: string;
  /** tensão nominal (V) — a que a simulação usa (não descarrega na luta) */
  nominal: number;
  /** carga completa (V) — a dos alertas: é a que o motor recebe na 1ª luta depois de carregar */
  full: number;
  /** pack de referência: Tattu 450 mAh 75C (informativo) */
  capacityMah: number;
  cRating: number;
  massG: number;
  sizeMm: string;
}

const pack = (cells: BatteryCells, massG: number, sizeMm: string): BatteryPreset => ({
  cells,
  label: `${cells}S`,
  nominal: +(cells * LIPO.nominal).toFixed(2),
  full: +(cells * LIPO.full).toFixed(2),
  capacityMah: 450,
  cRating: 75,
  massG,
  sizeMm,
});

export const BATTERIES: readonly BatteryPreset[] = Object.freeze([
  pack(2, 29, '44 × 25 × 14'),
  pack(3, 42, '45 × 24 × 21'),
  pack(4, 58, '64,5 × 16,5 × 27'),
]);
export const DEFAULT_CELLS: BatteryCells = 2;

export const batteryOf = (spec: RobotSpec): BatteryPreset =>
  BATTERIES.find((b) => b.cells === spec.battery?.cells) ?? BATTERIES.find((b) => b.cells === DEFAULT_CELLS)!;

/** corrente contínua máxima do pack de referência (A) = capacidade × C */
export const batteryMaxCurrent = (b: BatteryPreset) => (b.capacityMah / 1000) * b.cRating;

/**
 * Razão tensão da bateria ÷ tensão nominal do motor. Num motor CC com ímã permanente,
 * rotação livre (ω₀ = V/Kₑ), torque de travamento (T₀ = Kₜ·V/R) e corrente de travamento (V/R)
 * crescem na mesma proporção da tensão; a constante de tempo não muda.
 * Sem ratedVoltage (robô antigo) a razão é 1: o motor rende o que está na ficha.
 */
export function voltageRatio(spec: RobotSpec, which: 'nominal' | 'full' = 'nominal'): number {
  const rated = spec.motor.ratedVoltage;
  if (rated === undefined || !(rated > 0)) return 1;
  return batteryOf(spec)[which] / rated;
}

/** O motor como ele trabalha nesta bateria (tensão nominal da bateria) */
export function effectiveMotor(spec: RobotSpec): { freeRpm: number; stallTorque: number; timeConstant: number; stallCurrent?: number; k: number } {
  const k = voltageRatio(spec, 'nominal');
  return {
    freeRpm: spec.motor.freeRpm * k,
    stallTorque: spec.motor.stallTorque * k,
    timeConstant: spec.motor.timeConstant ?? MOTOR_DEFAULTS.timeConstant,
    stallCurrent: spec.motor.stallCurrent === undefined ? undefined : spec.motor.stallCurrent * k,
    k,
  };
}

/* ─────────────────────── Compatibilidade motor × bateria ─────────────────────── */

/** Limites da razão V_bateria/V_motor (com a bateria CHEIA, o pior caso) */
export const COMPAT_LIMITS = {
  /** até aqui é a faixa de tolerância usual de tensão (±10–15%) */
  ok: 1.15,
  /** sobretensão moderada: comum em competição (6 V em 2S), vida útil menor */
  moderate: 1.5,
  /** acima disso o motor esquenta 2,25× ou mais; acima de 2× é 4× o calor */
  high: 2.0,
  /** abaixo disso (na tensão nominal) o motor rende pouco */
  under: 0.9,
  underStrong: 0.6,
} as const;

/** Torque máximo instantâneo recomendado na saída da caixa N20 (Pololu): 2 kgf·cm */
export const N20_GEARBOX_MAX_KGFCM = 2;

/** Pontes H comuns em mini sumô (folhas de dados) — só referência para os alertas */
export const DRIVERS = Object.freeze([
  { id: 'drv8833', label: 'DRV8833', vMax: 10.8, vAbs: 11.8, iCont: 1.5, iPeak: 2 },
  { id: 'tb6612', label: 'TB6612FNG', vMax: 13.5, vAbs: 15, iCont: 1.2, iPeak: 3.2 },
] as const);

export type CompatLevel = 'ok' | 'info' | 'warn' | 'high' | 'critical';
export const COMPAT_RANK: Record<CompatLevel, number> = { ok: 0, info: 1, warn: 2, high: 3, critical: 4 };

export interface CompatAlert {
  level: CompatLevel;
  title: string;
  text: string;
}

export interface Compatibility {
  battery: BatteryPreset;
  ratedVoltage: number | null;
  /** razões V_bateria/V_motor */
  kNominal: number;
  kFull: number;
  /** pior nível entre os alertas */
  level: CompatLevel;
  /** resumo curto para o selo */
  summary: string;
  /** rotação e torque efetivos (bateria nominal) */
  freeRpm: number;
  stallKgfcm: number;
  /** pico de torque com a bateria cheia (kgf·cm) */
  stallKgfcmFull: number;
  /** calor no cobre travado relativo ao nominal do motor: k² */
  heat: number;
  /** corrente de travamento por motor e total com bateria cheia (A), se conhecida */
  stallCurrentFull?: number;
  totalStallCurrentFull?: number;
  batteryMaxCurrent: number;
  motors: number;
  alerts: CompatAlert[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const v1 = (x: number) => x.toFixed(1).replace('.', ',');
const f2 = (x: number) => x.toFixed(2).replace('.', ',');

/**
 * Avalia a combinação motor × bateria. Só sinaliza: nenhuma combinação é bloqueada.
 * Os alertas de sobretensão usam a bateria CHEIA (4,2 V/célula), o pior caso real; os de
 * subtensão usam a nominal (3,7 V/célula), que é a que a simulação usa.
 */
export function compatibility(spec: RobotSpec): Compatibility {
  const battery = batteryOf(spec);
  const rated = spec.motor.ratedVoltage !== undefined && spec.motor.ratedVoltage > 0 ? spec.motor.ratedVoltage : null;
  const kNominal = rated ? battery.nominal / rated : 1;
  const kFull = rated ? battery.full / rated : 1;
  const motors = spec.wheels.count;
  const preset = motorPresetOf(spec);
  const stallKgfcm = (spec.motor.stallTorque / KGFCM) * kNominal;
  const stallKgfcmFull = (spec.motor.stallTorque / KGFCM) * kFull;
  const heat = kFull * kFull;
  const iFull = spec.motor.stallCurrent !== undefined ? spec.motor.stallCurrent * kFull : undefined;
  const iMax = batteryMaxCurrent(battery);
  const alerts: CompatAlert[] = [];

  if (!rated) {
    alerts.push({ level: 'info', title: 'Tensão do motor não informada', text: `A simulação usa a rotação e o torque como estão. Informe a tensão nominal do motor para conferir com a bateria ${battery.label}.` });
  } else if (kFull > COMPAT_LIMITS.high) {
    alerts.push({
      level: 'critical',
      title: `Sobretensão crítica: ${f2(kFull)}× a nominal`,
      text: `${v1(battery.full)} V (${battery.label} cheia) num motor de ${v1(rated)} V. Travado, o motor esquenta ${v1(heat)}× mais que o projetado: risco alto de queimar o enrolamento, as escovas e as engrenagens. Na vida real, não ligue sem limitar o PWM.`,
    });
  } else if (kFull > COMPAT_LIMITS.moderate) {
    alerts.push({
      level: 'high',
      title: `Sobretensão alta: ${f2(kFull)}× a nominal`,
      text: `${v1(battery.full)} V (${battery.label} cheia) num motor de ${v1(rated)} V. Travado, esquenta ${v1(heat)}× mais. Empurrões longos podem queimar o motor; escovas e caixa duram bem menos.`,
    });
  } else if (kFull > COMPAT_LIMITS.ok) {
    alerts.push({
      level: 'warn',
      title: `Sobretensão moderada: ${f2(kFull)}× a nominal`,
      text: `${v1(battery.full)} V (${battery.label} cheia) num motor de ${v1(rated)} V. Comum em competição: mais rotação e torque, mas ${v1(heat)}× o calor travado e vida útil menor. Evite ficar travado empurrando por muito tempo.`,
    });
  } else if (kNominal < COMPAT_LIMITS.underStrong) {
    alerts.push({
      level: 'high',
      title: `Subtensão forte: ${pct(kNominal)} da nominal`,
      text: `${v1(battery.nominal)} V num motor de ${v1(rated)} V: rende só ${pct(kNominal)} da rotação e do torque da ficha. O robô fica lento e fraco.`,
    });
  } else if (kNominal < COMPAT_LIMITS.under) {
    alerts.push({
      level: 'warn',
      title: `Subtensão: ${pct(kNominal)} da nominal`,
      text: `${v1(battery.nominal)} V num motor de ${v1(rated)} V: rende ${pct(kNominal)} da rotação e do torque da ficha. Seguro para o motor, mas mais lento e mais fraco.`,
    });
  } else {
    alerts.push({ level: 'ok', title: 'Tensão compatível', text: `${v1(battery.nominal)} V nominal (${v1(battery.full)} V cheia) num motor de ${v1(rated)} V: dentro da faixa.` });
  }

  if (preset?.family === 'N20' && stallKgfcmFull > N20_GEARBOX_MAX_KGFCM) {
    alerts.push({
      level: 'warn',
      title: 'Caixa de redução no limite',
      text: `Travado com a bateria cheia, o torque chega a ${f2(stallKgfcmFull)} kgf·cm. A Pololu recomenda no máximo ${N20_GEARBOX_MAX_KGFCM} kgf·cm instantâneos na caixa N20: as engrenagens podem quebrar num choque.`,
    });
  }

  if (iFull !== undefined && motors * iFull > iMax) {
    alerts.push({
      level: 'high',
      title: 'Corrente acima da bateria',
      text: `${motors} motores travados puxam ${v1(motors * iFull)} A; o pack de referência (${battery.capacityMah} mAh ${battery.cRating}C) entrega ${v1(iMax)} A contínuos.`,
    });
  }

  const fits = DRIVERS.filter((d) => battery.full <= d.vMax);
  const driverCurrent = iFull !== undefined ? DRIVERS.filter((d) => iFull > d.iPeak) : [];
  if (fits.length === 0) {
    alerts.push({
      level: 'info',
      title: 'Ponte H',
      text: `${v1(battery.full)} V passa do limite das pontes H comuns (${DRIVERS.map((d) => `${d.label} ${v1(d.vMax)} V`).join(', ')}). Use uma ponte H que aguente mais de ${v1(battery.full)} V.`,
    });
  } else if (fits.length < DRIVERS.length) {
    alerts.push({
      level: 'info',
      title: 'Ponte H',
      text: `${v1(battery.full)} V cabe na ${fits.map((d) => d.label).join(' e ')}, mas passa do limite da ${DRIVERS.filter((d) => !fits.includes(d)).map((d) => `${d.label} (${v1(d.vMax)} V)`).join(', ')}.`,
    });
  }
  if (driverCurrent.length) {
    alerts.push({
      level: 'info',
      title: 'Corrente na ponte H',
      text: `Travado, cada motor puxa ${v1(iFull!)} A: acima do pico da ${driverCurrent.map((d) => `${d.label} (${v1(d.iPeak)} A)`).join(' e ')}. A ponte entra em proteção ou queima.`,
    });
  }

  const worst = alerts.reduce<CompatLevel>((w, a) => (COMPAT_RANK[a.level] > COMPAT_RANK[w] ? a.level : w), 'ok');
  // a nota da ponte H é informativa: não rebaixa um "compatível" para "atenção"
  const level: CompatLevel = worst === 'info' && rated ? 'ok' : worst;
  const summary =
    !rated ? 'Tensão do motor não informada'
    : level === 'ok' ? `Compatível · ${f2(kFull)}× cheia`
    : alerts.find((a) => a.level === level)!.title;
  return {
    battery,
    ratedVoltage: rated,
    kNominal,
    kFull,
    level,
    summary,
    freeRpm: spec.motor.freeRpm * kNominal,
    stallKgfcm,
    stallKgfcmFull,
    heat,
    stallCurrentFull: iFull,
    totalStallCurrentFull: iFull !== undefined ? motors * iFull : undefined,
    batteryMaxCurrent: iMax,
    motors,
    alerts,
  };
}

/**
 * Nível de compatibilidade de uma linha do catálogo com uma bateria (pelas tensões).
 * Usado na análise do catálogo e para marcar as opções do select.
 */
export function lineCompat(voltage: number, cells: BatteryCells): CompatLevel {
  const b = BATTERIES.find((x) => x.cells === cells)!;
  const kFull = b.full / voltage;
  const kNom = b.nominal / voltage;
  if (kFull > COMPAT_LIMITS.high) return 'critical';
  if (kFull > COMPAT_LIMITS.moderate) return 'high';
  if (kFull > COMPAT_LIMITS.ok) return 'warn';
  if (kNom < COMPAT_LIMITS.underStrong) return 'high';
  if (kNom < COMPAT_LIMITS.under) return 'warn';
  return 'ok';
}

/** Bateria mais indicada para um motor: a de nível melhor; empate → a de mais tensão (mais rendimento) */
export function recommendedCells(voltage: number): BatteryCells {
  return [...BATTERIES]
    .sort((a, b) => COMPAT_RANK[lineCompat(voltage, a.cells)] - COMPAT_RANK[lineCompat(voltage, b.cells)] || b.cells - a.cells)[0].cells;
}

/**
 * Inércia que a roda tem que vencer para mudar de rotação (kg·m², no eixo da roda):
 * a da própria roda (≈ 0,55·m·r², cubo maciço + pneu em anel) mais a do rotor refletida
 * pela redução: J = τ·T_travamento/ω_livre (de τ = J·ω₀/T₀).
 */
export function wheelInertia(spec: RobotSpec): { wheel: number; motor: number; total: number } {
  const r = spec.wheels.radius;
  const wheel = 0.55 * wheelMass(spec) * r * r;
  // a razão de tensão multiplica torque e rotação igualmente: J não muda com a bateria
  const m = effectiveMotor(spec);
  const omegaFree = (m.freeRpm * 2 * Math.PI) / 60;
  const motor = (m.timeConstant * m.stallTorque) / Math.max(omegaFree, 1e-6);
  return { wheel, motor, total: wheel + motor };
}
