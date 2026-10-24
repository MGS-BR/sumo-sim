/**
 * Análise da lâmina: duelos controlados variando comprimento, largura e ângulo.
 * Rodar: npm run analise   (não faz parte do `npm test`)
 */
import { it } from 'vitest';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { robot as clonePreset } from '../tests/fixtures';
import { inspect } from '../src/sim/inspection';
import { MODES, PHYSICS_HZ } from '../src/sim/modes';
import { Match } from '../src/sim/match';
import { EMPTY_FRAME, type ControlFrame } from '../src/sim/types';
import type { RobotSpec } from '../src/sim/types';

type R = Awaited<ReturnType<typeof loadRapier>>;
interface Duel { win: number; under: boolean; victimLoad: number; attackerLoad: number; lift: number; t: number }

/**
 * Um round de verdade: Match + juiz. Os dois acionam 100% para a frente a partir do bip.
 * O ponto é decidido pelas regras do jogo (inclusive iniciativa do Art. 13).
 */
function duel(R: R, att: RobotSpec, vic: RobotSpec, z: number, yaw: number, vz: number): Duel {
  const m = new Match(new SumoWorld(R, [vic, att]), { specs: [vic, att], mode: MODES.realista, rules: { noCombatRule: false } });
  // atacante = jogador 1 (azul, lado −x); vítima = jogador 0 (vermelho, lado +x)
  const tAtt = { x: -(0.06 + att.length / 2 + 0.003), z: vz + z, yaw };
  const tVic = { x: 0.06 + vic.length / 2 + 0.003, z: vz, yaw: Math.PI };
  m.step([{ ...EMPTY_FRAME, placeTarget: tVic }, { ...EMPTY_FRAME, placeTarget: tAtt }]);
  m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
  const go: ControlFrame = { ...EMPTY_FRAME, drive: { left: 1, right: 1 } };
  let win = -1, t = 0, first = -1, vlEarly = 0, alEarly = 0, ne = 0, vl = 0, al = 0, n = 0, lift = 0;
  for (let i = 0; i < PHYSICS_HZ * 12 && win < 0; i++) {
    const live = m.ref.s.phase === 'fight' || m.ref.s.phase === 'deciding';
    const ev = m.step(live ? [go, go] : [EMPTY_FRAME, EMPTY_FRAME]);
    const s = m.lastSnapshot;
    if (live && s.inContact) {
      if (first < 0) first = s.time;
      vl += s.robots[0].wheelLoadRatio; al += s.robots[1].wheelLoadRatio; n++;
      if (s.time - first < 0.15) { vlEarly += s.robots[0].wheelLoadRatio; alEarly += s.robots[1].wheelLoadRatio; ne++; }
    }
    if (live) lift = Math.max(lift, s.robots[0].position.y - 0.025);
    for (const e of ev) {
      if (e.type === 'yuko') win = e.to.length === 2 ? 2 : e.to[0] === 1 ? 0 : 1; // 0 = atacante pontuou
      if (e.type === 'torinaoshi') win = 2;
    }
    t = s.time;
  }
  m.dispose();
  return { win, under: ne > 0 && alEarly > vlEarly, victimLoad: n ? vl / n : 1, attackerLoad: n ? al / n : 1, lift, t };
}

/** 9 largadas levemente diferentes (deslocamento lateral e giro) */
function series(R: R, att: RobotSpec, vic: RobotSpec, offset = 0, vz = 0) {
  const rs: Duel[] = [];
  for (const dz of [-0.004, 0, 0.004]) for (const dy of [-0.03, 0, 0.03]) rs.push(duel(R, structuredClone(att), structuredClone(vic), offset + dz, dy, vz));
  const avg = (f: (r: Duel) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  return {
    pontos: `${rs.filter((r) => r.win === 0).length}/${rs.length}`,
    perdeu: rs.filter((r) => r.win === 1).length,
    torinaoshi: rs.filter((r) => r.win === 2 || r.win < 0).length,
    entraPorBaixo: `${rs.filter((r) => r.under).length}/${rs.length}`,
    cargaRival: avg((r) => r.victimLoad).toFixed(2),
    cargaAtacante: avg((r) => r.attackerLoad).toFixed(2),
    levantaMm: (avg((r) => r.lift) * 1000).toFixed(1),
  };
}

const mod = (base: string, f: (s: RobotSpec) => void) => { const s = clonePreset(base); f(s); return s; };
const fmt = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0]);
  return [keys.join(' | '), ...rows.map((r) => keys.map((k) => String(r[k])).join(' | '))].join('\n');
};
/** variante (atacante, P0) contra o preset original (P1): só a lâmina muda */
const vsBase = (R: R, base: string, f: (s: RobotSpec) => void, offset = 0) => series(R, mod(base, f), clonePreset(base), offset);
/** original atacando a variante pela quina: mede a lâmina como DEFESA (vitórias da variante) */
const asDefender = (R: R, base: string, f: (s: RobotSpec) => void, offset: number) => {
  const r = series(R, clonePreset(base), mod(base, f), 0, offset);
  return { pontosDaVariante: `${r.perdeu}/9`, sofreuPonto: r.pontos, torinaoshi: r.torinaoshi, cargaDaVariante: r.cargaRival };
};

it('análise da lâmina', async () => {
  const R = await loadRapier();
  const out: string[] = [];
  for (const base of ['trator', 'kunai']) {
    const b0 = clonePreset(base);
    const L0 = b0.blade.length * 1000;
    const lenRows = [0.4, 0.6, 1, 1.4, 1.8].map((k) => {
      const mm = +(L0 * k).toFixed(1);
      const s = mod(base, (s) => (s.blade.length = mm / 1000));
      const ins = inspect(s);
      return { comprimentoMm: mm, alturaMm: (ins.derived.bladeHeight * 1000).toFixed(1), legal: ins.ok ? 'sim' : 'não', ...vsBase(R, base, (s) => (s.blade.length = mm / 1000)) };
    });
    out.push(`## Comprimento — ${b0.name} variante x original (${b0.blade.angleDeg}°, frontal)\n` + fmt(lenRows));
    const angRows = [-8, 0, 10, 20].map((d) => {
      const a = b0.blade.angleDeg + d;
      const s = mod(base, (s) => (s.blade.angleDeg = a));
      const ins = inspect(s);
      return { anguloGraus: a, alturaMm: (ins.derived.bladeHeight * 1000).toFixed(1), legal: ins.ok ? 'sim' : 'não', ...vsBase(R, base, (s) => (s.blade.angleDeg = a)) };
    });
    out.push(`## Ângulo — ${b0.name} variante x original (comprimento ${L0.toFixed(1)} mm, frontal)\n` + fmt(angRows));
    for (const [label, off] of [['frontal', 0], ['desalinhado 3 cm', 0.03]] as const) {
      const rows = [99, 80, 60, 40].map((mm) => ({ larguraMm: mm, ...vsBase(R, base, (s) => (s.blade.width = mm / 1000), off) }));
      out.push(`## Largura no ataque — ${b0.name} variante x original (${label})\n` + fmt(rows));
    }
    const defRows = [99, 80, 60, 40].map((mm) => ({ larguraMm: mm, ...asDefender(R, base, (s) => (s.blade.width = mm / 1000), 0.045) }));
    out.push(`## Largura na defesa — original ataca a quina da variante (desalinhado 4,5 cm) — ${b0.name}\n` + fmt(defRows));
  }
  console.log('\n' + out.join('\n\n'));
}, 900000);
