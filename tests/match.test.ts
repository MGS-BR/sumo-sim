import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT } from '../src/sim/modes';
import { clonePreset } from '../src/sim/presets';
import { SparringBot, type BotLevel } from '../src/control/sparringBot';
import type { RefEvent } from '../src/sim/referee';
import { EMPTY_FRAME, type ControlFrame } from '../src/sim/types';
import { placementIssue } from '../src/sim/placement';

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

describe('posicionamento pelo Match', () => {
  it('pose absoluta (mouse) é corrigida para uma pose legal e o robô vai para lá', async () => {
    const m = await Match.create({ specs: [clonePreset('bloco'), clonePreset('kunai')], mode: MODES.realista });
    const drag: ControlFrame = { ...EMPTY_FRAME, placeTarget: { x: -0.2, z: 0.4, yaw: 2.4 } };
    for (let k = 0; k < 10; k++) m.step([drag, EMPTY_FRAME]);
    expect(m.ref.s.phase).toBe('placement');
    expect(placementIssue(m.specs[0], m.placements[0], 0)).toBeNull();
    expect(m.placements[0].yaw).toBeCloseTo(2.4);
    const st = m.lastSnapshot.robots[0].position;
    expect(st.x).toBeCloseTo(m.placements[0].x, 3);
    expect(st.z).toBeCloseTo(m.placements[0].z, 3);
    m.dispose();
  });

  it('depois de pronto o robô não se mexe mais; comandos com NaN não quebram a física', async () => {
    const m = await Match.create({ specs: [clonePreset('bloco'), clonePreset('kunai')], mode: MODES.realista });
    m.step([{ ...EMPTY_FRAME, ready: true }, EMPTY_FRAME]);
    const locked = { ...m.placements[0] };
    m.step([{ ...EMPTY_FRAME, placeTarget: { x: 0.3, z: 0.1, yaw: 0 } }, EMPTY_FRAME]);
    expect(m.placements[0]).toEqual(locked);
    m.step([EMPTY_FRAME, { ...EMPTY_FRAME, ready: true }]);
    expect(m.ref.s.phase).toBe('countdown');
    const bad: ControlFrame = { ...EMPTY_FRAME, drive: { left: NaN, right: Infinity } };
    for (let k = 0; k < 480 * 4; k++) m.step([bad, bad]);
    const p = m.lastSnapshot.robots[0].position;
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
    m.dispose();
  });
});

describe('evidência do toque fora', () => {
  it('registra onde e quando o perdedor encostou fora', async () => {
    const m = await Match.create({ specs: [clonePreset('bloco'), clonePreset('kunai')], mode: MODES.realista });
    m.step([{ ...EMPTY_FRAME, placeTarget: { x: 0.3, z: 0, yaw: 0 } }, EMPTY_FRAME]);
    m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
    const go: ControlFrame = { ...EMPTY_FRAME, drive: { left: 1, right: 1 } };
    let yuko: RefEvent | undefined;
    for (let k = 0; k < 480 * 6 && !yuko; k++) {
      const live = m.ref.s.phase === 'fight' || m.ref.s.phase === 'deciding';
      yuko = m.step(live ? [go, EMPTY_FRAME] : [EMPTY_FRAME, EMPTY_FRAME]).find((e) => e.type === 'yuko');
    }
    expect(yuko).toMatchObject({ to: [1] });
    const t = m.outTouches[0]!;
    expect(t).not.toBeNull();
    expect(Math.hypot(t.point.x, t.point.z)).toBeGreaterThan(0.385);
    // o replay guarda o instante do toque
    expect(m.replay[0].t).toBeLessThanOrEqual(t.t);
    m.dispose();
  });
});

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
