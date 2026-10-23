import { describe, expect, it } from 'vitest';
import { Referee, type RefEvent, type RefFacts, type RobotFact } from '../src/sim/referee';

const DT = 1 / 480;

function robot(over: Partial<RobotFact> = {}): RobotFact {
  return {
    touchingOutside: false,
    hangingWheels: 0,
    speed: 0.3,
    angSpeed: 0,
    movedFromStart: 0,
    turnedFromStart: 0,
    pushing: false,
    radius: 0.1,
    ready: true,
    ...over,
  };
}
function facts(a: Partial<RobotFact> = {}, b: Partial<RobotFact> = {}, extra: Partial<RefFacts> = {}): RefFacts {
  return { dt: DT, robots: [robot(a), robot(b)], inContact: true, distanceRate: 0, ...extra };
}

/** Roda o juiz por `seconds` com os mesmos fatos, devolve os eventos */
function run(ref: Referee, seconds: number, f: RefFacts | (() => RefFacts)): RefEvent[] {
  const out: RefEvent[] = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) out.push(...ref.update(typeof f === 'function' ? f() : f));
  return out;
}

/** Leva o juiz até a fase de luta */
function toFight(ref: Referee) {
  run(ref, DT, facts()); // ambos prontos -> contagem
  expect(ref.s.phase).toBe('countdown');
  run(ref, ref.rules.countdownTime + 0.01, facts({ speed: 0 }, { speed: 0 }));
  expect(ref.s.phase).toBe('fight');
}
/** Sai da tela de ponto até o próximo posicionamento */
function skipPoint(ref: Referee) {
  run(ref, ref.rules.pointDisplayTime + 0.01, facts({ ready: false }, { ready: false }));
}

