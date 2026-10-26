/**
 * Baterias 2S, 3S e 4S.
 * 1) Catálogo: cada linha de motor × cada bateria (razão de tensão nominal e cheia, nível).
 *    Fica no catálogo só a linha que tem ao menos uma bateria com sobretensão ≤ moderada (cheia ≤ 1,5×).
 * 2) Presets: para cada robô, a mesma família e redução do motor escolhido antes, em todas as
 *    combinações linha × bateria que não passam de "atenção" (sobretensão moderada ou subtensão).
 *    Triagem (velocidade, força ÷ tração, empinar), torneio contra os candidatos dos outros corpos
 *    e confronto direto entre os candidatos do mesmo corpo. Bot difícil × bot difícil, largada sorteada.
 * 3) Escolha: maior taxa de vitória; se um candidato "compatível" ficar a até 10 pontos do melhor,
 *    ele ganha (diferenças menores que isso são ruído com estas amostras).
 * Rodar: npm run analise:baterias   (~15 min; não faz parte do `npm test`)
 */
import { it } from 'vitest';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT } from '../src/sim/modes';
import { inspect } from '../src/sim/inspection';
import {
  BATTERIES,
  COMPAT_LIMITS,
  COMPAT_RANK,
  MOTOR_PRESETS,
  applyMotorPreset,
  compatibility,
  lineCompat,
  recommendedCells,
} from '../src/sim/catalog';
import { SparringBot } from '../src/control/sparringBot';
import type { BatteryCells, ControlFrame, RobotSpec } from '../src/sim/types';
import { robot } from '../tests/fixtures';

const SEEDS = 5;
const NOISE = 0.1;

interface Cand {
  body: string;
  motor: string;
  cells: BatteryCells;
}
const CANDIDATES: Cand[] = [
  // Kunai: JGA16-050 32:1 (a de 12 V na 4S rende igual à de 6 V na 2S: só muda a corrente)
  { body: 'kunai', motor: 'jga16-6-32', cells: 2 },
  { body: 'kunai', motor: 'jga16-12-32', cells: 3 },
  { body: 'kunai', motor: 'jga16-12-32', cells: 2 },
  // Tora: N30 12 V 50:1
  { body: 'tora', motor: 'n30-12-50', cells: 2 },
  { body: 'tora', motor: 'n30-12-50', cells: 3 },
  { body: 'tora', motor: 'n30-12-50', cells: 4 },
  // Fuji: N20 50:1 (HP 6 V ou HPCB 12 V)
  { body: 'fuji', motor: 'n20hp6-50', cells: 2 },
  { body: 'fuji', motor: 'n20hpcb12-50', cells: 2 },
  { body: 'fuji', motor: 'n20hpcb12-50', cells: 3 },
  { body: 'fuji', motor: 'n20hpcb12-50', cells: 4 },
];

const build = (c: Cand): RobotSpec => {
  const s = robot(c.body);
  if (!applyMotorPreset(s, c.motor)) throw new Error(c.motor);
  s.battery = { cells: c.cells };
  s.name = `${c.body}+${c.motor}@${c.cells}S`;
  return s;
};
const tag = (c: Cand) => `${c.body} ${c.motor} ${c.cells}S`;
const f2 = (x: number) => x.toFixed(2);

async function play(a: RobotSpec, b: RobotSpec) {
  let wins = 0, losses = 0, games = 0;
  for (let seed = 1; seed <= SEEDS; seed++)
    for (const swap of [false, true]) {
      const specs: [RobotSpec, RobotSpec] = swap ? [structuredClone(b), structuredClone(a)] : [structuredClone(a), structuredClone(b)];
      const m = await Match.create({ specs, mode: MODES.realista, randomPlacement: true, seed: seed * 6151 });
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
      else if (w !== null) losses++;
      games++;
      m.dispose();
    }
  return { wins, losses, games };
}

