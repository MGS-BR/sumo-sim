/**
 * Qual motor do catálogo combina com cada preset (Kunai, Tora, Fuji)?
 * 1) Triagem: todas as reduções de cada família em cada robô (velocidade, força × tração, empinar).
 * 2) Torneio: cada robô com 3 reduções de cada família enfrenta um painel fixo de 9 robôs
 *    (os 3 corpos × 1 redução média de cada família), bot difícil × bot difícil,
 *    largada sorteada, cores trocadas.
 * 3) Atribuição: um motor diferente por robô; escolhe a permutação com maior soma de vitórias.
 * 4) Confirmação: onde a 1ª e a 2ª atribuição diferem, o mesmo corpo com cada motor se enfrenta.
 * Motores de 12 V na 3S (com baterias, as linhas de 6 V só servem na 2S, com sobretensão moderada).
 * Rodar: npm run analise:motores   (não faz parte do `npm test` nem do `npm run analise`; ~35 min)
 */
import { it } from 'vitest';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT } from '../src/sim/modes';
import { inspect } from '../src/sim/inspection';
import { theoreticalTopSpeed } from '../src/sim/drive';
import { MOTOR_PRESETS, applyMotorPreset, effectiveMotor, recommendedCells } from '../src/sim/catalog';
import { SparringBot } from '../src/control/sparringBot';
import type { ControlFrame, RobotSpec } from '../src/sim/types';
import { robot } from '../tests/fixtures';

const BODIES = ['kunai', 'tora', 'fuji'] as const;
// versões de 12 V das três famílias, todas na 3S (a bateria compatível com elas; ver analysis/battery.test.ts)
const FAMILIES = {
  N20: ['n20hpcb12-30', 'n20hpcb12-50', 'n20hpcb12-75'],
  N30: ['n30-12-20', 'n30-12-30', 'n30-12-50'],
  'JGA16-050': ['jga16-12-16', 'jga16-12-25', 'jga16-12-32'],
} as const;
type Family = keyof typeof FAMILIES;
const PANEL_MOTOR: Record<Family, string> = { N20: 'n20hpcb12-50', N30: 'n30-12-30', 'JGA16-050': 'jga16-12-25' };
const SEEDS = 2;

const build = (body: string, motorId: string): RobotSpec => {
  const s = robot(body);
  applyMotorPreset(s, motorId);
  s.battery = { cells: recommendedCells(MOTOR_PRESETS.find((m) => m.id === motorId)!.voltage) };
  s.name = `${body}+${motorId}`;
  return s;
};

/** vitórias de `a` contra `b`, SEEDS sementes × 2 lados */
async function play(a: RobotSpec, b: RobotSpec) {
  let wins = 0, games = 0;
  for (let seed = 1; seed <= SEEDS; seed++)
    for (const swap of [false, true]) {
      const specs: [RobotSpec, RobotSpec] = swap ? [structuredClone(b), structuredClone(a)] : [structuredClone(a), structuredClone(b)];
      const m = await Match.create({ specs, mode: MODES.realista, randomPlacement: true, seed: seed * 7919 });
      const bots = [new SparringBot('dificil'), new SparringBot('dificil')];
      let t = 0;
      while (m.ref.s.phase !== 'over' && t < 400) {
        const f = [0, 1].map((i) =>
          bots[i].poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] }),
        ) as [ControlFrame, ControlFrame];
        m.step(f);
        t += PHYSICS_DT;
      }
      const w = m.ref.s.winner;
      if (w !== null && (w === 0) !== swap) wins++;
      games++;
      m.dispose();
    }
  return { wins, games };
}

it('motor ideal para cada preset', async () => {
  const out: string[] = [];
  // 1) triagem
  const tri: string[] = ['robô | motor | v máx (m/s) | força/tração | aviso de empinar'];
  for (const body of BODIES)
    for (const fam of Object.keys(FAMILIES) as Family[])
      for (const id of FAMILIES[fam]) {
        const s = build(body, id);
        const d = inspect(s).derived;
        tri.push(`${body} | ${id} | ${theoreticalTopSpeed(effectiveMotor(s).freeRpm, s.wheels.radius).toFixed(2)} | ${(d.motorForce / d.maxTraction).toFixed(1)}× | ${d.wheelieDeg.toFixed(0)}°`);
      }
  out.push('## Candidatos\n' + tri.join('\n'));

  // 2) torneio contra o painel
  const panel = BODIES.flatMap((b) => (Object.keys(PANEL_MOTOR) as Family[]).map((f) => build(b, PANEL_MOTOR[f])));
  const best: Record<string, Record<Family, { id: string; rate: number }>> = {};
  const rows: string[] = ['robô | motor | vitórias | taxa'];
  for (const body of BODIES) {
    best[body] = {} as Record<Family, { id: string; rate: number }>;
    for (const fam of Object.keys(FAMILIES) as Family[]) {
      for (const id of FAMILIES[fam]) {
        let w = 0, g = 0;
        for (const opp of panel) {
          const r = await play(build(body, id), opp);
          w += r.wins;
          g += r.games;
        }
        const rate = w / g;
        rows.push(`${body} | ${id} | ${w}/${g} | ${(rate * 100).toFixed(0)}%`);
        if (!best[body][fam] || rate > best[body][fam].rate) best[body][fam] = { id, rate };
      }
    }
  }
  out.push('## Torneio contra o painel (9 adversários × 2 sementes × 2 lados = 36 partidas)\n' + rows.join('\n'));

  // 3) atribuição: um motor diferente por robô
  const fams = Object.keys(FAMILIES) as Family[];
  const perms: Family[][] = [];
  const permute = (rest: Family[], acc: Family[]) => (rest.length ? rest.forEach((f, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, f])) : perms.push(acc));
  permute(fams, []);
  const scored = perms
    .map((p) => ({
      p,
      sum: p.reduce((s, f, i) => s + best[BODIES[i]][f].rate, 0),
      min: Math.min(...p.map((f, i) => best[BODIES[i]][f].rate)),
    }))
    .sort((a, b) => b.sum - a.sum || b.min - a.min);
  out.push(
    '## Atribuições (soma das taxas de vitória; maior primeiro)\n' +
      scored
        .map((s) => `${BODIES.map((b, i) => `${b}=${best[b][s.p[i]].id} (${(best[b][s.p[i]].rate * 100).toFixed(0)}%)`).join(' · ')} | soma ${(s.sum * 100).toFixed(0)} | pior ${(s.min * 100).toFixed(0)}%`)
        .join('\n'),
  );
  // 4) confirmação: onde as duas melhores atribuições diferem, o mesmo corpo com cada motor se enfrenta
  const [first, second] = scored;
  const conf: string[] = ['robô | motor A | motor B | vitórias A'];
  for (let i = 0; i < BODIES.length; i++) {
    const a = best[BODIES[i]][first.p[i]].id;
    const b = best[BODIES[i]][second.p[i]].id;
    if (a === b) continue;
    let w = 0, g = 0;
    for (let k = 0; k < 4; k++) {
      const r = await play(build(BODIES[i], a), build(BODIES[i], b));
      w += r.wins;
      g += r.games;
    }
    conf.push(`${BODIES[i]} | ${a} | ${b} | ${w}/${g}`);
  }
  out.push('## Confirmação: 1ª × 2ª atribuição, mesmo corpo\n' + conf.join('\n'));
  console.log('\n' + out.join('\n\n'));
}, 7_200_000);