describe('Juiz — regulamento RoboCore', () => {
  it('robô que toca fora dá Yuko ao oponente (Art. 13)', () => {
    const ref = new Referee();
    toFight(ref);
    run(ref, 0.2, facts());
    const ev = run(ref, 0.6, facts({}, { touchingOutside: true }));
    const y = ev.find((e) => e.type === 'yuko');
    expect(y).toMatchObject({ to: [0], reason: 'yuko' });
    expect(ref.s.scores).toEqual([1, 0]);
  });

  it('dois Yuko vencem a partida (Art. 8)', () => {
    const ref = new Referee();
    for (let k = 0; k < 2; k++) {
      toFight(ref);
      run(ref, 0.6, facts({}, { touchingOutside: true }));
      if (k === 0) skipPoint(ref);
    }
    expect(ref.s.phase).toBe('over');
    expect(ref.s.winner).toBe(0);
  });

  it('saída simultânea = Torinaoshi e o round não conta (Art. 12)', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 0.1, facts({ touchingOutside: true }, { touchingOutside: true }));
    expect(ev.some((e) => e.type === 'torinaoshi')).toBe(true);
    skipPoint(ref);
    expect(ref.s.round).toBe(1);
    expect(ref.s.scores).toEqual([0, 0]);
  });

  it('atacante com iniciativa que sai primeiro ainda pontua (Art. 13, item 3)', () => {
    const ref = new Referee();
    toFight(ref);
    run(ref, 0.3, facts({ pushing: true }));
    run(ref, 0.1, facts({ pushing: true, touchingOutside: true }));
    const ev = run(ref, 0.5, facts({ touchingOutside: true }, { touchingOutside: true }));
    expect(ev.find((e) => e.type === 'yuko')).toMatchObject({ to: [0], reason: 'iniciativa' });
  });

  it('sem iniciativa, quem toca fora primeiro perde mesmo se o outro sair depois', () => {
    const ref = new Referee();
    toFight(ref);
    run(ref, 0.3, facts());
    run(ref, 0.1, facts({ touchingOutside: true }));
    const ev = run(ref, 0.5, facts({ touchingOutside: true }, { touchingOutside: true }));
    expect(ev.find((e) => e.type === 'yuko')).toMatchObject({ to: [1], reason: 'yuko' });
  });

  it('roda além da borda por 3 s = Shinitai (Art. 14)', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 3.1, facts({ hangingWheels: 1 }));
    expect(ev.find((e) => e.type === 'yuko')).toMatchObject({ to: [1], reason: 'shinitai' });
  });

  it('robô parado sem contato por 3 s = Hansoku (Art. 17)', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 3.1, facts({}, { speed: 0 }, { inContact: false, distanceRate: -0.2 }));
    expect(ev.find((e) => e.type === 'yuko')).toMatchObject({ to: [0], reason: 'hansoku-parado' });
  });

  it('travados em contato por 3 s = Torinaoshi (Art. 12)', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 3.1, facts({ speed: 0 }, { speed: 0 }, { inContact: true }));
    expect(ev.some((e) => e.type === 'torinaoshi')).toBe(true);
  });

  it('se movendo sem contato e sem se aproximar por 3 s = Hansoku para os dois', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 3.1, facts({}, {}, { inContact: false, distanceRate: 0.05 }));
    expect(ev.find((e) => e.type === 'yuko')).toMatchObject({ to: [0, 1], reason: 'hansoku-sem-combate' });
  });

  it('a regra de não-combate pode ser desligada', () => {
    const ref = new Referee({ noCombatRule: false });
    toFight(ref);
    const ev = run(ref, 3.5, facts({}, {}, { inContact: false, distanceRate: 0.05 }));
    expect(ev.some((e) => e.type === 'yuko')).toBe(false);
  });

  it('aproximando-se não conta como fuga', () => {
    const ref = new Referee();
    toFight(ref);
    const ev = run(ref, 3.5, facts({}, {}, { inContact: false, distanceRate: -0.3 }));
    expect(ev.some((e) => e.type === 'yuko')).toBe(false);
  });

  it('mexer antes do bip = Keikoku e volta para o posicionamento (Art. 16)', () => {
    const ref = new Referee();
    run(ref, DT, facts());
    const ev = run(ref, DT, facts({ movedFromStart: 0.01 }));
    expect(ev.find((e) => e.type === 'keikoku')).toMatchObject({ to: 0 });
    expect(ref.s.phase).toBe('placement');
    expect(ref.s.keikoku).toEqual([1, 0]);
  });

  it('dois Keikoku = Yuko para o oponente', () => {
    const ref = new Referee();
    for (let k = 0; k < 2; k++) {
      run(ref, DT, facts());
      run(ref, DT, facts({ movedFromStart: 0.01 }));
    }
    expect(ref.s.scores).toEqual([0, 1]);
  });

  it('atraso de mais de 30 s no posicionamento = Keikoku', () => {
    const ref = new Referee();
    const ev = run(ref, 30.1, facts({ ready: false }, { ready: true }));
    expect(ev.find((e) => e.type === 'keikoku')).toMatchObject({ to: 0 });
    expect(ref.s.phase).toBe('countdown');
  });

  it('fim do round por tempo; 1 ponto no fim dos 3 rounds vence (Art. 8)', () => {
    const ref = new Referee({ roundTime: 2, noCombatRule: false });
    toFight(ref);
    run(ref, 0.6, facts({}, { touchingOutside: true }));
    skipPoint(ref);
    for (let k = 0; k < 2; k++) {
      toFight(ref);
      const ev = run(ref, 2.1, facts({ speed: 0.2 }, { speed: 0.2 }, { inContact: true }));
      expect(ev.some((e) => e.type === 'timeUp')).toBe(true);
      skipPoint(ref);
    }
    expect(ref.s.phase).toBe('over');
    expect(ref.s.winner).toBe(0);
  });

  it('0 x 0 com domínio claro decide por Yusei (Art. 15)', () => {
    const ref = new Referee({ roundTime: 2 });
    for (let k = 0; k < 3; k++) {
      toFight(ref);
      run(ref, 2.1, facts({ pushing: true, radius: 0.05 }, { radius: 0.3 }));
      skipPoint(ref);
    }
    expect(ref.s.winner).toBe(0);
    expect(ref.s.endReason).toMatch(/Yusei/);
  });

  it('0 x 0 equilibrado vai para prorrogação; ponto na prorrogação vence', () => {
    const ref = new Referee({ roundTime: 1 });
    for (let k = 0; k < 3; k++) {
      toFight(ref);
      run(ref, 1.1, facts());
      skipPoint(ref);
    }
    expect(ref.s.extension).toBe(true);
    expect(ref.s.phase).toBe('placement');
    toFight(ref);
    expect(ref.roundDuration).toBe(180);
    run(ref, 0.6, facts({ touchingOutside: true }));
    expect(ref.s.phase).toBe('over');
    expect(ref.s.winner).toBe(1);
  });
});
