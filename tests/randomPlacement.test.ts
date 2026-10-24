import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rng, normalizeSeed, randomSeed } from '../src/sim/rng';
import { RANDOM_EDGE_MARGIN, defaultPlacement, footprint, placementIssue, randomPlacement } from '../src/sim/placement';
import { ARENA } from '../src/sim/arena';
import { PRESETS, clonePreset } from '../src/sim/presets';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_DT } from '../src/sim/modes';
import { SparringBot } from '../src/control/sparringBot';
import { EMPTY_FRAME, type ControlFrame, type Pose2D, type RobotSpec } from '../src/sim/types';
import type { RefEvent } from '../src/sim/referee';
import { loadSettings } from '../src/ui/storage';

const legal = (spec: RobotSpec, p: Pose2D, player: number) =>
  placementIssue(spec, p, player) === null &&
  [p.x, p.z, p.yaw].every(Number.isFinite) &&
  footprint(spec, p).every(([x, z]) => Math.hypot(x, z) <= ARENA.dohyoRadius - RANDOM_EDGE_MARGIN + 1e-9);

describe('Rng com semente', () => {
  it('mesma semente = mesma sequência; sementes diferentes divergem', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(sa);
  });

  it('fica em [0, 1) e é aproximadamente uniforme', () => {
    const r = new Rng(7);
    const bins = new Array(10).fill(0);
    for (let k = 0; k < 20000; k++) {
      const v = r.next();
      expect(v >= 0 && v < 1).toBe(true);
      bins[Math.floor(v * 10)]++;
    }
    for (const n of bins) expect(Math.abs(n - 2000)).toBeLessThan(200);
  });

  it('semente inválida (NaN, ∞, fração, negativa) não quebra o gerador', () => {
    for (const s of [NaN, Infinity, -Infinity, 1.9, -5, 2 ** 40]) {
      const n = normalizeSeed(s);
      expect(Number.isInteger(n) && n >= 0 && n < 2 ** 32).toBe(true);
      expect(Number.isFinite(new Rng(s).next())).toBe(true);
    }
    expect(normalizeSeed(1.9)).toBe(1);
  });

  it('randomSeed gera inteiros de 32 bits variados', () => {
    const seeds = new Set(Array.from({ length: 20 }, randomSeed));
    expect(seeds.size).toBeGreaterThan(15);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });
});

