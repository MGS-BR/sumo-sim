/**
 * Modo treino (caixa no lugar do adversário).
 * 1) Empurrão reto da posição padrão, partida suave: tempo até a caixa encostar fora.
 * 2) Bot difícil com posição aleatória: taxa de sucesso e tempos.
 * 3) A caixa equivale a um robô desligado? Mesmo empurrão contra um robô parado em freio.
 * 4) Sensibilidade ao atrito da caixa (madeira na fórmica: 0,25–0,5).
 * Rodar: npm run analise   (não faz parte do `npm test`)
 */
import { it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT, PHYSICS_HZ } from '../src/sim/modes';
import { SparringBot } from '../src/control/sparringBot';
import { TrainingTarget } from '../src/control/trainingTarget';
import { trainingBox } from '../src/sim/training';
import { PRESETS } from '../src/sim/presets';
import { EMPTY_FRAME, type ControlFrame, type RobotSpec } from '../src/sim/types';
import { robot, softStart } from '../tests/fixtures';

type R = Awaited<ReturnType<typeof loadRapier>>;
const f2 = (v: number) => v.toFixed(2);

/** Empurrão reto: robô (−x) e alvo (+x) nas posições padrão, 100% com partida suave */
function straightPush(R: R, pusher: RobotSpec, target: RobotSpec): number | null {
  const w = new SumoWorld(R, [structuredClone(pusher), structuredClone(target)]);
  w.setPose(0, { x: -(0.06 + pusher.length / 2 + 0.003), z: 0, yaw: 0 });
  w.setPose(1, { x: 0.06 + target.length / 2 + 0.003, z: 0, yaw: Math.PI });
  for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
  const ramp = softStart();
  let t = 0;
  for (let i = 0; i < 10 * PHYSICS_HZ; i++) {
    const u = ramp(1);
    w.setCommand(0, { left: u, right: u });
    w.step();
    t += PHYSICS_DT;
    if (w.robotState(0).touchingOutside) break;
    if (w.robotState(1).touchingOutside) {
      w.dispose();
      return t;
    }
  }
  w.dispose();
  return null;
}

/** Bot difícil × caixa com posição aleatória: um round por semente */
async function botRounds(pusher: RobotSpec, seeds: number) {
  const times: number[] = [];
  let lost = 0, none = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const m = await Match.create({ specs: [structuredClone(pusher), trainingBox()], mode: MODES.realista, randomPlacement: true, seed: seed * 104729 });
    const bot = new SparringBot('dificil');
    const target = new TrainingTarget();
    let done = false;
    let t = 0;
    while (!done && t < 90) {
      const f: [ControlFrame, ControlFrame] = [
        bot.poll({ me: 0, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[0] }),
        target.poll({ me: 1, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[1] }),
      ];
      for (const e of m.step(f)) {
        if (e.type === 'yuko') {
          done = true;
          if (e.to.length === 1 && e.to[0] === 0 && m.outTouches[1]) times.push(m.outTouches[1].t - m.fightStart);
          else lost++;
        }
        if (e.type === 'timeUp' || e.type === 'torinaoshi') {
          done = true;
          none++;
        }
      }
      t += PHYSICS_DT;
    }
    if (!done) none++;
    m.dispose();
  }
  return { times, lost, none };
}

const fmt = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0]);
  return [keys.join(' | '), ...rows.map((r) => keys.map((k) => String(r[k])).join(' | '))].join('\n');
};

it('análise do modo treino', async () => {
  const R = await loadRapier();
  const out: string[] = [];

  const dead = (id: string) => {
    const s = robot(id);
    s.name = `${id} desligado`;
    return s;
  };
  out.push(
    '## Empurrão reto da posição padrão (partida suave)\n' +
      fmt(
        PRESETS.map((p) => {
          const box = straightPush(R, p, trainingBox());
          const vsDead = PRESETS.map((q) => straightPush(R, p, dead(q.id)));
          return {
            robo: p.name,
            caixaS: box === null ? 'não saiu' : f2(box),
            ...Object.fromEntries(PRESETS.map((q, k) => [`${q.id}DesligadoS`, vsDead[k] === null ? 'não saiu' : f2(vsDead[k]!)])),
          };
        }),
      ),
  );

  const rows = [];
  for (const p of PRESETS) {
    const r = await botRounds(p, 20);
    const ts = r.times;
    rows.push({
      robo: p.name,
      caixaFora: `${ts.length}/20`,
      saiuJunto: r.lost,
      semPonto: r.none,
      melhorS: ts.length ? f2(Math.min(...ts)) : '-',
      mediaS: ts.length ? f2(ts.reduce((a, b) => a + b, 0) / ts.length) : '-',
      piorS: ts.length ? f2(Math.max(...ts)) : '-',
    });
  }
  out.push('## Bot difícil × caixa, posição aleatória (20 sementes, 1 round cada)\n' + fmt(rows));

  const mu = [0.25, 0.4, 0.5].map((m) => {
    const box = trainingBox();
    box.bodyFriction = m;
    return { atritoCaixa: m, ...Object.fromEntries(PRESETS.map((p) => [p.id, (() => { const t = straightPush(R, p, box); return t === null ? 'não saiu' : f2(t); })()])) };
  });
  out.push('## Sensibilidade ao atrito da caixa (empurrão reto, s)\n' + fmt(mu));
  console.log('\n' + out.join('\n\n'));
}, 3_600_000);
