/**
 * Análise de motores (N20, N30, JGA16-050) e rodas (StickyMAX S20/S30) com o modelo de roda
 * com inércia e curva de atrito × escorregamento.
 * Rodar: npm run analise   (não faz parte do `npm test`)
 */
import { it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT, PHYSICS_HZ } from '../src/sim/modes';
import { inspect } from '../src/sim/inspection';
import { theoreticalTopSpeed } from '../src/sim/drive';
import { MOTOR_PRESETS, applyMotorPreset, applyTirePreset, wheelInertia } from '../src/sim/catalog';
import { EMPTY_FRAME, type ControlFrame, type Quat, type RobotSpec } from '../src/sim/types';
import { robot, softStart } from '../tests/fixtures';

type R = Awaited<ReturnType<typeof loadRapier>>;
const pitch = (q: Quat) => (Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.y + q.w * q.z)))) * 180) / Math.PI;

/** Robô de referência: corpo do Fuji (99 × 99 × 60, 2 rodas, CG −15,5 mm), roda StickyMAX */
function ref(motorId: string, tireId = 'stickymax-s20'): RobotSpec {
  const s = robot('fuji');
  s.name = motorId;
  applyMotorPreset(s, motorId);
  applyTirePreset(s, tireId);
  return s;
}

function solo(R: R, spec: RobotSpec, soft: boolean) {
  const w = new SumoWorld(R, [structuredClone(spec), robot('bloco')]);
  w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
  w.setPose(1, { x: 0.3, z: 0.3, yaw: 0 });
  for (let i = 0; i < 0.3 * PHYSICS_HZ; i++) w.step();
  const ramp = softStart();
  const x0 = w.robotState(0).position.x;
  let t = 0, t20 = -1, hi = 0, slipMax = 0;
  for (let i = 0; i < 1.2 * PHYSICS_HZ; i++) {
    const u = soft ? ramp(1) : 1;
    w.setCommand(0, { left: u, right: u });
    w.step();
    t += PHYSICS_DT;
    const s = w.robotState(0);
    if (t20 < 0 && s.position.x - x0 >= 0.2) t20 = t;
    hi = Math.max(hi, pitch(s.rotation));
    slipMax = Math.max(slipMax, ...s.wheels.map((wh) => Math.abs(wh.slip)));
  }
  w.dispose();
  return { t20, hi, slipMax };
}

/** empurrão frontal 100%: A (azul, −x) contra B (vermelho, +x), 9 largadas, partida suave */
function duel(R: R, a: RobotSpec, b: RobotSpec) {
  let pa = 0, pb = 0, tor = 0;
  for (const dz of [-0.004, 0, 0.004])
    for (const yaw of [-0.03, 0, 0.03]) {
      const A = structuredClone(a), B = structuredClone(b);
      const m = new Match(new SumoWorld(R, [B, A]), { specs: [B, A], mode: MODES.realista, rules: { noCombatRule: false } });
      m.step([{ ...EMPTY_FRAME, placeTarget: { x: 0.06 + B.length / 2 + 0.003, z: 0, yaw: Math.PI } }, { ...EMPTY_FRAME, placeTarget: { x: -(0.06 + A.length / 2 + 0.003), z: dz, yaw } }]);
      m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
      const ra = softStart(), rb = softStart();
      let win = -1;
      for (let i = 0; i < PHYSICS_HZ * 12 && win < 0; i++) {
        const live = m.ref.s.phase === 'fight' || m.ref.s.phase === 'deciding';
        const ua = live ? ra(1) : 0, ub = live ? rb(1) : 0;
        const ev = m.step([{ ...EMPTY_FRAME, drive: { left: ub, right: ub } }, { ...EMPTY_FRAME, drive: { left: ua, right: ua } }] as [ControlFrame, ControlFrame]);
        for (const e of ev) {
          if (e.type === 'yuko') win = e.to.length === 2 ? 2 : e.to[0] === 1 ? 0 : 1;
          if (e.type === 'torinaoshi') win = 2;
        }
      }
      if (win === 0) pa++;
      else if (win === 1) pb++;
      else tor++;
      m.dispose();
    }
  return { A: a.name, B: b.name, pontosA: `${pa}/9`, pontosB: `${pb}/9`, torinaoshi: tor };
}