describe('sorteio de pose (Art. 10)', () => {
  it('todas as poses sorteadas são legais, para todos os presets e os dois lados', () => {
    const rng = new Rng(2024);
    for (const p of PRESETS) {
      const spec = clonePreset(p.id);
      for (const player of [0, 1]) {
        for (let k = 0; k < 400; k++) {
          const pose = randomPlacement(spec, player, rng);
          expect(legal(spec, pose, player)).toBe(true);
          // fica do lado certo da arena
          expect(pose.x * (player === 0 ? 1 : -1)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('é variado: giro em todas as direções, lateral e distância espalhadas', () => {
    const spec = clonePreset('trator');
    const rng = new Rng(99);
    const poses = Array.from({ length: 600 }, () => randomPlacement(spec, 0, rng));
    const quadrants = new Set(poses.map((p) => Math.floor(((p.yaw + Math.PI) / (2 * Math.PI)) * 4)));
    expect(quadrants.size).toBe(4); // inclusive de costas para o rival
    const zs = poses.map((p) => p.z);
    expect(Math.min(...zs)).toBeLessThan(-0.06);
    expect(Math.max(...zs)).toBeGreaterThan(0.06);
    const xs = poses.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.15);
    // praticamente nenhuma repetição
    expect(new Set(poses.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`)).size).toBeGreaterThan(590);
  });

  it('robôs no limite de tamanho (100 × 100 mm) e pequenos também saem legais', () => {
    const rng = new Rng(5);
    for (const [L, W] of [
      [0.1, 0.1],
      [0.06, 0.06],
      [0.1, 0.06],
    ]) {
      const spec = { ...clonePreset('bloco'), length: L, width: W };
      for (let k = 0; k < 300; k++) for (const player of [0, 1]) expect(legal(spec, randomPlacement(spec, player, rng), player)).toBe(true);
    }
  });

  it('robô impossível (maior que a área) cai no padrão sem travar nem gerar NaN', () => {
    const spec = { ...clonePreset('bloco'), length: 0.7, width: 0.7 };
    const p = randomPlacement(spec, 0, new Rng(1));
    expect([p.x, p.z, p.yaw].every(Number.isFinite)).toBe(true);
  });
});

describe('Match com posicionamento aleatório', () => {
  const specs = (): [RobotSpec, RobotSpec] => [clonePreset('trator'), clonePreset('kunai')];

  it('desligado: posições padrão (comportamento antigo intacto)', async () => {
    const m = await Match.create({ specs: specs(), mode: MODES.realista, seed: 123 });
    expect(m.randomPlacement).toBe(false);
    expect(m.placements[0]).toEqual(defaultPlacement(m.specs[0], 0));
    expect(m.placements[1]).toEqual(defaultPlacement(m.specs[1], 1));
    m.dispose();
  });

  it('ligado: os dois robôs (inclusive o bot) começam numa pose sorteada e legal; a física vai para ela', async () => {
    const m = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed: 123 });
    m.step([EMPTY_FRAME, EMPTY_FRAME]);
    for (const i of [0, 1]) {
      expect(legal(m.specs[i], m.placements[i], i)).toBe(true);
      expect(m.placements[i]).not.toEqual(defaultPlacement(m.specs[i], i));
      const st = m.lastSnapshot.robots[i].position;
      expect(st.x).toBeCloseTo(m.placements[i].x, 3);
      expect(st.z).toBeCloseTo(m.placements[i].z, 3);
    }
    m.dispose();
  });

  it('mesma semente = mesmas posições; outra semente = outras posições', async () => {
    const a = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed: 777 });
    const b = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed: 777 });
    const c = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed: 778 });
    expect(b.placements).toEqual(a.placements);
    expect(c.placements).not.toEqual(a.placements);
    for (const m of [a, b, c]) m.dispose();
  });

  it('trava os ajustes: mouse, teclado e entradas inválidas não mexem na pose sorteada', async () => {
    const m = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed: 9 });
    const drawn = structuredClone(m.placements);
    const evil: ControlFrame[] = [
      { ...EMPTY_FRAME, placeTarget: { x: 0.06, z: 0, yaw: Math.PI } },
      { ...EMPTY_FRAME, place: { forward: 0.2, side: 0.2, yaw: 4 } },
      { ...EMPTY_FRAME, placeTarget: { x: NaN, z: Infinity, yaw: NaN } },
      { ...EMPTY_FRAME, drive: { left: 1, right: 1 } },
    ];
    for (const f of evil) for (let k = 0; k < 60; k++) m.step([f, f]);
    expect(m.placements).toEqual(drawn);
    expect(m.ref.s.phase).toBe('placement');
    // "Pronto" continua funcionando
    m.step([{ ...EMPTY_FRAME, ready: true }, { ...EMPTY_FRAME, ready: true }]);
    expect(m.ref.s.phase).toBe('countdown');
    m.dispose();
  });

  async function botRun(seed: number) {
    const m = await Match.create({ specs: specs(), mode: MODES.realista, randomPlacement: true, seed });
    const bots = [new SparringBot('dificil'), new SparringBot('dificil')];
    const rounds: [Pose2D, Pose2D][] = [structuredClone(m.placements)];
    const events: RefEvent[] = [];
    let t = 0;
    while (m.ref.s.phase !== 'over' && t < 400) {
      const frames = [0, 1].map((i) =>
        bots[i].poll({ me: i, phase: m.ref.s.phase, dt: PHYSICS_DT, snapshot: m.lastSnapshot, placement: m.placements[i] }),
      ) as [ControlFrame, ControlFrame];
      const ev = m.step(frames);
      for (const e of ev) if (e.type === 'phase' && e.phase === 'placement') rounds.push(structuredClone(m.placements));
      events.push(...ev);
      t += PHYSICS_DT;
    }
    const phase = m.ref.s.phase;
    m.dispose();
    return { rounds, events, phase };
  }

  it('cada round sorteia de novo, sempre legal, e a partida bot × bot termina', async () => {
    const { rounds, phase } = await botRun(31337);
    expect(phase).toBe('over');
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    for (const r of rounds) for (const i of [0, 1]) expect(legal(specs()[i], r[i], i)).toBe(true);
    for (let k = 1; k < rounds.length; k++) expect(rounds[k]).not.toEqual(rounds[k - 1]);
  }, 60_000);

  it('partida inteira é determinística com a mesma semente (base do online)', async () => {
    const a = await botRun(4242);
    const b = await botRun(4242);
    expect(b.rounds).toEqual(a.rounds);
    expect(b.events).toEqual(a.events);
  }, 120_000);
});

describe('configuração salva', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (raw: string) => {
    const store = new Map([['sumo500.settings.v1', raw]]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  };

  it('aceita booleano e rejeita valores adulterados', () => {
    const defaults = { randomPlacement: false, replay: true };
    for (const [raw, expected] of [
      ['{"randomPlacement":true}', true],
      ['{"randomPlacement":"true"}', false],
      ['{"randomPlacement":1}', false],
      ['{"randomPlacement":{"__proto__":{"x":1}}}', false],
      ['não é json', false],
    ] as const) {
      stub(raw);
      expect(loadSettings(defaults).randomPlacement).toBe(expected);
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