it('baterias: catálogo e presets', async () => {
  const out: string[] = [];

  // 1) catálogo × bateria
  const lines = [...new Map(MOTOR_PRESETS.map((m) => [`${m.family} ${m.line}`, m.voltage])).entries()];
  const removed: [string, number][] = [['N30 5 V (removido)', 5]];
  const cat = ['linha | V motor | ' + BATTERIES.map((b) => `${b.label} nominal/cheia · nível`).join(' | ') + ' | ideal | fica?'];
  for (const [name, v] of [...lines, ...removed]) {
    const cells = BATTERIES.map((b) => `${f2(b.nominal / v)}/${f2(b.full / v)} · ${lineCompat(v, b.cells)}`);
    const keep = BATTERIES.some((b) => b.full / v <= COMPAT_LIMITS.moderate);
    cat.push(`${name} | ${v} | ${cells.join(' | ')} | ${recommendedCells(v)}S | ${keep ? 'sim' : 'não'}`);
  }
  out.push('## Catálogo × bateria (razão V_bateria ÷ V_motor)\n' + cat.join('\n'));

  // 2a) triagem
  const tri = ['candidato | nível | RPM efetiva | kgf·cm efetivo | v máx (m/s) | força/tração | empinar (°) | corrente 2 motores travados, cheia (A)'];
  for (const c of CANDIDATES) {
    const s = build(c);
    const d = inspect(s).derived;
    const k = compatibility(s);
    tri.push(
      `${tag(c)} | ${k.level} | ${k.freeRpm.toFixed(0)} | ${f2(k.stallKgfcm)} | ${f2(d.topSpeed)} | ${(d.motorForce / d.maxTraction).toFixed(1)}× | ${d.wheelieDeg.toFixed(0)} | ${k.totalStallCurrentFull?.toFixed(1) ?? '-'}`,
    );
  }
  out.push('## Candidatos\n' + tri.join('\n'));

  // 2b) torneio contra os candidatos dos outros corpos
  const rate = new Map<Cand, { w: number; g: number }>(CANDIDATES.map((c) => [c, { w: 0, g: 0 }]));
  for (let i = 0; i < CANDIDATES.length; i++)
    for (let j = i + 1; j < CANDIDATES.length; j++) {
      const a = CANDIDATES[i], b = CANDIDATES[j];
      if (a.body === b.body) continue;
      const r = await play(build(a), build(b));
      rate.get(a)!.w += r.wins;
      rate.get(a)!.g += r.games;
      rate.get(b)!.w += r.losses; // empate não é vitória de ninguém
      rate.get(b)!.g += r.games;
    }
  const rows = ['candidato | vitórias | taxa'];
  for (const c of CANDIDATES) {
    const r = rate.get(c)!;
    rows.push(`${tag(c)} | ${r.w}/${r.g} | ${((r.w / r.g) * 100).toFixed(0)}%`);
  }
  out.push(`## Torneio contra os candidatos dos outros corpos (${SEEDS} sementes × 2 lados por par)\n` + rows.join('\n'));

  // 2c) confronto direto no mesmo corpo
  const h2h = ['corpo | A | B | vitórias A × B (empates)'];
  for (let i = 0; i < CANDIDATES.length; i++)
    for (let j = i + 1; j < CANDIDATES.length; j++) {
      const a = CANDIDATES[i], b = CANDIDATES[j];
      if (a.body !== b.body) continue;
      const r = await play(build(a), build(b));
      h2h.push(`${a.body} | ${a.motor} ${a.cells}S | ${b.motor} ${b.cells}S | ${r.wins} × ${r.losses} (${r.games - r.wins - r.losses})`);
    }
  out.push('## Confronto direto, mesmo corpo\n' + h2h.join('\n'));

  // 3) escolha
  const pick = ['corpo | escolhido | taxa | motivo'];
  for (const body of ['kunai', 'tora', 'fuji']) {
    const cs = CANDIDATES.filter((c) => c.body === body).map((c) => {
      const r = rate.get(c)!;
      return { c, r: r.w / r.g, level: compatibility(build(c)).level };
    });
    const best = [...cs].sort((a, b) => b.r - a.r)[0];
    const okAlt = cs.filter((x) => COMPAT_RANK[x.level] <= COMPAT_RANK.info && best.r - x.r <= NOISE).sort((a, b) => b.r - a.r)[0];
    const chosen = COMPAT_RANK[best.level] <= COMPAT_RANK.info ? best : okAlt ?? best;
    const why = chosen === best ? 'maior taxa' : `compatível a ${((best.r - chosen.r) * 100).toFixed(0)} pontos do melhor (${tag(best.c)})`;
    pick.push(`${body} | ${chosen.c.motor} ${chosen.c.cells}S (${chosen.level}) | ${(chosen.r * 100).toFixed(0)}% | ${why}`);
  }
  out.push('## Escolha\n' + pick.join('\n'));
  console.log('\n' + out.join('\n\n'));
}, 7_200_000);
