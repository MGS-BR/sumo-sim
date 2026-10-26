/**
 * Análise dos presets (Kunai, Tora, Fuji): desempenho sozinho, duelos frontais
 * controlados e partidas bot × bot com largada sorteada.
 * Rodar: npm run analise   (não faz parte do `npm test`)
 */
import { it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { PRESETS } from '../src/sim/presets';
import { inspect } from '../src/sim/inspection';
import { theoreticalTopSpeed } from '../src/sim/drive';
import { effectiveMotor } from '../src/sim/catalog';
import { MODES, PHYSICS_DT, PHYSICS_HZ } from '../src/sim/modes';
import { Match } from '../src/sim/match';
import { SparringBot } from '../src/control/sparringBot';
import { EMPTY_FRAME, type ControlFrame, type Quat, type RobotSpec } from '../src/sim/types';
import { robot, softStart } from '../tests/fixtures';

type R = Awaited<ReturnType<typeof loadRapier>>;

/** inclinação do nariz (graus, + = frente para cima) a partir do quatérnio */
function pitchDeg(q: Quat): number {
  // eixo local +x (frente) girado: componente y
  const fy = 2 * (q.x * q.y + q.w * q.z);
  return (Math.asin(Math.max(-1, Math.min(1, fy))) * 180) / Math.PI;
}

function solo(R: R, spec: RobotSpec) {
  const w = new SumoWorld(R, [structuredClone(spec), robot('bloco')]);
  w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
  w.setPose(1, { x: 0.3, z: 0.3, yaw: 0 });
  const run = (sec: number, f?: () => void) => { for (let i = 0; i < sec * PHYSICS_HZ; i++) { w.step(); f?.(); } };
  run(0.4);
  const rest = w.robotState(0).wheelLoadRatio;
  const vt = theoreticalTopSpeed(effectiveMotor(spec).freeRpm, spec.wheels.radius);
  // largada com partida suave (como teclado/bot) e depois inversão para ré, também suave
  const ramp = softStart();
  let t90 = -1, t = 0, dist = 0, t20 = -1, pitchUp = 0, pitchDown = 0;
  const x0 = w.robotState(0).position.x;
  const track = () => {
    const p = pitchDeg(w.robotState(0).rotation);
    pitchUp = Math.max(pitchUp, p);
    pitchDown = Math.min(pitchDown, p);
  };
  run(0.6, () => {
    const u = ramp(1);
    w.setCommand(0, { left: u, right: u });
    t += PHYSICS_DT;
    const s = w.robotState(0);
    if (t90 < 0 && s.linvel.x >= 0.9 * vt) t90 = t;
    dist = s.position.x - x0;
    if (t20 < 0 && dist >= 0.2) t20 = t;
    track();
  });
  run(0.3, () => {
    const u = ramp(-1);
    w.setCommand(0, { left: u, right: u });
    track();
  });
  // largada seca: 0 → 100% num passo
  w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
  w.setCommand(0, { left: 0, right: 0 });
  run(0.3);
  w.setCommand(0, { left: 1, right: 1 });
  let dry = 0;
  run(0.5, () => (dry = Math.max(dry, pitchDeg(w.robotState(0).rotation))));
  // giro no próprio eixo
  w.setPose(0, { x: -0.25, z: 0, yaw: 0 });
  w.setCommand(0, { left: 0, right: 0 });
  run(0.3);
  w.setCommand(0, { left: -1, right: 1 });
  let yawRate = 0;
  run(0.5, () => (yawRate = Math.max(yawRate, Math.abs(w.robotState(0).angvel.y))));
  w.dispose();
  const ins = inspect(spec);
  return {
    robo: spec.id,
    velMaxMs: vt.toFixed(2),
    t90pctS: t90 < 0 ? '>0,6' : t90.toFixed(3),
    t20cmS: t20 < 0 ? '>0,6' : t20.toFixed(3),
    pesoNasRodas: rest.toFixed(2),
    tracaoN: ins.derived.maxTraction.toFixed(2),
    forcaMotorN: ins.derived.motorForce.toFixed(1),
    narizSuave: `${pitchUp.toFixed(1)}° / ${pitchDown.toFixed(1)}°`,
    empinaSeca: `${dry.toFixed(0)}°`,
    estimativa: `${ins.derived.wheelieDeg.toFixed(0)}°`,
    giroRpm: ((yawRate * 60) / (2 * Math.PI)).toFixed(0),
  };
}

interface Duel { win: number; under: boolean; loadA: number; loadB: number }
/** Round de verdade (Match + juiz); os dois a 100% para a frente desde o bip. A = jogador 1 (−x), B = jogador 0 (+x). */
function duel(R: R, a: RobotSpec, b: RobotSpec, dz: number, yaw: number): Duel {
  const m = new Match(new SumoWorld(R, [b, a]), { specs: [b, a], mode: MODES.realista, rules: { noCombatRule: false } });
  const tA = { x: -(0.06 + a.length / 2 + 0.003), z: dz, yaw };
  const tB = { x: 0.06 + b.length / 2 + 0.003, z: 0, yaw: Math.PI };
  m.step([{ ...EMPTY_FRAME, placeTarget: tB }, { ...EMPTY_FRAME, placeTarget: tA }]);
  m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
  // partida suave (rampa de PWM como o teclado no realista e o bot): com a inércia do rotor,
  // 0 → 100% num passo faz robô de motor forte empinar, e a análise mediria só isso
  const ramp = softStart();
  let win = -1, first = -1, la = 0, lb = 0, n = 0;
  for (let i = 0; i < PHYSICS_HZ * 12 && win < 0; i++) {
    const live = m.ref.s.phase === 'fight' || m.ref.s.phase === 'deciding';
    const u = live ? ramp(1) : 0;
    const go: ControlFrame = { ...EMPTY_FRAME, drive: { left: u, right: u } };
    const ev = m.step([go, go]);
    const s = m.lastSnapshot;
    if (live && s.inContact) {
      if (first < 0) first = s.time;
      if (s.time - first < 0.15) { la += s.robots[1].wheelLoadRatio; lb += s.robots[0].wheelLoadRatio; n++; }
    }
    for (const e of ev) {
      if (e.type === 'yuko') win = e.to.length === 2 ? 2 : e.to[0] === 1 ? 0 : 1; // 0 = A pontuou
      if (e.type === 'torinaoshi') win = 2;
    }
  }
  m.dispose();
  return { win, under: n > 0 && la > lb, loadA: n ? la / n : 1, loadB: n ? lb / n : 1 };
}

function series(R: R, a: RobotSpec, b: RobotSpec) {
  const rs: Duel[] = [];
  for (const dz of [-0.004, 0, 0.004]) for (const dy of [-0.03, 0, 0.03]) rs.push(duel(R, structuredClone(a), structuredClone(b), dz, dy));
  const avg = (f: (r: Duel) => number) => (rs.reduce((s, r) => s + f(r), 0) / rs.length).toFixed(2);
  return {
    A: a.name,
    B: b.name,
    pontosA: `${rs.filter((r) => r.win === 0).length}/9`,
    pontosB: `${rs.filter((r) => r.win === 1).length}/9`,
    torinaoshi: rs.filter((r) => r.win === 2 || r.win < 0).length,
    aEntraPorBaixo: `${rs.filter((r) => r.under).length}/9`,
    cargaA: avg((r) => r.loadA),
    cargaB: avg((r) => r.loadB),
  };
}

/** bot difícil × bot difícil, largada sorteada; cada semente joga com as cores trocadas também */
async function botSeries(a: RobotSpec, b: RobotSpec, seeds: number) {
  let winsA = 0, winsB = 0, draws = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    for (const swap of [false, true]) {
      const specs: [RobotSpec, RobotSpec] = swap ? [structuredClone(b), structuredClone(a)] : [structuredClone(a), structuredClone(b)];
      const m = await Match.create({ specs, mode: MODES.realista, randomPlacement: true, seed });
      const bots = [new SparringBot('dificil'), new SparringBot('dificil')];
      let t = 0;
      while (m.ref.s.phase !== 'over' && t < 600) {
        const f = [0, 1].map((i) => bots[i].poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] })) as [ControlFrame, ControlFrame];
        m.step(f);
        t += PHYSICS_DT;
      }
      const w = m.ref.s.winner;
      if (w === null) draws++;
      else if ((w === 0) !== swap) winsA++;
      else winsB++;
      m.dispose();
    }
  }
  return { A: a.name, B: b.name, vitoriasA: winsA, vitoriasB: winsB, semVencedor: draws, partidas: seeds * 2 };
}

