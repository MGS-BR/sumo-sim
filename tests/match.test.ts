import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT } from '../src/sim/modes';
import { clonePreset } from '../src/sim/presets';
import { SparringBot, type BotLevel } from '../src/control/sparringBot';
import type { RefEvent } from '../src/sim/referee';
import type { ControlFrame } from '../src/sim/types';

async function botMatch(a: string, b: string, la: BotLevel = 'dificil', lb: BotLevel = 'dificil', maxSeconds = 600) {
  const m = await Match.create({ specs: [clonePreset(a), clonePreset(b)], mode: MODES.realista });
  const bots = [new SparringBot(la), new SparringBot(lb)];
  const events: RefEvent[] = [];
  let t = 0;
  while (m.ref.s.phase !== 'over' && t < maxSeconds) {
    const frames = [0, 1].map((i) =>
      bots[i].poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] }),
    ) as [ControlFrame, ControlFrame];
    events.push(...m.step(frames));
    t += PHYSICS_DT;
  }
  const final = m.lastSnapshot;
  m.dispose();
  return { m, events, t, final };
}

describe('partida completa bot x bot', () => {
  it('chega ao fim com vencedor e sequência de eventos coerente', async () => {
    const { m, events, t } = await botMatch('trator', 'bloco');
    expect(m.ref.s.phase).toBe('over');
    expect(t).toBeLessThan(600);
    expect(events.filter((e) => e.type === 'bip').length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'yuko')).toBe(true);
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end).toBeDefined();
    const s = m.ref.s;
    if (s.winner !== null) expect(s.scores[s.winner]).toBeGreaterThan(s.scores[1 - s.winner]);
    // resumo para inspeção manual
    console.log(
      `trator x bloco: ${s.scores.join('x')} em ${t.toFixed(1)} s — ${s.endReason};`,
      events
        .filter((e) => e.type === 'yuko' || e.type === 'torinaoshi')
        .map((e) => (e.type === 'yuko' ? `yuko→${e.to.join('+')}(${e.reason})` : 'torinaoshi'))
        .join(', '),
    );
  });

  it('é determinística: mesma entrada, mesmo resultado (base do modo online)', async () => {
    const r1 = await botMatch('kunai', 'trator', 'medio', 'medio', 40);
    const r2 = await botMatch('kunai', 'trator', 'medio', 'medio', 40);
    expect(r2.final.tick).toBe(r1.final.tick);
    expect(r2.final.robots[0].position).toEqual(r1.final.robots[0].position);
    expect(r2.final.robots[1].rotation).toEqual(r1.final.robots[1].rotation);
    expect(r2.m.ref.s.scores).toEqual(r1.m.ref.s.scores);
  });

  it('todas as combinações de presets terminam sem travar', async () => {
    const ids = ['kunai', 'bloco', 'trator'];
    const lines: string[] = [];
    for (const a of ids)
      for (const b of ids) {
        const { m, t } = await botMatch(a, b, 'dificil', 'dificil', 900);
        expect(m.ref.s.phase).toBe('over');
        lines.push(`${a} x ${b}: ${m.ref.s.scores.join('x')} (${t.toFixed(0)} s, ${m.ref.s.endReason})`);
      }
    console.log(lines.join('\n'));
  });
});