const fmt = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0]);
  return [keys.join(' | '), ...rows.map((r) => keys.map((k) => String(r[k])).join(' | '))].join('\n');
};

it('análise de motores e rodas', async () => {
  const R = await loadRapier();
  const out: string[] = [];

  const rows = MOTOR_PRESETS.map((m) => {
    const s = ref(m.id);
    const ins = inspect(s);
    const J = wheelInertia(s);
    const hard = solo(R, s, false);
    const soft = solo(R, s, true);
    return {
      motor: `${m.family} ${m.line} ${m.ratio}:1`,
      legal: ins.ok ? 'sim' : 'não',
      vMax: theoreticalTopSpeed(m.freeRpm, s.wheels.radius).toFixed(2),
      motorN: ins.derived.motorForce.toFixed(1),
      tracaoN: ins.derived.maxTraction.toFixed(1),
      massaRotorKg: (J.motor / s.wheels.radius ** 2).toFixed(2),
      t20cm: soft.t20 < 0 ? '>1,2' : soft.t20.toFixed(2),
      empinaSuave: soft.hi.toFixed(0),
      empinaSeca: hard.hi.toFixed(0),
      estimativa: ins.derived.wheelieDeg.toFixed(0),
      patinaMax: soft.slipMax.toFixed(2),
    };
  });
  out.push('## Motores no robô de referência (corpo do Fuji, StickyMAX S20)\n' + fmt(rows));

  const pick = (id: string, tire = 'stickymax-s20', name?: string) => {
    const s = ref(id, tire);
    s.name = name ?? id;
    return s;
  };
  out.push(
    '## Pneu: S20 × S30 (mesmo robô, N20 HP 50:1)\n' +
      fmt([duel(R, pick('n20hp6-50', 'stickymax-s20', 'S20'), pick('n20hp6-50', 'stickymax-s30', 'S30')), duel(R, pick('n20hp6-50', 'stickymax-s30', 'S30'), pick('n20hp6-50', 'stickymax-s20', 'S20'))]),
  );
  const fwdCg = (s: RobotSpec) => {
    s.comX = 0.005;
    return s;
  };
  out.push(
    '## Pneu: S20 × S30 com o CG 20 mm mais à frente (+5 mm)\n' +
      fmt([
        duel(R, fwdCg(pick('n20hp6-50', 'stickymax-s20', 'S20')), fwdCg(pick('n20hp6-50', 'stickymax-s30', 'S30'))),
        duel(R, fwdCg(pick('n20hp6-50', 'stickymax-s30', 'S30')), fwdCg(pick('n20hp6-50', 'stickymax-s20', 'S20'))),
      ]),
  );
  const contenders: [string, string][] = [
    ['n20hp6-50', 'N20 HP 50:1'],
    ['n20hp6-100', 'N20 HP 100:1'],
    ['n20mp6-50', 'N20 MP 50:1'],
    ['n30-12-30', 'N30 12V 30:1'],
    ['jga16-6-25', 'JGA16 25:1'],
    ['jga16-6-45', 'JGA16 45:1'],
  ];
  const duels = [];
  for (let i = 0; i < contenders.length; i++)
    for (let j = i + 1; j < contenders.length; j++) {
      const [ia, na] = contenders[i];
      const [ib, nb] = contenders[j];
      const d1 = duel(R, pick(ia, undefined, na), pick(ib, undefined, nb));
      const d2 = duel(R, pick(ib, undefined, nb), pick(ia, undefined, na));
      duels.push({ A: na, B: nb, vitoriasA: +d1.pontosA[0] + +d2.pontosB[0], vitoriasB: +d1.pontosB[0] + +d2.pontosA[0], de: 18 });
    }
  out.push('## Motores frente a frente (S20, 9 largadas de cada lado)\n' + fmt(duels));
  console.log('\n' + out.join('\n\n'));
}, 3_600_000);