const fmt = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0]);
  return [keys.join(' | '), ...rows.map((r) => keys.map((k) => String(r[k])).join(' | '))].join('\n');
};
const variant = (id: string, name: string, f: (s: RobotSpec) => void) => { const s = robot(id); s.name = name; f(s); return s; };

it('análise dos presets', async () => {
  const R = await loadRapier();
  const out: string[] = [];
  out.push('## Sozinho\n' + fmt(PRESETS.map((p) => solo(R, p))));

  const pairs: [string, string][] = [['tora', 'fuji'], ['fuji', 'tora'], ['tora', 'kunai'], ['fuji', 'kunai'], ['tora', 'tora'], ['fuji', 'fuji']];
  out.push('## Duelo frontal (100% desde o bip, 9 largadas)\n' + fmt(pairs.map(([a, b]) => series(R, robot(a), robot(b)))));

  // o que faz o Fuji vencer o Tora? isola um fator por vez no Tora
  const fujiTop = theoreticalTopSpeed(effectiveMotor(robot('fuji')).freeRpm, robot('fuji').wheels.radius);
  const toraTop = theoreticalTopSpeed(effectiveMotor(robot('tora')).freeRpm, robot('tora').wheels.radius);
  const vars = [
    variant('tora', 'Tora com a velocidade do Fuji', (s) => (s.motor.freeRpm = Math.round((s.motor.freeRpm * fujiTop) / toraTop))),
    variant('tora', 'Tora com frente a 60°', (s) => (s.frontAngleDeg = 60)),
    variant('tora', 'Tora com altura 60 mm', (s) => (s.height = 0.06)),
    variant('tora', 'Tora com CG −15,5 mm', (s) => (s.comX = -0.0155)),
    variant('tora', 'Tora com rodas de 22 mm (mesmo RPM)', (s) => (s.wheels.radius = 0.011)),
    variant('fuji', 'Fuji com a velocidade do Tora', (s) => (s.motor.freeRpm = Math.round((s.motor.freeRpm * toraTop) / fujiTop))),
  ];
  out.push('## Fatores (variante × o outro preset original)\n' + fmt(vars.map((v) => series(R, v, robot(v.id === 'tora' ? 'fuji' : 'tora')))));

  const rows = [];
  for (const [a, b] of [['tora', 'fuji'], ['tora', 'kunai'], ['fuji', 'kunai']]) rows.push(await botSeries(robot(a), robot(b), 10));
  out.push('## Bot difícil × bot difícil, largada sorteada (10 sementes × 2 lados)\n' + fmt(rows));
  console.log('\n' + out.join('\n\n'));
}, 1_800_000);
